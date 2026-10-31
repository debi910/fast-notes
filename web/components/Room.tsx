"use client";

import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bridge } from "@/components/room/Bridge";
import { Feed, NoteCard, Race, Settled, Steps, UnderTheHood, WhoIsHere, YourSeat } from "@/components/room/Panels";
import type { Placed, RoomMsg, RoomState } from "@/components/room/shared";
import { buildBrief } from "@/lib/brief";
import { findNote, loadRaters, loadShowcase, useData } from "@/lib/data";
import { EASE_OUT } from "@/lib/motion";
import { missingSide, refitNote, sideOf, verdict } from "@/lib/model";
import { makePeer, type Peer, useRoomChannel } from "@/lib/realtime";
import type { ModelConfig, NoteRating, RatingValue, ShowcaseNote, Verdict } from "@/lib/types";
import { readViewer, sampleViewer, type Viewer } from "@/lib/viewer";

const DECIDED_STREAK_TO_LOCK = 3;
/** With other humans in the room, don't stall forever on someone who walked away. */
const MULTI_WAIT_MS = 15000;

/** Live version of targeted_order in pipeline/fastnotes/refit.py: next rater comes from the
 *  factor sign with less accumulated |f_u| (humans included), largest |f_u| first. */
function pickNext(remaining: NoteRating[], placed: Placed[]): NoteRating {
  let massA = 0;
  let massB = 0;
  for (const p of placed) {
    if (p.raterFactor > 0) massB += Math.abs(p.raterFactor);
    else massA += Math.abs(p.raterFactor);
  }
  const wantPositive = massA > massB;
  const pool = remaining.filter((r) => r.raterFactor > 0 === wantPositive);
  let best: NoteRating | null = null;
  for (const r of pool.length ? pool : remaining) {
    if (!best || Math.abs(r.raterFactor) > Math.abs(best.raterFactor)) best = r;
  }
  return best!;
}

function verdictPath(placed: Placed[], m: ModelConfig): Verdict[] {
  return placed.map((_, k) => {
    const prefix = placed.slice(0, k + 1);
    const e = refitNote(prefix, m);
    return verdict(e.intercept, e.factor, prefix.length, m);
  });
}

const fresh = (round = 0): RoomState => ({ round, placed: [], phase: "running", waitingFor: null, waitStartedAt: null, asked: [] });

export function Room({ roomId }: { roomId: string }) {
  const showcase = useData(loadShowcase);
  const raters = useData(loadRaters);
  const error = showcase.error ?? raters.error;
  if (error) return <p className="p-6 text-late">{error}</p>;
  if (!showcase.data || !raters.data) return <RoomSkeleton />;
  const note = findNote(showcase.data, roomId);
  return (
    <RoomInner
      key={note.id}
      note={note}
      allNotes={showcase.data.notes}
      model={showcase.data.model}
      threshold={raters.data.sideThreshold}
      isMock={showcase.data.isMock}
      fallbackViewer={sampleViewer(raters.data)}
    />
  );
}

function RoomSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[1.6fr_1fr]">
      {[260, 320, 200].map((h, i) => (
        <div key={i} className="card animate-pulse bg-surface-2/60" style={{ height: h }} />
      ))}
    </div>
  );
}

