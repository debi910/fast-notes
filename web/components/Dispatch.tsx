"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SIDE_BG, SIDE_LABEL, SIDE_TEXT } from "@/components/ViewpointBar";
import { fmtDuration } from "@/components/room/shared";
import { loadRaters, loadShowcase, useData } from "@/lib/data";
import { isPlainEnglish } from "@/lib/display";
import { refitNote, sideOf, verdict } from "@/lib/model";
import { EASE_OUT } from "@/lib/motion";
import type { ModelConfig, NoteRating, RatingValue, ShowcaseNote, Side, Verdict } from "@/lib/types";
import { readViewer, type Viewer } from "@/lib/viewer";

// Live dispatch: several real notes at once. Real raters arrive one by one and
// the dispatcher sends each to the open note that is most short of their side.
// Every rating is that rater's real rating on that note. Arrival pace is simulated.

const N_NOTES = 6;
const TICK_MS = 650;
const SIM_MIN_PER_ARRIVAL = 0.2; // one arrival every 12 s across the whole crowd
const STREAK_TO_LOCK = 3;

interface Pt {
  raterId: string;
  value: RatingValue;
  raterIntercept: number;
  raterFactor: number;
  human?: boolean;
}

interface Lane {
  note: ShowcaseNote;
  placed: Pt[];
  remaining: NoteRating[];
  verdicts: Verdict[];
  settledAt: number | null; // sim minutes
  final: Verdict | null;
  flash: number;
}

interface Arrival {
  key: number;
  who: string;
  side: Side;
  to: string | null;
  human?: boolean;
}

function mass(placed: Pt[]) {
  let a = 0;
  let b = 0;
  for (const p of placed) {
    if (p.raterFactor < 0) a += Math.abs(p.raterFactor);
    else b += Math.abs(p.raterFactor);
  }
  return { a, b };
}

/** How badly a lane needs a rater with this factor sign (positive = needed). */
function deficit(l: Lane, factor: number): number {
  const { a, b } = mass(l.placed);
  return factor < 0 ? b - a : a - b;
}

function missing(l: Lane): "A" | "B" | null {
  if (l.settledAt !== null || l.placed.length === 0) return null;
  const { a, b } = mass(l.placed);
  if (Math.abs(a - b) < 0.15 && l.placed.length >= 2) return null;
  return a <= b ? "A" : "B";
}

function place(l: Lane, p: Pt, m: ModelConfig, clock: number): Lane {
  const placed = [...l.placed, p];
  const e = refitNote(placed, m);
  const v = verdict(e.intercept, e.factor, placed.length, m);
  const verdicts = [...l.verdicts, v];
  const tail = verdicts.slice(-STREAK_TO_LOCK);
  const locked = v !== "UNDECIDED" && tail.length === STREAK_TO_LOCK && tail.every((x) => x === v);
  const remaining = l.remaining.filter((r) => r.raterId !== p.raterId);
  const out = !locked && remaining.length === 0;
  return {
    ...l,
    placed,
    remaining,
    verdicts,
    settledAt: locked || out ? clock : null,
    final: locked ? v : out ? v : null,
    flash: l.flash + 1,
  };
}

function pickNotes(notes: ShowcaseNote[]): ShowcaseNote[] {
  const all = notes.filter((n) => n.fitted.verdict !== "UNDECIDED" && n.ratings.length >= 8);
  const plain = all.filter((n) => n.plainEnglish ?? isPlainEnglish(n.summary));
  const decided = plain.length >= N_NOTES ? plain : all;
  const helpful = decided
    .filter((n) => n.fitted.verdict === "HELPFUL")
    .sort((a, b) => (b.timeline.hoursNoteToStatus ?? 0) - (a.timeline.hoursNoteToStatus ?? 0));
  const other = decided.filter((n) => n.fitted.verdict !== "HELPFUL");
  return [...helpful.slice(0, N_NOTES - 1), ...other, ...helpful.slice(N_NOTES - 1)].slice(0, N_NOTES);
}

export function Dispatch() {
  const showcase = useData(loadShowcase);
  const raters = useData(loadRaters);
  const error = showcase.error ?? raters.error;
  if (error) return <p className="p-6 text-late">{error}</p>;
  if (!showcase.data || !raters.data)
    return (
      <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-10 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="card h-56 animate-pulse bg-surface-2/60" />
        ))}
      </div>
    );
  return <Board notes={pickNotes(showcase.data.notes)} model={showcase.data.model} threshold={raters.data.sideThreshold} isMock={showcase.data.isMock} />;
}

