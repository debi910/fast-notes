"""Build the REAL web data from public Community Notes files in data/raw/.

Steps (see fast-notes BUILD_PROMPT Part 1):
  1. Load notes + status history; pick candidate notes.
  2. Stream the ratings file(s) in chunks, keeping only candidate notes.
  3. Keep notes with >= MIN_NOTE_RATINGS ratings and raters with >= MIN_RATER_RATINGS.
  4. Fit the 1-D bridging model  rating ~ mu + i_u + i_n + f_u * f_n  by alternating ridge solves.
  5. Compare our verdicts with X's status (agreement %).
  6. Replay every X-helpful note: actual vs random vs targeted order.
  7. Export web/public/data/{showcase_notes,raters,results}.json (isMock=false, anonymised raters).

Usage (repo root):  pipeline\\.venv\\Scripts\\python.exe pipeline\\build_real.py [--max-notes 1000]
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from fastnotes.refit import ModelParams, refit_note, replay_note, verdict

ROOT = Path(__file__).resolve().parents[1]
RAW = Path(os.environ.get("FASTNOTES_RAW", ROOT / "data" / "raw"))
OUT = Path(os.environ.get("FASTNOTES_OUT", ROOT / "web" / "public" / "data"))
TWITTER_EPOCH_MS = 1288834974657
MIN_NOTE_RATINGS = 30
MIN_RATER_RATINGS = 10
MAX_SHOWCASE_RATINGS = 150
N_SHUFFLES = 50
LEVEL = {"HELPFUL": 1.0, "SOMEWHAT_HELPFUL": 0.5, "NOT_HELPFUL": 0.0}
X_STATUS = {"CURRENTLY_RATED_HELPFUL", "CURRENTLY_RATED_NOT_HELPFUL", "NEEDS_MORE_RATINGS"}


def find(stem: str) -> list[str]:
    hits = sorted(glob.glob(str(RAW / f"{stem}*.zip")) + glob.glob(str(RAW / f"{stem}*.tsv")))
    # prefer .tsv over .zip of the same file
    seen: dict[str, str] = {}
    for h in hits:
        key = Path(h).stem
        if key not in seen or h.endswith(".tsv"):
            seen[key] = h
    return sorted(seen.values())


def read_tsv(path: str, usecols: list[str], **kw) -> pd.DataFrame:
    header = pd.read_csv(path, sep="\t", nrows=0).columns
    cols = [c for c in usecols if c in header]
    return pd.read_csv(path, sep="\t", usecols=cols, quoting=3, on_bad_lines="skip", low_memory=False, **kw)


def snowflake_ms(tweet_id: str) -> int | None:
    try:
        return (int(tweet_id) >> 22) + TWITTER_EPOCH_MS
    except (TypeError, ValueError):
        return None


def clean_text(s: object) -> str:
    t = re.sub(r"\s+", " ", str(s or "")).strip()
    return t


# ───────────────────────── 1-3. sample ─────────────────────────


def load_sample(max_notes: int, since_days: int, seed: int) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, list[str]]:
    notes_f, status_f, ratings_f = find("notes-"), find("noteStatusHistory-"), find("ratings-")
    if not (notes_f and status_f and ratings_f):
        sys.exit(f"Missing files in {RAW}. Need notes-00000, noteStatusHistory-00000 and at least one ratings-000XX (zip or tsv). Run download.py.")
    print("files:", [Path(p).name for p in notes_f + status_f + ratings_f])

    notes = read_tsv(notes_f[0], ["noteId", "createdAtMillis", "tweetId", "classification", "summary"], dtype={"noteId": str, "tweetId": str})
    status = read_tsv(
        status_f[0],
        ["noteId", "createdAtMillis", "timestampMillisOfFirstNonNMRStatus", "firstNonNMRStatus", "currentStatus"],
        dtype={"noteId": str},
    )
    status = status[status["currentStatus"].isin(X_STATUS)]

    # Pass 1: count ratings per note in the ratings file(s) we actually have.
    # X splits ratings across many files and we only download one or two, so the
    # date range they cover is unknown. Pick candidates from what is really there
    # instead of assuming "the last N days" (which can match nothing).
    known = set(status["noteId"])
    counts = pd.Series(dtype="int64")
    t0 = time.time()
    for rf in ratings_f:
        for i, ch in enumerate(pd.read_csv(rf, sep="\t", usecols=["noteId"], dtype={"noteId": str}, chunksize=4_000_000, quoting=3, on_bad_lines="skip")):
            vc = ch["noteId"][ch["noteId"].isin(known)].value_counts()
            counts = counts.add(vc, fill_value=0)
            print(f"\r  counting {Path(rf).name} chunk {i + 1} ({time.time() - t0:.0f}s)", end="", flush=True)
        print()
    rich = counts[counts >= MIN_NOTE_RATINGS].index
    pool = status[status["noteId"].isin(rich)].copy()
    if pool.empty:
        sys.exit("No note has enough ratings in the downloaded ratings file(s). Download another one: download.py --ratings 2")
    if since_days > 0:
        cutoff = pool["createdAtMillis"].max() - since_days * 86_400_000
        recent = pool[pool["createdAtMillis"] >= cutoff]
        if len(recent) >= max_notes:
            pool = recent
    # Keep the most recent notes per status (plenty of headroom for the later filters).
    pool = pool.sort_values("createdAtMillis", ascending=False).groupby("currentStatus", group_keys=False).head(max_notes * 3)
    status = pool
    cand = set(status["noteId"])
    print(f"candidate notes with >= {MIN_NOTE_RATINGS} ratings in sample: {len(cand):,} (of {len(rich):,})")

    parts = []
    t0 = time.time()
    for rf in ratings_f:
        cols = ["noteId", "raterParticipantId", "createdAtMillis", "helpfulnessLevel", "helpful", "notHelpful"]
        header = pd.read_csv(rf, sep="\t", nrows=0).columns
        use = [c for c in cols if c in header]
        for i, ch in enumerate(pd.read_csv(rf, sep="\t", usecols=use, dtype={"noteId": str, "raterParticipantId": str}, chunksize=2_000_000, quoting=3, on_bad_lines="skip")):
            ch = ch[ch["noteId"].isin(cand)]
            if "helpfulnessLevel" in ch:
                v = ch["helpfulnessLevel"].map(LEVEL)
            else:
                v = pd.Series(np.nan, index=ch.index)
            if "helpful" in ch:
                v = v.fillna(ch["helpful"].map({1: 1.0})).fillna(ch.get("notHelpful", pd.Series(dtype=float)).map({1: 0.0}))
            ch = ch.assign(value=v).dropna(subset=["value"])[["noteId", "raterParticipantId", "createdAtMillis", "value"]]
            parts.append(ch)
            print(f"\r  {Path(rf).name} chunk {i + 1}: kept {sum(len(p) for p in parts):,} ratings ({time.time() - t0:.0f}s)", end="", flush=True)
        print()
    if not parts:
        sys.exit("Ratings file(s) had no rows. Check data/raw/.")
    ratings = pd.concat(parts, ignore_index=True).drop_duplicates(["noteId", "raterParticipantId"], keep="last")

    # Iterative filter: notes >= 30 ratings, raters >= 10.
    for _ in range(5):
        nc = ratings["noteId"].value_counts()
        ratings = ratings[ratings["noteId"].isin(nc[nc >= MIN_NOTE_RATINGS].index)]
        rc = ratings["raterParticipantId"].value_counts()
        ratings = ratings[ratings["raterParticipantId"].isin(rc[rc >= MIN_RATER_RATINGS].index)]
    nc = ratings["noteId"].value_counts()
    keep = set(nc[nc >= MIN_NOTE_RATINGS].index)

    st = status[status["noteId"].isin(keep)]
    rng = np.random.default_rng(seed)
    caps = {"CURRENTLY_RATED_HELPFUL": int(max_notes * 0.4), "CURRENTLY_RATED_NOT_HELPFUL": int(max_notes * 0.15), "NEEDS_MORE_RATINGS": int(max_notes * 0.45)}
    chosen = []
    for s, cap in caps.items():
        ids = st.loc[st["currentStatus"] == s, "noteId"].to_numpy()
        chosen += list(rng.choice(ids, size=min(cap, len(ids)), replace=False)) if len(ids) else []
    chosen_set = set(chosen)
    ratings = ratings[ratings["noteId"].isin(chosen_set)]
    rc = ratings["raterParticipantId"].value_counts()
    ratings = ratings[ratings["raterParticipantId"].isin(rc[rc >= 3].index)]
    print(f"sample: {len(chosen_set):,} notes, {ratings['raterParticipantId'].nunique():,} raters, {len(ratings):,} ratings")
    return notes[notes["noteId"].isin(chosen_set)], st[st["noteId"].isin(chosen_set)], ratings, [Path(p).name for p in ratings_f]


# ───────────────────────── 4. model fit ─────────────────────────


def fit(ratings: pd.DataFrame, p: ModelParams, iters: int, seed: int):
    n_idx, note_ids = pd.factorize(ratings["noteId"])
    u_idx, rater_ids = pd.factorize(ratings["raterParticipantId"])
    y = ratings["value"].to_numpy(float)
    N, U = len(note_ids), len(rater_ids)
    rng = np.random.default_rng(seed)
    i_n, f_n = np.zeros(N), rng.normal(0, 0.1, N)
    i_u, f_u = np.zeros(U), rng.normal(0, 0.1, U)
    mu = float(y.mean())

    def solve(idx, K, other_i, other_f, resid_base):
        # per-entity 2x2 ridge: [n+li, Σf; Σf, Σf²+lf] [i; f] = [Σy'; Σf y']
        yp = resid_base - other_i
        n = np.bincount(idx, minlength=K).astype(float)
        sf = np.bincount(idx, other_f, K)
        sff = np.bincount(idx, other_f * other_f, K)
        sy = np.bincount(idx, yp, K)
        sfy = np.bincount(idx, other_f * yp, K)
        a11, a12, a22 = n + p.lambda_intercept, sf, sff + p.lambda_factor
        det = a11 * a22 - a12 * a12
        return (a22 * sy - a12 * sfy) / det, (a11 * sfy - a12 * sy) / det

    for it in range(iters):
        i_n, f_n = solve(n_idx, N, i_u[u_idx], f_u[u_idx], y - mu)
        i_u, f_u = solve(u_idx, U, i_n[n_idx], f_n[n_idx], y - mu)
        pred = mu + i_u[u_idx] + i_n[n_idx] + f_u[u_idx] * f_n[n_idx]
        mu += float((y - pred).mean())
        if it % 10 == 0 or it == iters - 1:
            rmse = float(np.sqrt(((y - pred) ** 2).mean()))
            print(f"  iter {it:3d}  rmse {rmse:.4f}  mu {mu:.3f}")

    # Orient: Side A = negative factor = the larger group, so labels are stable across runs.
    if (f_u < 0).sum() < (f_u > 0).sum():
        f_u, f_n = -f_u, -f_n
    return mu, dict(zip(note_ids, zip(i_n, f_n))), dict(zip(rater_ids, zip(i_u, f_u)))


# ───────────────────────── 5-7. replay + export ─────────────────────────


def calibrate_thresholds(ratings: pd.DataFrame, p: ModelParams, rater_par: dict, status: pd.DataFrame) -> ModelParams:
    """Pick the helpful / not-helpful intercept cut-offs that best match X's real statuses.

    Our 1-D model is fitted on a sample of raters, so its intercept scale differs from
    X's production scorer. Rather than copy X's 0.40, choose the cut-offs on a grid so our
    verdicts agree with X as often as possible, and report that agreement honestly."""
    st = status.set_index("noteId")["currentStatus"]
    want = {"CURRENTLY_RATED_HELPFUL": "HELPFUL", "CURRENTLY_RATED_NOT_HELPFUL": "NOT_HELPFUL", "NEEDS_MORE_RATINGS": "UNDECIDED"}
    fits = []
    for nid, g in ratings.groupby("noteId"):
        vals = g["value"].to_numpy(float)
        ri = np.array([rater_par[u][0] for u in g["raterParticipantId"]])
        rf = np.array([rater_par[u][1] for u in g["raterParticipantId"]])
        i_n, f_n = refit_note(vals, ri, rf, p)
        fits.append((i_n, f_n, len(vals), want[st[nid]]))
    best = (-1.0, p)
    for hi in np.arange(0.05, 0.61, 0.025):
        for lo in np.arange(-0.40, 0.11, 0.025):
            if lo > hi - 0.1:
                continue
            for mf in (0.4, 0.5, 0.6, 0.8):
                q = ModelParams(mu=p.mu, helpful_intercept_min=round(float(hi), 3), not_helpful_intercept_max=round(float(lo), 3), max_abs_factor=mf)
                acc = sum(verdict(i, f, n, q) == w for i, f, n, w in fits) / max(1, len(fits))
                if acc > best[0] + 1e-9:
                    best = (acc, q)
    q = best[1]
    print(f"calibrated cut-offs: helpful i_n >= {q.helpful_intercept_min}, |f_n| < {q.max_abs_factor}; not helpful i_n <= {q.not_helpful_intercept_max} (agreement {best[0]:.1%})")
    return q


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-notes", type=int, default=1000)
    ap.add_argument("--since-days", type=int, default=365)
    ap.add_argument("--iters", type=int, default=40)
    ap.add_argument("--seed", type=int, default=11)
    args = ap.parse_args()

    notes, status, ratings, ratings_files = load_sample(args.max_notes, args.since_days, args.seed)
    print("fitting model…")
    p0 = ModelParams(mu=0.0)
    mu, note_par, rater_par = fit(ratings, p0, args.iters, args.seed)
    P = calibrate_thresholds(ratings, ModelParams(mu=round(mu, 4)), rater_par, status)

    abs_f = np.abs(np.array([f for _, f in rater_par.values()]))
    side_threshold = round(float(np.quantile(abs_f, 0.2)), 3)

    rmap: dict[str, str] = {}

    def anon(pid: str) -> str:
        if pid not in rmap:
            rmap[pid] = f"r{len(rmap) + 1:05d}"
        return rmap[pid]

    notes_by_id = notes.set_index("noteId")
    status_by_id = status.set_index("noteId")
    groups = {k: g.sort_values("createdAtMillis") for k, g in ratings.groupby("noteId")}

    per_note, records = [], {}
    t0 = time.time()
    for j, (nid, g) in enumerate(groups.items()):
        st = status_by_id.loc[nid]
        vals = g["value"].to_numpy(float)
        ri = np.array([rater_par[u][0] for u in g["raterParticipantId"]])
        rf = np.array([rater_par[u][1] for u in g["raterParticipantId"]])
        i_n, f_n = refit_note(vals, ri, rf, P)
        ours = verdict(i_n, f_n, len(vals), P)
        x_status = st["currentStatus"]
        note_ms = int(st["createdAtMillis"])
        first = st.get("timestampMillisOfFirstNonNMRStatus")
        h_status = (float(first) - note_ms) / 3.6e6 if x_status != "NEEDS_MORE_RATINGS" and pd.notna(first) and float(first) > 0 else None
        rep = {"kActual": None, "kRandomMedian": None, "kTargeted": None, "targetedOrder": []}
        if x_status == "CURRENTLY_RATED_HELPFUL" and ours == "HELPFUL":
            rep = replay_note(vals, ri, rf, P, n_shuffles=N_SHUFFLES, seed=j)
        hours = (g["createdAtMillis"].to_numpy(float) - note_ms) / 3.6e6
        h_k = float(hours[rep["kActual"] - 1]) if rep["kActual"] else None
        per_note.append(
            {
                "noteId": nid,
                "nRatings": int(len(vals)),
                "xStatus": x_status,
                "ourVerdict": ours,
                "kActual": rep["kActual"],
                "kRandomMedian": rep["kRandomMedian"],
                "kTargeted": rep["kTargeted"],
                "hoursToKActual": round(h_k, 2) if h_k is not None else None,
                "hoursNoteToStatus": round(h_status, 2) if h_status is not None else None,
            }
        )
        records[nid] = dict(g=g, vals=vals, ri=ri, rf=rf, i_n=i_n, f_n=f_n, ours=ours, x=x_status, note_ms=note_ms, h_status=h_status, hours=hours, rep=rep, h_k=h_k)
        if j % 50 == 0:
            print(f"\r  replay {j + 1}/{len(groups)} ({time.time() - t0:.0f}s)", end="", flush=True)
    print()

    def has_text(nid: str) -> bool:
        return nid in notes_by_id.index and 20 <= len(clean_text(notes_by_id.loc[nid, "summary"])) <= 320

    # Showcase: helpful notes where targeting helps most, plus stuck and unhelpful ones.
    ok = [r for r in per_note if has_text(r["noteId"]) and r["nRatings"] <= MAX_SHOWCASE_RATINGS]
    helpful = sorted(
        (r for r in ok if r["kTargeted"] and r["kRandomMedian"] and r["hoursNoteToStatus"]),
        key=lambda r: (r["kRandomMedian"] - r["kTargeted"], r["hoursNoteToStatus"]),
        reverse=True,
    )[:20]
    stuck = [r for r in ok if r["xStatus"] == "NEEDS_MORE_RATINGS"][:6]
    nothelp = [r for r in ok if r["xStatus"] == "CURRENTLY_RATED_NOT_HELPFUL" and r["ourVerdict"] == "NOT_HELPFUL"][:4]
    showcase_ids = [r["noteId"] for r in helpful + stuck + nothelp]

    # Calibration: decided notes spread along f_n, so 5 answers place a viewer.
    dec = sorted((r for r in ok if records[r["noteId"]]["ours"] != "UNDECIDED" and r["noteId"] not in showcase_ids), key=lambda r: records[r["noteId"]]["f_n"])
    if len(dec) < 5:
        dec = sorted((r for r in ok if r["noteId"] not in showcase_ids), key=lambda r: records[r["noteId"]]["f_n"])
    calib_ids = [dec[int(q * (len(dec) - 1))]["noteId"] for q in (0, 0.2, 0.5, 0.8, 1.0)] if len(dec) >= 5 else []
    calib_ids = list(dict.fromkeys(calib_ids))

    def export(idx: int, nid: str) -> dict:
        r = records[nid]
        n = notes_by_id.loc[nid]
        post_ms = snowflake_ms(n["tweetId"])
        t_status = r["note_ms"] + int(r["h_status"] * 3.6e6) if r["h_status"] is not None else None
        rep = r["rep"]
        users = list(r["g"]["raterParticipantId"])
        return {
            "id": f"n{idx:03d}",
            "noteId": str(nid),
            "tweetId": str(n["tweetId"]),
            "summary": clean_text(n["summary"]),
            "classification": n["classification"] if n["classification"] in ("MISINFORMED_OR_POTENTIALLY_MISLEADING", "NOT_MISLEADING") else "MISINFORMED_OR_POTENTIALLY_MISLEADING",
            "timeline": {
                "postCreatedAtMs": post_ms,
                "noteCreatedAtMs": r["note_ms"],
                "statusChangedAtMs": t_status,
                "finalStatus": r["x"],
                "hoursPostToNote": round((r["note_ms"] - post_ms) / 3.6e6, 2) if post_ms else None,
                "hoursNoteToStatus": round(r["h_status"], 2) if r["h_status"] is not None else None,
            },
            "fitted": {"intercept": round(float(r["i_n"]), 4), "factor": round(float(r["f_n"]), 4), "verdict": r["ours"]},
            "ratings": [
                {
                    "raterId": anon(u),
                    "value": 0.5 if v == 0.5 else int(v),
                    "hoursAfterNote": round(float(h), 3),
                    "raterIntercept": round(float(a), 4),
                    "raterFactor": round(float(b), 4),
                }
                for u, v, h, a, b in zip(users, r["vals"], r["hours"], r["ri"], r["rf"])
            ],
            "replay": {
                "kActual": rep["kActual"],
                "kRandomMedian": rep["kRandomMedian"],
                "kTargeted": rep["kTargeted"],
                "hoursToKActual": round(r["h_k"], 2) if r["h_k"] is not None else None,
                "targetedOrder": [anon(users[k]) for k in rep["targetedOrder"]],
            },
        }

    all_ids = showcase_ids + [c for c in calib_ids if c not in showcase_ids]
    exported = [export(i + 1, nid) for i, nid in enumerate(all_ids)]
    by_note = {e["noteId"]: e["id"] for e in exported}
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    snap = (RAW / "SNAPSHOT_DATE").read_text().strip() if (RAW / "SNAPSHOT_DATE").exists() else None

    showcase = {
        "schemaVersion": 1,
        "isMock": False,
        "generatedAt": now,
        "model": {
            "mu": P.mu,
            "lambdaIntercept": P.lambda_intercept,
            "lambdaFactor": P.lambda_factor,
            "helpfulInterceptMin": P.helpful_intercept_min,
            "maxAbsFactor": P.max_abs_factor,
            "notHelpfulInterceptMax": P.not_helpful_intercept_max,
            "minRatings": P.min_ratings,
            "ratingValues": {"HELPFUL": 1, "SOMEWHAT_HELPFUL": 0.5, "NOT_HELPFUL": 0},
        },
        "calibrationNoteIds": [by_note[c] for c in calib_ids],
        "notes": exported,
    }

    # Raters: everyone who appears in exported notes (bots), sample viewers at both poles + centre.
    in_show = {u for nid in all_ids for u in records[nid]["g"]["raterParticipantId"]}
    counts = ratings["raterParticipantId"].value_counts()
    prof = sorted(in_show, key=lambda u: rater_par[u][1])
    sample = {prof[0], prof[-1], min(prof, key=lambda u: abs(rater_par[u][1]))}

    def side(f: float) -> str:
        return "C" if abs(f) < side_threshold else ("A" if f < 0 else "B")

    raters = {
        "schemaVersion": 1,
        "isMock": False,
        "generatedAt": now,
        "sideThreshold": side_threshold,
        "raters": [
            {
                "id": anon(u),
                "intercept": round(float(rater_par[u][0]), 4),
                "factor": round(float(rater_par[u][1]), 4),
                "side": side(float(rater_par[u][1])),
                "nRatings": int(counts[u]),
                "isSampleViewer": u in sample,
            }
            for u in prof
        ],
    }

    rep_rows = [r for r in per_note if r["xStatus"] == "CURRENTLY_RATED_HELPFUL" and None not in (r["kActual"], r["kRandomMedian"], r["kTargeted"])]
    med = lambda key: float(np.median([r[key] for r in rep_rows if r[key] is not None])) if rep_rows else 0.0  # noqa: E731
    confusion: dict[str, int] = {}
    for r in per_note:
        k = f"{r['xStatus']}->{r['ourVerdict']}"
        confusion[k] = confusion.get(k, 0) + 1
    match = {"CURRENTLY_RATED_HELPFUL": "HELPFUL", "CURRENTLY_RATED_NOT_HELPFUL": "NOT_HELPFUL", "NEEDS_MORE_RATINGS": "UNDECIDED"}
    agree = sum(match[r["xStatus"]] == r["ourVerdict"] for r in per_note)
    results = {
        "schemaVersion": 1,
        "isMock": False,
        "generatedAt": now,
        "sample": {
            "ratingsFiles": ratings_files,
            "dataSnapshotDate": snap,
            "nNotes": len(per_note),
            "nHelpfulNotes": sum(r["xStatus"] == "CURRENTLY_RATED_HELPFUL" for r in per_note),
            "nNmrNotes": sum(r["xStatus"] == "NEEDS_MORE_RATINGS" for r in per_note),
            "nRatings": int(len(ratings)),
            "nRaters": int(ratings["raterParticipantId"].nunique()),
            "minRatingsPerNote": MIN_NOTE_RATINGS,
            "minRatingsPerRater": MIN_RATER_RATINGS,
            "nShuffles": N_SHUFFLES,
        },
        "modelAgreement": {"pctAgreement": round(100 * agree / max(1, len(per_note)), 1), "nCompared": len(per_note), "confusion": confusion},
        "summary": {
            "nReplayed": len(rep_rows),
            "medianKTargeted": med("kTargeted"),
            "medianKRandom": med("kRandomMedian"),
            "medianKActual": med("kActual"),
            "medianHoursToKActual": round(med("hoursToKActual"), 2),
            "medianHoursNoteToStatus": round(med("hoursNoteToStatus"), 2),
            "pctTargetedFaster": round(100 * sum(r["kTargeted"] < r["kRandomMedian"] for r in rep_rows) / max(1, len(rep_rows)), 1),
            "pctTargetedNoSlower": round(100 * sum(r["kTargeted"] <= r["kRandomMedian"] for r in rep_rows) / max(1, len(rep_rows)), 1),
        },
        "perNote": per_note,
    }

    OUT.mkdir(parents=True, exist_ok=True)
    for name, obj in [("showcase_notes.json", showcase), ("raters.json", raters), ("results.json", results)]:
        (OUT / name).write_text(json.dumps(obj, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(results["summary"], indent=1))
    print(f"agreement with X: {results['modelAgreement']['pctAgreement']}% of {len(per_note)} notes")
    print(f"showcase {len(showcase_ids)} notes + {len(calib_ids)} calibration; {len(raters['raters'])} rater profiles")
    print("Next: pipeline\\.venv\\Scripts\\python.exe pipeline\\validate_data.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
