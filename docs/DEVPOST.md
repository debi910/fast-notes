# Fast Notes: Devpost write-up

> **DRAFT ON MOCK DATA.** Run `pipeline\run_real.ps1` first; this file regenerates with the real numbers.

_Paste each section into the matching Devpost field. Before pasting, check the TRMI line under "How we built it" says exactly what your team did. Generated from the data on 2026-10-31 by `pipeline/make_writeup.py`._

## Tagline

Crowd fact-checks that land while a post is still spreading, not a day later.

## Inspiration

> "[MOCK] The chart cuts the y-axis at 40%, exaggerating the change. Full chart linked."
>
> A real Community Note. It was written 3.7 hours after the post. The ratings that settled it were in by hour 4.2. Readers saw it **13.9 hours** after it was written.

That gap is normal. X's Community Notes take a median **18.1 hours** to appear, while half of a post's reposts happen in the first **5.75 hours** (Chuai et al., arXiv:2409.08781). Only 11.5% of notes ever reach a verdict (Razuvayevskaya et al., arXiv:2510.12559).

The delay is not people being lazy. A note only counts as helpful when raters who **usually disagree** both rate it helpful. X waits for those raters to wander by. We asked: what if you went and got them?

## What it does

Fast Notes is a live room for one note. Everyone who joins does a 15-second calibration that places them on a viewpoint axis (we just call the sides A and B). The room then shows which side is still missing and **routes the next person from that side to rate**. As ratings land, a bridging model refits in the browser and the bridge between the two sides fills in. When both sides agree, the verdict locks.

- **Try it alone in 30 seconds:** real raters' real ratings are replayed as bots, so one judge can watch the mechanic work.
- **Try it together:** press Invite, scan the QR with a phone, and you become the missing side.
- **See the evidence:** the Results page replays real notes in three orders: X's real order, random, and ours.

## Our result, on real data

On 20 real notes that X rated helpful, asking the missing side first reaches the same verdict after a median of **5 ratings**. Random arrival needs **5.8**, and X's real order needed **18**, which took **5.5 hours** to arrive. X showed those notes after a median of **7.1 hours**.

Our model agrees with X's real status on **100%** of 70 sampled notes (3,151 real ratings from 200 raters, X data snapshot n/a).

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

A "rater dispatch" that runs many rooms at once and sends each new arrival to the note that needs their side most, and a pilot with a newsroom's fact-check desk during a breaking event.

## Built with

nextjs, typescript, react, tailwindcss, motion, supabase, supabase-realtime, vercel, python, pandas, numpy, jsonschema, qrcode, x-community-notes-data, trmi
