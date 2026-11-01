"""Write docs/DEVPOST.md from the numbers in web/public/data/*.json.

Run after build_real.py (run_real.ps1 does it for you). Every number in the
write-up comes from the data files, so the Devpost text can't drift from the site.
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"


def hours(h: float | None) -> str:
    if h is None:
        return "n/a"
    if h < 1:
        return f"{round(h * 60)} minutes"
    return f"{h:.1f} hours"


def num(x: float) -> str:
    return f"{x:.0f}" if float(x).is_integer() else f"{x:.1f}"


def main() -> None:
    res = json.loads((DATA / "results.json").read_text(encoding="utf-8"))
    show = json.loads((DATA / "showcase_notes.json").read_text(encoding="utf-8"))
    s, smp, agr = res["summary"], res["sample"], res["modelAgreement"]
    mock = res.get("isMock", True)

    # Story note: the showcase note with the longest wait on X.
    timed = [n for n in show["notes"] if n["timeline"].get("hoursNoteToStatus") and n["replay"].get("hoursToKActual") is not None]
    # Prefer notes written soon after the post (a story about a post that is still spreading).
    fresh = [n for n in timed if (n["timeline"].get("hoursPostToNote") or 1e9) <= 12] or timed
    # An English-speaking judge reads this first: keep it plain English and off charged topics.
    charged = re.compile(r"epstein|trump|biden|harris|election|israel|gaza|hamas|idf|palestin|ukrain|russia|abortion|vaccin|covid|muslim|jewish|nazi|genocide|terror", re.I)
    english = re.compile(r"\b(the|is|was|not|this|and)\b", re.I)
    calm = [
        n for n in fresh
        if not charged.search(n["summary"]) and english.search(n["summary"]) and sum(c.isascii() for c in n["summary"]) / max(1, len(n["summary"])) > 0.95
    ]
    fresh = calm or fresh
    story = max(fresh, key=lambda n: n["timeline"]["hoursNoteToStatus"] - n["replay"]["hoursToKActual"], default=None)

    ratio = s["medianKActual"] / s["medianKTargeted"] if s["medianKTargeted"] else 1
    if ratio >= 1.25:
        claim = (
            f"On {s['nReplayed']} real notes that X rated helpful, asking the missing side first reaches the same verdict "
            f"after a median of **{num(s['medianKTargeted'])} ratings**. Random arrival needs **{num(s['medianKRandom'])}**, and X's real "
            f"order needed **{num(s['medianKActual'])}**, which took **{hours(s['medianHoursToKActual'])}** to arrive. "
            f"X showed those notes after a median of **{hours(s['medianHoursNoteToStatus'])}**."
        )
    else:
        claim = (
            f"On {s['nReplayed']} real notes that X rated helpful, the ratings that decide the verdict were in after a median of "
            f"**{hours(s['medianHoursToKActual'])}**, but X showed the note after **{hours(s['medianHoursNoteToStatus'])}**. "
            f"The crowd had already agreed; readers just couldn't see it yet. A Fast Notes room scores every rating as it lands, "
            f"so the verdict locks the moment it exists.\n\n"
            f"We also tested whether asking the missing side first needs fewer ratings. Honestly, on this sample it doesn't: the median is "
            f"{num(s['medianKTargeted'])} ratings either way, because most notes settle at the five-rating minimum. Targeting beat random "
            f"order on {s['pctTargetedFaster']:.0f}% of notes and lost on {100 - s['pctTargetedNoSlower']:.0f}%. Where we think the room "
            f"matters most is the 88.5% of notes that never settle on X. We couldn't test that from public data, because those notes never "
            f"got the ratings a replay needs."
        )

    story_md = ""
    if story:
        t = story["timeline"]
        story_md = (
            f"> \"{html.unescape(story['summary'])}\"\n>\n"
            f"> A real Community Note. It was written {hours(t.get('hoursPostToNote'))} after the post. "
            f"The ratings that settled it were in by hour {story['replay']['hoursToKActual']:.1f}. "
            f"Readers saw it **{hours(t['hoursNoteToStatus'])}** after it was written.\n"
        )

    warn = "\n> **DRAFT ON MOCK DATA.** Run `pipeline\\run_real.ps1` first; this file regenerates with the real numbers.\n" if mock else ""

    md = f"""# Fast Notes: Devpost write-up
{warn}
_Paste each section into the matching Devpost field. Before pasting, check the TRMI line under "How we built it" says exactly what your team did. Generated from the data on {res['generatedAt'][:10]} by `pipeline/make_writeup.py`._