function RoomInner({
  note,
  allNotes,
  model,
  threshold,
  isMock,
  fallbackViewer,
}: {
  note: ShowcaseNote;
  allNotes: ShowcaseNote[];
  model: ModelConfig;
  threshold: number;
  isMock: boolean;
  fallbackViewer: Viewer;
}) {
  const [viewer] = useState<Viewer>(() => readViewer() ?? fallbackViewer);
  const [me] = useState<Peer>(() => makePeer(viewer));
  const [state, setState] = useState<RoomState>(() => fresh());

  const onMessage = useCallback(
    (msg: RoomMsg) => {
      if (msg.t === "state") {
        setState((cur) => {
          // Keep my own rating if the host hasn't seen it yet.
          const mine = cur.placed.find((p) => p.raterId === me.id);
          if (mine && msg.s.round === cur.round && !msg.s.placed.some((p) => p.raterId === me.id)) {
            return { ...msg.s, placed: [...msg.s.placed, mine] };
          }
          return msg.s;
        });
      } else if (msg.t === "rate") {
        setState((cur) =>
          cur.placed.some((p) => p.raterId === msg.p.raterId)
            ? cur
            : { ...cur, placed: [...cur.placed, msg.p], phase: cur.phase === "settled" ? "settled" : "running", waitingFor: null },
        );
      } else if (msg.t === "restart") {
        setState((cur) => fresh(cur.round + 1));
      }
    },
    [me.id],
  );

  const { peers, send, status } = useRoomChannel<RoomMsg>(`room:${note.id}`, me, onMessage);
  const humans = peers.some((p) => p.id === me.id) ? peers : [me, ...peers];
  const hostId = humans.reduce((h, p) => (p.joinedAt < h.joinedAt || (p.joinedAt === h.joinedAt && p.id < h.id) ? p : h), humans[0]).id;
  const isHost = hostId === me.id;
  const peersKey = humans
    .map((p) => p.id)
    .sort()
    .join(",");

  const { placed, phase } = state;
  const est = useMemo(() => {
    const e = refitNote(placed, model);
    return { ...e, verdict: verdict(e.intercept, e.factor, placed.length, model) };
  }, [placed, model]);
  const miss = missingSide(placed, threshold, model);
  const target = Math.max(2, Math.ceil(model.minRatings / 2));
  const myRating = placed.find((p) => p.raterId === me.id)?.value ?? null;

  // Host broadcasts the room whenever it changes or someone joins.
  useEffect(() => {
    if (isHost && humans.length > 1) send({ t: "state", from: me.id, s: state });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, state, peersKey]);

  // Host drives the room: lock, wait for a needed human, or seat the next real rater.
  useEffect(() => {
    if (!isHost || phase === "settled") return;
    const delay = phase === "waiting" ? (humans.length > 1 ? MULTI_WAIT_MS : 1000) : placed.length === 0 ? 900 : placed.length < 10 ? 1100 : 500;
    const id = setTimeout(() => {
      setState((cur) => {
        if (cur.phase === "settled") return cur;
        const placedNow = cur.placed;
        if (cur.phase === "waiting") {
          const stillHere = humans.some((h) => h.id === cur.waitingFor);
          const timedOut = humans.length > 1 && Date.now() - (cur.waitStartedAt ?? 0) >= MULTI_WAIT_MS - 100;
          if (stillHere && !timedOut) return cur;
          return { ...cur, phase: "running", waitingFor: null, waitStartedAt: null };
        }
        const path = verdictPath(placedNow, model);
        let streak = 0;
        for (let i = path.length - 1; i >= 0 && path[i] !== "UNDECIDED" && path[i] === path[path.length - 1]; i--) streak++;
        const bots = placedNow.filter((p) => p.kind === "bot").length;
        const kTarget = note.replay.kTargeted ?? Infinity;
        if (streak > 0 && (bots >= kTarget || streak >= DECIDED_STREAK_TO_LOCK)) return { ...cur, phase: "settled" };
        const used = new Set(placedNow.map((p) => p.raterId));
        const remaining = note.ratings.filter((r) => !used.has(r.raterId));
        if (remaining.length === 0) return { ...cur, phase: "settled" };

        const need = missingSide(placedNow, threshold, model).side;
        if (placedNow.length >= 1 && need) {
          const ask = humans.find((h) => h.side === need && !used.has(h.id) && !cur.asked.includes(h.id));
          if (ask) return { ...cur, phase: "waiting", waitingFor: ask.id, waitStartedAt: Date.now(), asked: [...cur.asked, ask.id] };
        }
        const r = pickNext(remaining, placedNow);
        const p: Placed = {
          kind: "bot",
          raterId: r.raterId,
          value: r.value,
          raterIntercept: r.raterIntercept,
          raterFactor: r.raterFactor,
          side: sideOf(r.raterFactor, threshold),
        };
        return { ...cur, placed: [...placedNow, p] };
      });
    }, delay);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, phase, placed, peersKey, model, note, threshold]);

  function rate(value: RatingValue) {
    if (myRating !== null || phase === "settled") return;
    const p: Placed = {
      kind: "human",
      raterId: me.id,
      name: me.name,
      value,
      raterIntercept: viewer.intercept,
      raterFactor: viewer.factor,
      side: viewer.side,
    };
    setState((cur) => ({ ...cur, placed: [...cur.placed, p], phase: "running", waitingFor: cur.waitingFor === me.id ? null : cur.waitingFor }));
    send({ t: "rate", p });
  }

  function restart() {
    setState((cur) => fresh(cur.round + 1));
    send({ t: "restart" });
  }

  const nextNote = allNotes.find((n) => n.fitted.verdict !== "UNDECIDED" && n.id !== note.id) ?? null;
  const brief = buildBrief(note, placed, est, threshold, model);
  const a = placed.filter((p) => p.side === "A").length;
  const b = placed.filter((p) => p.side === "B").length;
  const needed = state.waitingFor === me.id || (miss.side === viewer.side && phase !== "settled");

  let headline: string;
  if (phase === "settled") headline = "Settled.";
  else if (state.waitingFor === me.id) headline = `Your side is missing. Rate below to keep the room moving.`;
  else if (state.waitingFor) headline = `Waiting for ${humans.find((h) => h.id === state.waitingFor)?.name ?? "a rater"} from Side ${miss.side}.`;
  else if (placed.length === 0) headline = "Opening the room…";
  else if (miss.side) headline = `Side ${miss.side} hasn't weighed in enough. Bringing in ${miss.need} more.`;
  else if (est.verdict === "UNDECIDED") headline = "Both sides are here. Waiting for them to agree.";
  else headline = "Both sides agree. Confirming it holds…";

  const seat = (
    <YourSeat me={me} viewer={viewer} needed={needed} myRating={myRating} phase={phase} noteId={note.id} onRate={rate} />
  );

  return (
    <div className="relative">
      <div className="dot-grid pointer-events-none absolute inset-x-0 top-0 h-80 [mask-image:linear-gradient(black,transparent)]" />
      <div className="relative mx-auto grid w-full max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0 space-y-5">
          {isMock && (
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-side-b" />
              Mock data while the real Community Notes replay is computed
            </p>
          )}

          <NoteCard note={note} />

          <div className="lg:hidden">{seat}</div>

          {phase === "settled" && (
            <Settled verdict={est.verdict} n={placed.length} note={note} onReplay={restart} nextId={nextNote?.id ?? null} isMock={isMock} />
          )}

          <section className="card overflow-hidden">
            <div className="px-5 pt-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-semibold">Is there a bridge between the sides?</h2>
                <span className="tabular text-xs text-muted">{placed.length} rating{placed.length === 1 ? "" : "s"}</span>
              </div>
              <motion.p
                key={headline}
                initial={{ opacity: 0, filter: "blur(3px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className="mt-1 text-sm text-muted"
                aria-live="polite"
              >
                {headline}
              </motion.p>
            </div>
            <div className="px-2 pt-2">
              <Bridge placed={placed} target={target} verdict={est.verdict} missing={miss.side} phase={phase} />
            </div>
            <div className="border-t border-line/70 p-4">
              <Steps n={placed.length} minRatings={model.minRatings} a={a} b={b} target={target} verdict={est.verdict} />
            </div>
          </section>

          <Race note={note} ratings={placed.length} phase={phase} />

          <UnderTheHood placed={placed} est={est} model={model} brief={brief} meId={me.id} />
        </div>

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-20 lg:self-start">
          <div className="hidden lg:block">{seat}</div>
          <WhoIsHere peers={humans} me={me} placed={placed} status={status} waitingFor={state.waitingFor} noteId={note.id} />
          <Feed placed={placed} meId={me.id} />
        </aside>
      </div>
    </div>
  );
}