function Board({ notes, model, threshold, isMock }: { notes: ShowcaseNote[]; model: ModelConfig; threshold: number; isMock: boolean }) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const init = useCallback(
    (): Lane[] => notes.map((note) => ({ note, placed: [], remaining: [...note.ratings], verdicts: [], settledAt: null, final: null, flash: 0 })),
    [notes],
  );
  const [lanes, setLanes] = useState<Lane[]>(init);
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(false);
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [ask, setAsk] = useState<string | null>(null); // note id the human is asked to rate
  const askedRef = useRef<Set<string>>(new Set());
  const seq = useRef(0);

  const clock = tick * SIM_MIN_PER_ARRIVAL;
  const settled = lanes.filter((l) => l.settledAt !== null).length;
  const done = settled === lanes.length;
  const people = lanes.reduce((s, l) => s + l.placed.length, 0);
  const xHours = useMemo(() => {
    const hs = notes.map((n) => n.timeline.hoursNoteToStatus).filter((h): h is number => h !== null && h !== undefined).sort((a, b) => a - b);
    return hs.length ? hs[Math.floor(hs.length / 2)] : null;
  }, [notes]);

  // One arrival per timer step. Computed from the current lanes (no side effects inside state updaters).
  useEffect(() => {
    if (!running || done) return;
    const id = setTimeout(() => {
      const open = lanes.filter((l) => l.settledAt === null && l.remaining.length > 0);
      if (!open.length) return;
      // A real rater arrives: pick one at random from everyone who still has a rating to give.
      const pool = open.flatMap((l) => l.remaining);
      const who = pool[Math.floor(Math.random() * pool.length)];
      // Dispatcher: of the open notes this rater actually rated, send them where their side is most missing.
      const options = open.filter((l) => l.remaining.some((r) => r.raterId === who.raterId));
      const best = options.reduce((x, y) => (deficit(y, who.raterFactor) > deficit(x, who.raterFactor) ? y : x));
      const rating = best.remaining.find((r) => r.raterId === who.raterId)!;
      seq.current += 1;
      const now = (tick + 1) * SIM_MIN_PER_ARRIVAL;
      setTick((t) => t + 1);
      setArrivals((arr) => [{ key: seq.current, who: who.raterId, side: sideOf(who.raterFactor, threshold), to: best.note.id }, ...arr].slice(0, 7));
      setLanes((prev) =>
        prev.map((l) =>
          l.note.id === best.note.id
            ? place(l, { raterId: rating.raterId, value: rating.value, raterIntercept: rating.raterIntercept, raterFactor: rating.raterFactor }, model, now)
            : l,
        ),
      );
    }, reduce ? TICK_MS * 1.5 : TICK_MS);
    return () => clearTimeout(id);
  }, [running, done, lanes, tick, model, threshold, reduce]);

  // When a joined human's side is the one a note is missing, ask them once per note.
  useEffect(() => {
    if (!viewer || viewer.side === "C") return;
    if (ask && lanes.some((l) => l.note.id === ask && l.settledAt === null)) return;
    const need = lanes.find((l) => missing(l) === viewer.side && !askedRef.current.has(l.note.id) && l.placed.length >= 1);
    if (need) {
      askedRef.current.add(need.note.id);
      setAsk(need.note.id);
    }
  }, [lanes, viewer, ask]);

  function rateAsHuman(value: RatingValue) {
    if (!viewer || !ask) return;
    const id = ask;
    setAsk(null);
    seq.current += 1;
    setArrivals((a) => [{ key: seq.current, who: "you", side: viewer.side, to: id, human: true }, ...a].slice(0, 7));
    setLanes((prev) =>
      prev.map((l) =>
        l.note.id === id && l.settledAt === null
          ? place(l, { raterId: "you", value, raterIntercept: viewer.intercept, raterFactor: viewer.factor, human: true }, model, clock)
          : l,
      ),
    );
  }

  function restart() {
    setLanes(init());
    setTick(0);
    seq.current = 0;
    setArrivals([]);
    setAsk(null);
    askedRef.current = new Set();
    setRunning(true);
  }

  function join() {
    const v = readViewer();
    if (!v) {
      router.push(`/calibrate?next=${encodeURIComponent("/live?join=1")}`);
      return;
    }
    setViewer(v);
    if (!running) setRunning(true);
  }

  // Coming back from calibration with ?join=1 joins straight away.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("join") === "1") {
      const v = readViewer();
      if (v) {
        setViewer(v); // eslint-disable-line react-hooks/set-state-in-effect
        setRunning(true);
      }
    }
  }, []);

  const askLane = lanes.find((l) => l.note.id === ask && l.settledAt === null) ?? null;
  const fastest = lanes.filter((l) => l.settledAt !== null);
  const medianSettle = fastest.length ? [...fastest].map((l) => l.settledAt!).sort((a, b) => a - b)[Math.floor(fastest.length / 2)] : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
      <p className="text-sm font-semibold uppercase tracking-wider text-side-a">Live dispatch</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="max-w-[22ch] text-3xl font-semibold sm:text-4xl">Every rater goes where their side is missing.</h1>
          <p className="mt-3 max-w-[62ch] text-muted">
            {lanes.length} real notes need ratings. Real raters arrive one at a time, and the dispatcher sends each one to the open note that is
            most short of their viewpoint. Each rating is that rater&apos;s real rating on that note.
          </p>
        </div>
        <div className="flex gap-2">
          {!viewer && (
            <button onClick={join} className="pressable rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium hover:border-foreground/30">
              Join the crowd
            </button>
          )}
          <button
            onClick={() => (done || tick === 0 ? restart() : setRunning((r) => !r))}
            className="pressable rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            {tick === 0 ? "Start dispatch" : done ? "Run again" : running ? "Pause" : "Resume"}
          </button>
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        {[
          { k: "Simulated time", v: clock < 1 ? `${Math.round(clock * 60)} s` : `${clock.toFixed(1)} min` },
          { k: "People dispatched", v: String(people) },
          { k: "Notes settled", v: `${settled} / ${lanes.length}` },
          { k: "Same notes on X", v: xHours !== null ? `${fmtDuration(xHours)} median` : "n/a" },
        ].map((t) => (
          <div key={t.k} className="bg-surface px-4 py-3">
            <dt className="text-xs text-muted">{t.k}</dt>
            <dd className="tabular mt-0.5 text-xl font-semibold">{t.v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_17rem]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lanes.map((l) => (
            <LaneCard key={l.note.id} lane={l} threshold={threshold} youAsked={ask === l.note.id} />
          ))}
        </div>

        <aside className="space-y-4">
          <AnimatePresence>
            {askLane && viewer && (
              <motion.section
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.22, ease: EASE_OUT }}
                className="card fixed inset-x-4 bottom-4 z-40 border-2 border-foreground p-4 shadow-2xl lg:static lg:inset-auto lg:shadow-none"
              >
                <p className="text-sm font-semibold">
                  You&apos;re needed on {askLane.note.id.toUpperCase()}.{" "}
                  <span className={SIDE_TEXT[viewer.side]}>{SIDE_LABEL[viewer.side]} is missing.</span>
                </p>
                <p className="mt-2 line-clamp-4 text-sm text-muted">{askLane.note.summary}</p>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  {(
                    [
                      [1, "Helpful"],
                      [0.5, "Somewhat"],
                      [0, "Not"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={label}
                      onClick={() => rateAsHuman(v)}
                      className="pressable rounded-xl border border-line px-2 py-2 text-xs font-medium hover:border-foreground/40"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button onClick={() => setAsk(null)} className="mt-2 w-full text-xs text-muted hover:text-foreground">
                  Skip
                </button>
              </motion.section>
            )}
          </AnimatePresence>

          <section className="card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Arriving now</h2>
            {arrivals.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Press Start to open the doors.</p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                <AnimatePresence initial={false}>
                  {arrivals.map((a) => (
                    <motion.li
                      key={a.key}
                      layout={!reduce}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, ease: EASE_OUT }}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${SIDE_BG[a.side]}`} />
                      <span className={a.human ? "font-semibold" : ""}>{a.human ? "You" : `Rater #${a.who.replace(/\D/g, "").slice(-4)}`}</span>
                      <span className="text-muted">→</span>
                      <span className="font-mono text-xs">{a.to?.toUpperCase()}</span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>

          {viewer && (
            <p className="px-1 text-xs text-muted">
              You&apos;re in the crowd as <span className={`font-medium ${SIDE_TEXT[viewer.side]}`}>{SIDE_LABEL[viewer.side]}</span>. When a note is
              missing your side, it comes to you.
            </p>
          )}
        </aside>
      </div>

      <AnimatePresence>
        {done && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="card mt-6 flex flex-wrap items-center justify-between gap-4 p-5"
          >
            <p className="max-w-[60ch]">
              All {lanes.length} notes settled in <b className="text-good">{clock.toFixed(1)} simulated minutes</b> with {people} people
              {medianSettle !== null && <> (median {medianSettle.toFixed(1)} min per note)</>}.
              {xHours !== null && (
                <>
                  {" "}
                  On X, the same notes took a median of <b className="text-late">{fmtDuration(xHours)}</b>.
                </>
              )}
            </p>
            <Link href="/results" className="pressable rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background">
              See the replay results →
            </Link>
          </motion.section>
        )}
      </AnimatePresence>

      <p className="mt-6 text-xs text-muted">
        Real: the notes, each rater&apos;s viewpoint and their actual rating on that note, and X&apos;s timings. Simulated: arrival pace (one person every 12
        seconds across the crowd) and who shows up when.{isMock && " Showing mock data until the real Community Notes export is committed."}
      </p>
    </div>
  );
}

function LaneCard({ lane, threshold, youAsked }: { lane: Lane; threshold: number; youAsked: boolean }) {
  const reduce = useReducedMotion();
  const { note, placed, settledAt, final } = lane;
  const { a, b } = mass(placed);
  const total = a + b || 1;
  const miss = missing(lane);
  const counts = placed.reduce(
    (c, p) => {
      c[sideOf(p.raterFactor, threshold)]++;
      return c;
    },
    { A: 0, B: 0, C: 0 } as Record<Side, number>,
  );
  const settled = settledAt !== null;
  const last = placed[placed.length - 1];
  const verdictLabel = final === "HELPFUL" ? "Shown: helpful" : final === "NOT_HELPFUL" ? "Not shown" : "No consensus";

  return (
    <motion.article
      layout={!reduce}
      className={`card relative overflow-hidden p-4 transition-colors ${youAsked ? "ring-2 ring-foreground" : ""} ${settled ? "border-good/40" : ""}`}
    >
      <AnimatePresence>
        {last && !reduce && (
          <motion.span
            key={lane.flash}
            initial={{ opacity: 0.22 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.7 }}
            className={`pointer-events-none absolute inset-0 ${SIDE_BG[sideOf(last.raterFactor, threshold)]}`}
          />
        )}
      </AnimatePresence>
      <div className="relative flex items-center justify-between gap-2">
        <Link href={`/room/${note.id}`} className="font-mono text-xs text-muted hover:text-foreground">
          {note.id.toUpperCase()}
        </Link>
        {settled ? (
          <span className="rounded-full bg-good/10 px-2 py-0.5 text-xs font-medium text-good">{verdictLabel}</span>
        ) : miss ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${SIDE_BG[miss]}`}>Needs {SIDE_LABEL[miss]}</span>
        ) : (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{placed.length ? "Balanced" : "Open"}</span>
        )}
      </div>
      <p className="relative mt-2 line-clamp-3 min-h-[3.75rem] text-sm">{note.summary}</p>

      <div className="relative mt-3 flex h-2 overflow-hidden rounded-full bg-surface-2">
        <motion.div className="h-full bg-side-a" animate={{ width: `${(a / total) * 50 * Math.min(1, placed.length / 4)}%` }} transition={{ duration: 0.3 }} />
        <div className="flex-1" />
        <motion.div className="h-full bg-side-b" animate={{ width: `${(b / total) * 50 * Math.min(1, placed.length / 4)}%` }} transition={{ duration: 0.3 }} />
      </div>
      <div className="relative mt-1.5 flex justify-between text-xs text-muted">
        <span className="text-side-a">A {counts.A}</span>
        <span className="tabular">{placed.length} ratings</span>
        <span className="text-side-b">B {counts.B}</span>
      </div>

      <div className="relative mt-3 border-t border-line pt-2 text-xs">
        {settled ? (
          <p>
            Settled at <b className="text-good">{settledAt!.toFixed(1)} min</b>
            {note.timeline.hoursNoteToStatus != null && (
              <>
                {" "}
                · X took <b className="text-late">{fmtDuration(note.timeline.hoursNoteToStatus)}</b>
              </>
            )}
          </p>
        ) : (
          <p className="text-muted">
            {note.timeline.hoursNoteToStatus != null ? <>On X this note waited {fmtDuration(note.timeline.hoursNoteToStatus)}.</> : <>On X this note never settled.</>}
          </p>
        )}
      </div>
    </motion.article>
  );
}