## Tagline

Crowd fact-checks that land while a post is still spreading, not a day later.

## Inspiration

{story_md}
That gap is normal. X's Community Notes take a median **18.1 hours** to appear, while half of a post's reposts happen in the first **5.75 hours** (Chuai et al., arXiv:2409.08781). Only 11.5% of notes ever reach a verdict (Razuvayevskaya et al., arXiv:2510.12559).

The delay is not people being lazy. A note only counts as helpful when raters who **usually disagree** both rate it helpful. X waits for those raters to wander by. We asked: what if you went and got them?

## What it does

Fast Notes is a live room for one note. Everyone who joins does a 15-second calibration that places them on a viewpoint axis (we just call the sides A and B). The room then shows which side is still missing and **routes the next person from that side to rate**. As ratings land, a bridging model refits in the browser and the bridge between the two sides fills in. When both sides agree, the verdict locks.

- **Try it alone in 30 seconds:** real raters' real ratings are replayed as bots, so one judge can watch the mechanic work.
- **Try it together:** press Invite, scan the QR with a phone, and you become the missing side.
- **Watch a crowd:** the Live page runs six real notes at once. Real raters arrive one by one and a dispatcher sends each to the note that is most short of their side. Press "Join the crowd" and the dispatcher sends you too.
- **See the evidence:** the Results page replays real notes in three orders: X's real order, random, and ours.

## Our result, on real data

{claim}

Our model agrees with X's real status on **{agr['pctAgreement']:.0f}%** of {agr['nCompared']} sampled notes ({smp['nRatings']:,} real ratings from {smp['nRaters']:,} raters, X data snapshot {smp.get('dataSnapshotDate') or 'n/a'}).

## How we built it

- **Data:** the public X Community Notes download (notes, status history, ratings), streamed in chunks with pandas.
- **Model:** our own one-dimensional bridging matrix factorisation, `rating ≈ μ + i_user + i_note + f_user · f_note`, after the open-source Community Notes scorer. Cut-offs are calibrated to X's real statuses on our sample.
- **Replay:** for each helpful note we refit after every rating and count how many it takes until the verdict is final, in X's order, 50 random orders and our "missing side first" order.
- **App:** Next.js, TypeScript and Tailwind. The same refit runs in TypeScript in the browser on every rating. Supabase Realtime keeps everyone in a room in sync, with a BroadcastChannel fallback.
- **TRMI:** we built it as a two-person team in one TRMI room. One of us owned the data pipeline and model, the other the live room, and we agreed the JSON schemas between them on day one. Screenshots of us working in TRMI are in the README.

## Challenges

- The ratings files are huge, so we stream them and count before we load anything.
- Our model is fitted on a sample, so its scale differs from X's. We calibrate the cut-offs and report the agreement as it comes out.
- Keeping a room consistent when people join mid-vote: one host browser owns the state and everyone else follows it.

## What's real and what's simulated

- **Real:** note text, ratings, rater viewpoints (anonymised), X's real timings and statuses, the replay numbers.
- **Simulated:** how fast people arrive in a live room (one rating every ~30 seconds), and the bots in solo mode, which replay real raters' real ratings.
- **Not built:** any connection to X. Fast Notes is a standalone room.

## What's next

Run the dispatcher on real arrivals, not simulated ones: an opt-in rater pool that gets a push notification when a note is missing their side, and a pilot with a newsroom's fact-check desk during a breaking event.

## Built with

nextjs, typescript, react, tailwindcss, motion, supabase, supabase-realtime, vercel, python, pandas, numpy, jsonschema, qrcode, x-community-notes-data, trmi
"""
    out = ROOT / "docs" / "DEVPOST.md"
    out.parent.mkdir(exist_ok=True)
    out.write_text(md, encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)}{' (mock draft)' if mock else ''}")


if __name__ == "__main__":
    main()
