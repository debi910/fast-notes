"""Generate MOCK web data (clearly flagged isMock=true) so the web app can be built
before the real Community Notes pipeline runs. Ratings are synthesised from the same
model the real pipeline fits, so the room behaves realistically.

Usage (from repo root):  pipeline\\.venv\\Scripts\\python.exe pipeline\\make_mock.py
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from fastnotes.refit import ModelParams, replay_note

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "public" / "data"
SEED = 7
N_RATERS = 200
N_NOTES = 30
N_EXTRA_NMR = 40  # only in results.json perNote
SIDE_THRESHOLD = 0.15
TWITTER_EPOCH_MS = 1288834974657

rng = np.random.default_rng(SEED)
P = ModelParams(mu=0.15)

# Raters: bimodal factor, small intercepts.
side_sign = rng.choice([-1, 1], size=N_RATERS)
rater_f = np.clip(side_sign * np.abs(rng.normal(0.55, 0.3, N_RATERS)), -1.2, 1.2)
rater_i = rng.normal(0.0, 0.08, N_RATERS)
rater_ids = [f"r{1000 + j:04d}" for j in range(N_RATERS)]


def side_of(f: float) -> str:
    return "C" if abs(f) < SIDE_THRESHOLD else ("A" if f < 0 else "B")


def quantise(x: float) -> float:
    return 1.0 if x >= 0.7 else (0.5 if x >= 0.35 else 0.0)


MOCK_TEXTS = [
    "[MOCK] The photo is from 2019, not this week. Reverse image search shows the original upload.",
    "[MOCK] The quoted figure is the annual total, not the monthly one. Official release linked.",
    "[MOCK] This video is from a different city. The street signs match the original location.",
    "[MOCK] The bill described here has not passed; it is still in committee.",
    "[MOCK] The chart cuts the y-axis at 40%, exaggerating the change. Full chart linked.",
    "[MOCK] The quote is fabricated; it does not appear in the transcript of the speech.",
    "[MOCK] Polling places are not closing early. The county election office confirms normal hours.",
    "[MOCK] The study cited was retracted in 2024. Retraction notice linked.",
]


def make_note(idx: int, kind: str) -> dict:
    """kind: 'helpful' (bridging), 'partisan' (one side only), 'nmr' (mixed, weak)."""
    if kind == "helpful":
        i_n, f_n = rng.uniform(0.45, 0.65), rng.normal(0, 0.15)
    elif kind == "partisan":
        i_n, f_n = rng.uniform(0.15, 0.35), rng.choice([-1, 1]) * rng.uniform(0.6, 0.9)
    else:
        i_n, f_n = rng.uniform(-0.1, 0.3), rng.normal(0, 0.3)

    n = int(rng.integers(30, 61))
    who = rng.choice(N_RATERS, size=n, replace=False)
    # Real arrival is lumpy: the side that "owns" the topic shows up first.
    early_side = rng.choice([-1, 1])
    bias = np.where(np.sign(rater_f[who]) == early_side, 0.0, rng.uniform(2, 10))
    t = rng.exponential(3.0, n) + bias + rng.exponential(1.0, n)
    order = np.argsort(t)
    who, t = who[order], t[order]

    raw = P.mu + rater_i[who] + i_n + rater_f[who] * f_n + rng.normal(0, 0.18, n)
    values = np.array([quantise(x) for x in raw])

    rep = replay_note(values, rater_i[who], rater_f[who], P, n_shuffles=50, seed=idx)
    k_actual = rep["kActual"]
    hours_to_k = float(t[k_actual - 1]) if k_actual else None

    note_created_ms = int(datetime(2026, 10, 27, 12, tzinfo=timezone.utc).timestamp() * 1000) + idx * 3_600_000
    hours_post_to_note = float(rng.uniform(1.5, 9.0))
    post_ms = note_created_ms - int(hours_post_to_note * 3_600_000)
    tweet_id = ((post_ms - TWITTER_EPOCH_MS) << 22) | int(rng.integers(0, 1 << 22))

    if rep["finalVerdict"] == "HELPFUL":
        status = "CURRENTLY_RATED_HELPFUL"
        h_status = (hours_to_k or float(t[-1])) + float(rng.uniform(0.5, 3.0))
    elif rep["finalVerdict"] == "NOT_HELPFUL":
        status = "CURRENTLY_RATED_NOT_HELPFUL"
        h_status = float(t[-1]) + float(rng.uniform(0.5, 3.0))
    else:
        status, h_status = "NEEDS_MORE_RATINGS", None

    return {
        "id": f"n{idx:03d}",
        "noteId": str(1_900_000_000_000_000_000 + idx),
        "tweetId": str(tweet_id),
        "summary": MOCK_TEXTS[idx % len(MOCK_TEXTS)],
        "classification": "MISINFORMED_OR_POTENTIALLY_MISLEADING",
        "timeline": {
            "postCreatedAtMs": post_ms,
            "noteCreatedAtMs": note_created_ms,
            "statusChangedAtMs": note_created_ms + int(h_status * 3_600_000) if h_status is not None else None,
            "finalStatus": status,
            "hoursPostToNote": round(hours_post_to_note, 2),
            "hoursNoteToStatus": round(h_status, 2) if h_status is not None else None,
        },
        "fitted": {"intercept": round(rep["intercept"], 4), "factor": round(rep["factor"], 4), "verdict": rep["finalVerdict"]},
        "ratings": [
            {
                "raterId": rater_ids[j],
                "value": float(v) if v == 0.5 else int(v),
                "hoursAfterNote": round(float(h), 3),
                "raterIntercept": round(float(rater_i[j]), 4),
                "raterFactor": round(float(rater_f[j]), 4),
            }
            for j, v, h in zip(who, values, t)
        ],
        "replay": {
            "kActual": k_actual,
            "kRandomMedian": rep["kRandomMedian"],
            "kTargeted": rep["kTargeted"],
            "hoursToKActual": round(hours_to_k, 2) if hours_to_k is not None else None,
            "targetedOrder": [rater_ids[who[j]] for j in rep["targetedOrder"]],
        },
    }


def main() -> None:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    kinds = ["helpful"] * 22 + ["partisan"] * 4 + ["nmr"] * 4
    notes = [make_note(i + 1, k) for i, k in enumerate(kinds)]
    extra = [make_note(100 + i, "nmr") for i in range(N_EXTRA_NMR)]

    # Calibration: 5 decided notes with spread-out f_n.
    decided = sorted((n for n in notes if n["fitted"]["verdict"] != "UNDECIDED"), key=lambda n: n["fitted"]["factor"])
    picks = [decided[int(q * (len(decided) - 1))]["id"] for q in (0, 0.25, 0.5, 0.75, 1.0)]

    showcase = {
        "schemaVersion": 1,
        "isMock": True,
        "generatedAt": now,
        "model": {
            "mu": P.mu,
            "lambdaIntercept": P.lambda_intercept,
            "lambdaFactor": P.lambda_factor,
            "helpfulInterceptMin": P.helpful_intercept_min,
            "maxAbsFactor": P.max_abs_factor,
            "minRatings": P.min_ratings,
            "ratingValues": {"HELPFUL": 1, "SOMEWHAT_HELPFUL": 0.5, "NOT_HELPFUL": 0},
        },
        "calibrationNoteIds": picks,
        "notes": notes,
    }

    n_by_rater = {rid: 0 for rid in rater_ids}
    for n in notes + extra:
        for r in n["ratings"]:
            n_by_rater[r["raterId"]] += 1
    sample_viewers = {int(np.argmin(rater_f)), int(np.argmax(rater_f)), int(np.argmin(np.abs(rater_f)))}
    raters = {
        "schemaVersion": 1,
        "isMock": True,
        "generatedAt": now,
        "sideThreshold": SIDE_THRESHOLD,
        "raters": [
            {
                "id": rater_ids[j],
                "intercept": round(float(rater_i[j]), 4),
                "factor": round(float(rater_f[j]), 4),
                "side": side_of(float(rater_f[j])),
                "nRatings": n_by_rater[rater_ids[j]],
                "isSampleViewer": j in sample_viewers,
            }
            for j in range(N_RATERS)
        ],
    }

    all_notes = notes + extra
    per_note = [
        {
            "noteId": n["noteId"],
            "nRatings": len(n["ratings"]),
            "xStatus": n["timeline"]["finalStatus"],
            "ourVerdict": n["fitted"]["verdict"],
            "kActual": n["replay"]["kActual"],
            "kRandomMedian": n["replay"]["kRandomMedian"],
            "kTargeted": n["replay"]["kTargeted"],
            "hoursToKActual": n["replay"]["hoursToKActual"],
            "hoursNoteToStatus": n["timeline"]["hoursNoteToStatus"],
        }
        for n in all_notes
    ]
    rep = [p for p in per_note if p["xStatus"] == "CURRENTLY_RATED_HELPFUL" and None not in (p["kActual"], p["kRandomMedian"], p["kTargeted"])]
    med = lambda key: float(np.median([p[key] for p in rep]))  # noqa: E731
    confusion: dict[str, int] = {}
    for p in per_note:
        key = f"{p['xStatus']}->{p['ourVerdict']}"
        confusion[key] = confusion.get(key, 0) + 1
    agree = sum(
        (p["xStatus"] == "CURRENTLY_RATED_HELPFUL") == (p["ourVerdict"] == "HELPFUL") for p in per_note
    )
    results = {
        "schemaVersion": 1,
        "isMock": True,
        "generatedAt": now,
        "sample": {
            "ratingsFiles": ["MOCK"],
            "dataSnapshotDate": None,
            "nNotes": len(all_notes),
            "nHelpfulNotes": sum(p["xStatus"] == "CURRENTLY_RATED_HELPFUL" for p in per_note),
            "nNmrNotes": sum(p["xStatus"] == "NEEDS_MORE_RATINGS" for p in per_note),
            "nRatings": sum(p["nRatings"] for p in per_note),
            "nRaters": N_RATERS,
            "minRatingsPerNote": 30,
            "minRatingsPerRater": 10,
            "nShuffles": 50,
        },
        "modelAgreement": {
            # Mock X statuses are derived from our own verdicts, so this is trivially high. Real run will differ.
            "pctAgreement": round(100 * agree / len(per_note), 1),
            "nCompared": len(per_note),
            "confusion": confusion,
        },
        "summary": {
            "nReplayed": len(rep),
            "medianKTargeted": med("kTargeted"),
            "medianKRandom": med("kRandomMedian"),
            "medianKActual": med("kActual"),
            "medianHoursToKActual": round(med("hoursToKActual"), 2),
            "medianHoursNoteToStatus": round(med("hoursNoteToStatus"), 2),
            "pctTargetedFaster": round(100 * sum(p["kTargeted"] < p["kRandomMedian"] for p in rep) / len(rep), 1),
            "pctTargetedNoSlower": round(100 * sum(p["kTargeted"] <= p["kRandomMedian"] for p in rep) / len(rep), 1),
        },
        "perNote": per_note,
    }

    OUT.mkdir(parents=True, exist_ok=True)
    for name, obj in [("showcase_notes.json", showcase), ("raters.json", raters), ("results.json", results)]:
        (OUT / name).write_text(json.dumps(obj, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(results["summary"], indent=1))
    print("calibration:", picks, "| showcase verdicts:", {v: sum(n["fitted"]["verdict"] == v for n in notes) for v in ("HELPFUL", "NOT_HELPFUL", "UNDECIDED")})


if __name__ == "__main__":
    main()
