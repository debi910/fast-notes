"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SIDE_BG, SIDE_LABEL, SIDE_TEXT, ViewpointBar } from "@/components/ViewpointBar";
import { buildBrief } from "@/lib/brief";
import { findNote, loadRaters, loadShowcase, useData } from "@/lib/data";
import { missingSide, refitNote, sideOf, verdict } from "@/lib/model";
import { EASE_OUT, SPRING } from "@/lib/motion";
import { realtimeAvailable, useRoomChannel, type Peer } from "@/lib/realtime";
import type { ModelConfig, NoteRating, RatingValue, ShowcaseNote, Side, Verdict } from "@/lib/types";
import { readViewer, sampleViewer, type Viewer } from "@/lib/viewer";

// Simulated live arrival: one rating per participant every ~30 s.
const SIM_MINUTES_PER_RATING = 0.5;
const DECIDED_STREAK_TO_LOCK = 3;
const WAIT_FOR_PEER_MS = 15_000;

interface Placed {
  who: "bot" | "human";
  raterId: string;
  name?: string;
  value: RatingValue;
  raterIntercept: number;
  raterFactor: number;
  side: Side;
}

type Phase = "running" | "waiting" | "settled";

interface RoomState {
  placed: Placed[];
  phase: Phase;
  asked: string[];
  waitingFor: string | null;
  waitingSince: number;
}

type Msg = { type: "state"; state: RoomState } | { type: "rate"; item: Placed } | { type: "hello" } | { type: "restart" };

const EMPTY: RoomState = { placed: [], phase: "running", asked: [], waitingFor: null, waitingSince: 0 };

const VALUE_LABEL: Record<string, string> = { "1": "Helpful", "0.5": "Somewhat helpful", "0": "Not helpful" };
const CHOICES: { value: RatingValue; label: string; hint: string }[] = [
  { value: 1, label: "Helpful", hint: "Clear, sourced, fair" },
  { value: 0.5, label: "Somewhat", hint: "Partly useful" },
  { value: 0, label: "Not helpful", hint: "Wrong or biased" },
];

function fmtH(h: number | null): string {
  return h === null ? "–" : `${h.toFixed(1)} h`;
}

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

function decidedStreak(placed: Placed[], m: ModelConfig): number {
  let streak = 0;
  let last: Verdict | null = null;
  for (let k = placed.length; k >= 1; k--) {
    const e = refitNote(placed.slice(0, k), m);
    const v = verdict(e.intercept, e.factor, k, m);
    if (v === "UNDECIDED" || (last && v !== last)) break;
    last = v;
    streak++;
  }
  return streak;
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 8);
}

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
      {[220, 300, 180].map((h, i) => (
        <div key={i} className="card animate-pulse" style={{ height: h }} />
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
  const [myId] = useState(makeId);
  // ?live=<code> joins a shared room; ?invite creates one.
  const [invite] = useState(() => new URLSearchParams(window.location.search).has("invite"));
  const [liveCode] = useState<string | null>(() => {
    const q = new URLSearchParams(window.location.search);
    const code = q.get("live") ?? (q.has("invite") && realtimeAvailable() ? makeId() : null);
    if (code && !q.get("live")) window.history.replaceState(null, "", `/room/${note.id}?live=${code}`);
    return code;
  });
  const [room, setRoom] = useState<RoomState>(EMPTY);
  const [showBrief, setShowBrief] = useState(false);
  const [copied, setCopied] = useState(false);

  const me = useMemo<Peer>(
    () => ({ id: myId, name: `Guest ${myId.slice(0, 2).toUpperCase()}`, side: viewer.side, factor: viewer.factor, intercept: viewer.intercept }),
    [myId, viewer],
  );

  const roomRef = useRef(room);
  useEffect(() => {
    roomRef.current = room;
  });

  const applyRate = useCallback((s: RoomState, item: Placed): RoomState => {
    if (s.phase === "settled" || s.placed.some((p) => p.raterId === item.raterId)) return s;
    return { ...s, placed: [...s.placed, item], phase: "running", waitingFor: null };
  }, []);

  const isHostRef = useRef(true);
  const sendRef = useRef<(m: Msg) => void>(() => {});
  const onMessage = useCallback(
    (msg: Msg) => {
      if (msg.type === "state" && !isHostRef.current) setRoom(msg.state);
      else if (msg.type === "rate" && isHostRef.current) setRoom((s) => applyRate(s, msg.item));
      else if (msg.type === "hello" && isHostRef.current) sendRef.current({ type: "state", state: roomRef.current });
      else if (msg.type === "restart" && isHostRef.current) setRoom(EMPTY);
    },
    [applyRate],
  );

  const channelName = liveCode ? `room:${note.id}:${liveCode}` : null;
  const { peers, send, status } = useRoomChannel<Msg>(channelName, me, onMessage);
  const live = status === "live";
  const humans: Peer[] = useMemo(
    () => (live ? (peers.some((p) => p.id === myId) ? peers : [me, ...peers]) : [me]),
    [live, peers, me, myId],
  );
  const hostId = humans.map((h) => h.id).sort()[0];
  const isHost = !live || hostId === myId;
  useEffect(() => {
    isHostRef.current = isHost;
    sendRef.current = send;
  });

  // New joiners ask the host for the current state.
  useEffect(() => {
    if (live && !isHostRef.current) sendRef.current({ type: "hello" });
  }, [live]);

  // The host broadcasts every state change.
  useEffect(() => {
    if (live && isHost) sendRef.current({ type: "state", state: room });
  }, [room, live, isHost]);

  const { placed, phase } = room;
  const est = useMemo(() => {
    const e = refitNote(placed, model);
    return { ...e, verdict: verdict(e.intercept, e.factor, placed.length, model) };
  }, [placed, model]);
  const miss = missingSide(placed, threshold, model);
  const myRating = placed.find((p) => p.raterId === myId);

  // The room loop. Only the host drives it; everyone else mirrors the host's state.
  useEffect(() => {
    if (!isHost || phase === "settled") return;
    if (phase === "waiting") {
      if (room.waitingFor === myId && !live) return; // solo: wait for the judge's tap
      const left = Math.max(0, room.waitingSince + WAIT_FOR_PEER_MS - Date.now());
      const id = setTimeout(() => setRoom((s) => (s.phase === "waiting" ? { ...s, phase: "running", waitingFor: null } : s)), left);
      return () => clearTimeout(id);
    }
    const delay = placed.length === 0 ? 700 : placed.length < 10 ? 1100 : 450;
    const id = setTimeout(() => {
      const s = roomRef.current;
      // 1. Lock the verdict once it is decided and stable.
      const streak = decidedStreak(s.placed, model);
      const kTarget = note.replay.kTargeted ?? Infinity;
      const bots = s.placed.filter((p) => p.who === "bot").length;
      if (streak > 0 && (bots >= kTarget || streak >= DECIDED_STREAK_TO_LOCK)) {
        setRoom({ ...s, phase: "settled" });
        return;
      }
      const used = new Set(s.placed.map((p) => p.raterId));
      const remaining = note.ratings.filter((r) => !used.has(r.raterId));
      if (remaining.length === 0) {
        setRoom({ ...s, phase: "settled" });
        return;
      }
      // 2. Route by need: ask a present human whose side is missing.
      const need = missingSide(s.placed, threshold, model).side;
      const ask =
        s.placed.length >= 1 && need ? humans.find((h) => h.side === need && !used.has(h.id) && !s.asked.includes(h.id)) : undefined;
      if (ask) {
        setRoom({ ...s, phase: "waiting", asked: [...s.asked, ask.id], waitingFor: ask.id, waitingSince: Date.now() });
        return;
      }
      // 3. Otherwise a bot from the missing side replays its real rating.
      const r = pickNext(remaining, s.placed);
      setRoom({ ...s, placed: [...s.placed, { ...r, who: "bot", side: sideOf(r.raterFactor, threshold) }] });
    }, delay);
    return () => clearTimeout(id);
  }, [isHost, phase, placed, room.waitingFor, room.waitingSince, myId, live, model, note, threshold, humans]);

  function rate(value: RatingValue) {
    if (myRating || phase === "settled") return;
    const item: Placed = {
      who: "human",
      raterId: myId,
      name: me.name,
      value,
      raterIntercept: viewer.intercept,
      raterFactor: viewer.factor,
      side: viewer.side,
    };
    if (isHost) setRoom((s) => applyRate(s, item));
    else send({ type: "rate", item });
  }

  function restart() {
    if (isHost) setRoom(EMPTY);
    else send({ type: "restart" });
  }

  const t = note.timeline;
  const nextNote = allNotes.find((n) => n.fitted.verdict !== "UNDECIDED" && n.id !== note.id);
  const simMinutes = Math.max(1, Math.round(placed.length * SIM_MINUTES_PER_RATING));
  const brief = buildBrief(note, placed, est, threshold, model);
  const askedMe = phase === "waiting" && room.waitingFor === myId;
  const shareUrl = liveCode ? `${window.location.origin}/room/${note.id}?live=${liveCode}` : "";

  const ratingPanel = (
    <RatePanel
      viewer={viewer}
      noteId={note.id}
      phase={phase}
      askedMe={askedMe}
      myRating={myRating}
      sideMissing={miss.side === viewer.side}
      onRate={rate}
    />
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <Stepper phase={phase} placed={placed.length} miss={miss.side} minRatings={model.minRatings} status={status} />

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0 space-y-5">
          <NoteCard note={note} isMock={isMock} />

          <div className="lg:hidden">{ratingPanel}</div>

          <AnimatePresence initial={false}>
            {phase === "settled" && (
              <SettledCard
                key="settled"
                verdict={est.verdict}
                ratings={placed.length}
                simMinutes={simMinutes}
                xHours={t.hoursNoteToStatus}
                isMock={isMock}
                onRestart={restart}
                nextId={nextNote?.id}
              />
            )}
          </AnimatePresence>

          <Meter placed={placed} est={est} model={model} miss={miss} phase={phase} myId={myId} />

          <section className="card p-5">
            <button onClick={() => setShowBrief((s) => !s)} className="flex w-full items-center justify-between gap-3 text-left">
              <span className="font-semibold">Evidence brief</span>
              <span className="flex items-center gap-2 text-xs text-muted">
                Built from room data, not AI
                <motion.span animate={{ rotate: showBrief ? 180 : 0 }} transition={{ duration: 0.2, ease: EASE_OUT }}>
                  ▾
                </motion.span>
              </span>
            </button>
            <AnimatePresence initial={false}>
              {showBrief && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE_OUT }}
                  className="overflow-hidden"
                >
                  <div className="grid gap-3 pt-4 text-sm sm:grid-cols-2">
                    {brief.map((s) => (
                      <div key={s.heading} className="rounded-xl bg-surface-2 p-3">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{s.heading}</h3>
                        {s.lines.map((l) => (
                          <p key={l} className="mt-1">
                            {l}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>

        <aside className="min-w-0 space-y-5">
          <div className="hidden lg:block">{ratingPanel}</div>

          {(liveCode || invite) && (
            <section className="card p-5 text-sm">
              <p className="font-semibold">Invite friends</p>
              {liveCode ? (
                <>
                  <p className="mt-1 text-muted">Anyone with this link joins this room live. Bots fill the seats nobody takes.</p>
                  <div className="mt-3 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-2 py-1.5 text-xs">{shareUrl}</code>
                    <button
                      onClick={() => void navigator.clipboard.writeText(shareUrl).then(() => setCopied(true))}
                      className="pressable shrink-0 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-muted">Live rooms need the Supabase keys. Until they&apos;re set, real-rater bots fill every seat.</p>
              )}
            </section>
          )}

          <Presence placed={placed} humans={humans} myId={myId} live={live} />
        </aside>
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */

function Stepper({
  phase,
  placed,
  miss,
  minRatings,
  status,
}: {
  phase: Phase;
  placed: number;
  miss: "A" | "B" | null;
  minRatings: number;
  status: "solo" | "connecting" | "live";
}) {
  const current = phase === "settled" ? 3 : placed >= minRatings && !miss ? 2 : placed > 0 ? 1 : 0;
  const steps = ["Raters join", miss ? `Recruiting ${SIDE_LABEL[miss]}` : "Recruit missing side", "Both sides in", "Verdict locked"];
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors duration-300 ${
                i < current ? "bg-surface-2 text-muted" : i === current ? "bg-foreground text-background" : "border border-line text-muted"
              }`}
            >
              {i < current ? "✓" : <span className="tabular">{i + 1}</span>}
              {s}
            </span>
            {i < steps.length - 1 && <span className="hidden h-px w-3 bg-line sm:block" />}
          </li>
        ))}
      </ol>
      <span className="inline-flex items-center gap-2 self-start rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-muted sm:self-auto">
        <span className="relative flex h-2 w-2">
          {status === "live" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${status === "live" ? "bg-good" : status === "connecting" ? "bg-side-c" : "bg-side-b"}`} />
        </span>
        {status === "live" ? "Live room" : status === "connecting" ? "Connecting…" : "Solo mode · real-rater bots"}
      </span>
    </div>
  );
}

function NoteCard({ note, isMock }: { note: ShowcaseNote; isMock: boolean }) {
  const t = note.timeline;
  const total = (t.hoursPostToNote ?? 0) + (t.hoursNoteToStatus ?? 0) || 1;
  const notePct = ((t.hoursPostToNote ?? 0) / total) * 100;
  const marks = [
    { pct: 0, label: "Post", sub: "0 h" },
    { pct: notePct, label: "Note written", sub: `+${fmtH(t.hoursPostToNote)}` },
    { pct: 100, label: "X verdict", sub: t.hoursNoteToStatus === null ? "never" : `+${fmtH(t.hoursNoteToStatus)} later` },
  ];
  return (
    <section className="card overflow-hidden">
      <div className="p-5">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-late/10 px-2 py-0.5 font-medium text-late">
            {note.classification === "MISINFORMED_OR_POTENTIALLY_MISLEADING" ? "Note: post may mislead" : "Note: post is fine"}
          </span>
          <a
            className="text-muted underline-offset-2 hover:text-foreground hover:underline"
            href={`https://x.com/i/status/${note.tweetId}`}
            target="_blank"
            rel="noreferrer"
          >
            View the post ↗
          </a>
        </div>
        <p className="mt-3 text-xl leading-snug sm:text-2xl">{note.summary}</p>
        {isMock && <p className="mt-2 text-xs text-muted">Demo data while the real Community Notes replay is computed.</p>}
      </div>
      <div className="border-t border-line bg-surface-2/60 px-6 pb-12 pt-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">What really happened on X</p>
        <div className="relative h-1.5 rounded-full bg-line">
          <motion.div
            className="absolute inset-0 rounded-full bg-late/70"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            style={{ transformOrigin: "left" }}
            transition={{ duration: 1, ease: EASE_OUT, delay: 0.2 }}
          />
          {marks.map((m, i) => (
            <div
              key={m.label}
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-late"
              style={{ left: `${m.pct}%` }}
            >
              <div className={`absolute top-4 whitespace-nowrap text-xs ${i === 0 ? "left-0" : i === 2 ? "right-0" : "left-1/2 -translate-x-1/2"}`}>
                <div className="font-medium">{m.label}</div>
                <div className="text-muted tabular">{m.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RatePanel({
  viewer,
  noteId,
  phase,
  askedMe,
  myRating,
  sideMissing,
  onRate,
}: {
  viewer: Viewer;
  noteId: string;
  phase: Phase;
  askedMe: boolean;
  myRating: Placed | undefined;
  sideMissing: boolean;
  onRate: (v: RatingValue) => void;
}) {
  const reduce = useReducedMotion();
  const urgent = !myRating && phase !== "settled" && (askedMe || sideMissing);
  return (
    <motion.section
      className={`card relative overflow-hidden p-5 transition-shadow duration-300 ${urgent ? "ring-2 ring-side-b" : ""}`}
      animate={askedMe && !reduce ? { transform: ["translateY(0px)", "translateY(-4px)", "translateY(0px)"] } : undefined}
      transition={{ duration: 0.5, ease: EASE_OUT }}
    >
      <div className="mb-5">
        <ViewpointBar factor={viewer.factor} side={viewer.side} />
        {viewer.source === "sample" && (
          <p className="mt-2 text-xs text-muted">
            You&apos;re a sample viewer.{" "}
            <Link href={`/calibrate?next=/room/${noteId}`} className="underline underline-offset-2">
              Find your own side
            </Link>
          </p>
        )}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {myRating ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, transform: "translateY(6px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="flex items-center gap-3"
          >
            <CheckBadge />
            <div>
              <p className="font-semibold">You rated it {VALUE_LABEL[String(myRating.value)].toLowerCase()}.</p>
              <p className="text-sm text-muted">Watch the meter move as the room fills.</p>
            </div>
          </motion.div>
        ) : phase === "settled" ? (
          <motion.p key="settled" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-muted">
            This note is settled.
          </motion.p>
        ) : (
          <motion.div key="ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <p className={`font-semibold ${urgent ? SIDE_TEXT[viewer.side] : ""}`}>
              {urgent ? `${SIDE_LABEL[viewer.side]} is missing. Your rating is needed.` : "Your side is covered for now."}
            </p>
            <p className="mt-0.5 text-sm text-muted">Is this note helpful context for the post?</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {CHOICES.map((c) => (
                <button
                  key={c.label}
                  onClick={() => onRate(c.value)}
                  className="pressable flex flex-col items-center gap-0.5 rounded-xl border border-line bg-surface-2 px-1 py-3 hover:border-foreground/30"
                >
                  <span className="text-sm font-semibold">{c.label}</span>
                  <span className="text-center text-[10px] leading-tight text-muted">{c.hint}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function CheckBadge({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" className="shrink-0" aria-hidden>
      <motion.circle
        cx={18}
        cy={18}
        r={17}
        className="fill-good"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={SPRING}
        style={{ transformOrigin: "18px 18px" }}
      />
      <motion.path
        d="M11 18.5l5 5 9-10"
        fill="none"
        stroke="white"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, delay: 0.15, ease: EASE_OUT }}
      />
    </svg>
  );
}

function SettledCard({
  verdict: v,
  ratings,
  simMinutes,
  xHours,
  isMock,
  onRestart,
  nextId,
}: {
  verdict: Verdict;
  ratings: number;
  simMinutes: number;
  xHours: number | null;
  isMock: boolean;
  onRestart: () => void;
  nextId?: string;
}) {
  const decided = v !== "UNDECIDED";
  const roomPct = xHours ? Math.max(1.5, (simMinutes / 60 / xHours) * 100) : 0;
  const times = xHours ? Math.round((xHours * 60) / simMinutes) : null;
  return (
    <motion.section
      className={`card overflow-hidden ring-2 ${decided ? "ring-good" : "ring-line"}`}
      initial={{ opacity: 0, transform: "translateY(10px) scale(0.98)" }}
      animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
      role="status"
    >
      <div className="flex items-start gap-4 p-5">
        {decided ? (
          <CheckBadge size={44} />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xl">–</span>
        )}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Verdict locked</p>
          <p className="mt-0.5 text-2xl font-semibold">
            {decided ? (v === "HELPFUL" ? "Helpful" : "Not helpful") : "No consensus"}
            <span className="text-muted"> · {ratings} ratings</span>
          </p>
          {times !== null && decided && (
            <p className="mt-1 text-sm">
              Settled about <b className="tabular">{times}×</b> sooner than X did.
            </p>
          )}
        </div>
      </div>
      {xHours !== null && decided && (
        <div className="space-y-3 border-t border-line px-5 py-4 text-xs">
          <div>
            <div className="mb-1 flex justify-between">
              <span className="font-medium">This room</span>
              <span className="tabular text-muted">~{simMinutes} min (simulated pace)</span>
            </div>
            <div className="h-2.5 rounded-full bg-surface-2">
              <motion.div
                className="h-full rounded-full bg-good"
                initial={{ width: 0 }}
                animate={{ width: `${roomPct}%` }}
                transition={{ duration: 0.6, delay: 0.3, ease: EASE_OUT }}
              />
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between">
              <span className="font-medium">X, for real</span>
              <span className="tabular text-muted">{xHours.toFixed(1)} h</span>
            </div>
            <div className="h-2.5 rounded-full bg-surface-2">
              <motion.div
                className="h-full rounded-full bg-late"
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 1.2, delay: 0.3, ease: EASE_OUT }}
              />
            </div>
          </div>
          <p className="text-muted">
            Ratings and raters are real{isMock ? " (demo data for now)" : ""}. Arrival pace is simulated at one rating per ~30 s.
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3 text-sm">
        <button onClick={onRestart} className="pressable rounded-full border border-line px-4 py-2 hover:border-foreground/30">
          ↺ Replay this room
        </button>
        {nextId && (
          <Link href={`/room/${nextId}`} className="pressable rounded-full bg-foreground px-4 py-2 font-medium text-background">
            Try another note →
          </Link>
        )}
      </div>
    </motion.section>
  );
}

function Meter({
  placed,
  est,
  model,
  miss,
  phase,
  myId,
}: {
  placed: Placed[];
  est: { intercept: number; factor: number; verdict: Verdict };
  model: ModelConfig;
  miss: { side: "A" | "B" | null; need: number };
  phase: Phase;
  myId: string;
}) {
  const W = 600;
  const H = 190;
  const R = 1.5;
  const x = (f: number) => 24 + ((Math.max(-R, Math.min(R, f)) + R) / (2 * R)) * (W - 48);
  const y = (v: number) => 30 + (1 - v) * (H - 70);
  const jitter = (i: number) => ((i * 37) % 13) - 6;

  const countA = placed.filter((p) => p.side === "A").length;
  const countB = placed.filter((p) => p.side === "B").length;

  let message: string;
  if (phase === "settled") message = "Verdict locked";
  else if (miss.side) message = `Need ${miss.need} more from ${SIDE_LABEL[miss.side]}`;
  else if (est.verdict === "UNDECIDED") message = "Both sides in · waiting for agreement";
  else message = "Both sides agree · confirming";

  const tone =
    phase === "settled" ? "bg-good/15 text-good" : miss.side === "A" ? "bg-side-a/15 text-side-a" : miss.side === "B" ? "bg-side-b/15 text-side-b" : "bg-surface-2";

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Missing-viewpoint meter</h2>
          <p className="text-xs text-muted">Each dot is one rating, placed by the rater&apos;s viewpoint.</p>
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={message}
            initial={{ opacity: 0, transform: "translateY(6px)", filter: "blur(2px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)", filter: "blur(0px)" }}
            exit={{ opacity: 0, transform: "translateY(-6px)", filter: "blur(2px)" }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}
            aria-live="polite"
          >
            {message}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Seats: raters per side so far, dashed seats still needed */}
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
        <Seats count={countA} need={miss.side === "A" ? miss.need : 0} side="A" align="end" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">vs</span>
        <Seats count={countB} need={miss.side === "B" ? miss.need : 0} side="B" align="start" />
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Ratings plotted by rater viewpoint">
        <rect x={24} y={12} width={(W - 48) / 2} height={H - 46} rx={10} className="fill-side-a" opacity={0.06} />
        <rect x={W / 2} y={12} width={(W - 48) / 2} height={H - 46} rx={10} className="fill-side-b" opacity={0.06} />
        {[1, 0.5, 0].map((v) => (
          <g key={v}>
            <line x1={24} x2={W - 24} y1={y(v)} y2={y(v)} className="stroke-line" strokeDasharray="2 4" />
            <text x={W / 2} y={y(v) - 7} textAnchor="middle" className="fill-muted text-[10px]">
              {VALUE_LABEL[String(v)]}
            </text>
          </g>
        ))}
        <text x={30} y={H - 12} className="fill-side-a text-[11px] font-semibold">
          ← Side A
        </text>
        <text x={W - 30} y={H - 12} textAnchor="end" className="fill-side-b text-[11px] font-semibold">
          Side B →
        </text>
        {placed.map((p, i) => {
          const human = p.who === "human";
          return (
            <motion.circle
              key={p.raterId}
              cx={x(p.raterFactor)}
              cy={y(p.value) + jitter(i)}
              r={human ? 9 : 6.5}
              className={`${p.side === "A" ? "fill-side-a" : p.side === "B" ? "fill-side-b" : "fill-side-c"} ${human ? "stroke-foreground" : "stroke-surface"}`}
              strokeWidth={human ? 2.5 : 2}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={SPRING}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            >
              <title>{p.raterId === myId ? "You" : human ? p.name : `Real rater #${p.raterId}`}</title>
            </motion.circle>
          );
        })}
      </svg>

      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Gauge
          label="How helpful raters find it"
          value={est.intercept.toFixed(2)}
          pct={Math.max(0, Math.min(1, est.intercept + 0.2))}
          markPct={model.helpfulInterceptMin + 0.2}
          ok={est.intercept >= model.helpfulInterceptMin}
          okText="Above the bar"
          noText={`Needs ${model.helpfulInterceptMin.toFixed(2)} or more`}
        />
        <Gauge
          label="Lean toward one side"
          value={Math.abs(est.factor).toFixed(2)}
          pct={Math.min(1, Math.abs(est.factor))}
          markPct={model.maxAbsFactor}
          ok={placed.length > 0 && Math.abs(est.factor) < model.maxAbsFactor}
          okText="Balanced across sides"
          noText={placed.length ? "Too one-sided" : "No ratings yet"}
          invert
        />
      </div>
      <p className="mt-3 text-xs text-muted">
        {placed.length} rating{placed.length === 1 ? "" : "s"} · the bridging model refits in your browser after every one
      </p>
    </section>
  );
}

function Seats({ count, need, side, align }: { count: number; need: number; side: "A" | "B"; align: "start" | "end" }) {
  const shown = Math.min(count, 10);
  const num = <span className={`text-sm font-semibold tabular ${SIDE_TEXT[side]}`}>{count}</span>;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${align === "end" ? "flex-row-reverse" : ""}`}>
      {num}
      <span className="w-1" />
      {Array.from({ length: shown }, (_, i) => (
        <motion.span
          key={`f${i}`}
          className={`h-3.5 w-3.5 rounded-full ${SIDE_BG[side]}`}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING}
        />
      ))}
      {Array.from({ length: need }, (_, i) => (
        <motion.span
          key={`n${count + i}`}
          className={`h-3.5 w-3.5 rounded-full border-2 border-dashed ${side === "A" ? "border-side-a" : "border-side-b"}`}
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

function Gauge({
  label,
  value,
  pct,
  markPct,
  ok,
  okText,
  noText,
  invert,
}: {
  label: string;
  value: string;
  pct: number;
  markPct: number;
  ok: boolean;
  okText: string;
  noText: string;
  invert?: boolean;
}) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="font-mono tabular text-muted">{value}</span>
      </div>
      <div className="relative mt-2 h-2 rounded-full bg-line">
        <motion.div
          className={`h-full rounded-full ${ok ? "bg-good" : invert ? "bg-late" : "bg-foreground/60"}`}
          initial={false}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
        />
        <div className="absolute -top-1 h-4 w-0.5 rounded bg-foreground" style={{ left: `${markPct * 100}%` }} />
      </div>
      <p className={`mt-1.5 text-[11px] font-medium ${ok ? "text-good" : "text-muted"}`}>{ok ? `✓ ${okText}` : noText}</p>
    </div>
  );
}

function Presence({ placed, humans, myId, live }: { placed: Placed[]; humans: Peer[]; myId: string; live: boolean }) {
  const bots = placed.filter((p) => p.who === "bot");
  const feed = placed.slice(-7).reverse();
  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">In the room</h2>
        <span className="text-xs text-muted tabular">
          {humans.length} {humans.length === 1 ? "person" : "people"} · {bots.length} replayed
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <AnimatePresence initial={false}>
          {humans.map((h) => (
            <Avatar key={h.id} side={h.side} label={h.id === myId ? "You" : h.name.slice(-2)} human title={h.id === myId ? "You" : h.name} />
          ))}
          {bots.map((p) => (
            <Avatar key={p.raterId} side={p.side} label={p.side} title={`Replaying real rater #${p.raterId}`} />
          ))}
        </AnimatePresence>
      </div>
      <ul className="mt-4 space-y-1">
        <AnimatePresence initial={false}>
          {feed.map((p) => (
            <motion.li
              key={p.raterId}
              layout
              initial={{ opacity: 0, transform: "translateY(-6px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs odd:bg-surface-2/70"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${SIDE_BG[p.side]}`} />
                <span className="truncate">{p.raterId === myId ? "You" : p.who === "human" ? p.name : `Real rater #${p.raterId}`}</span>
              </span>
              <span className="shrink-0 text-muted">{VALUE_LABEL[String(p.value)]}</span>
            </motion.li>
          ))}
        </AnimatePresence>
        {placed.length === 0 && <li className="px-2 text-xs text-muted">Raters are joining…</li>}
      </ul>
      <p className="mt-3 text-[11px] text-muted">
        {live ? "Live: people rate first; bots replay real raters for empty seats." : "Solo: bots replay real raters' actual ratings on this note."}
      </p>
    </section>
  );
}

function Avatar({ side, label, title, human }: { side: Side; label: string; title: string; human?: boolean }) {
  return (
    <motion.span
      layout
      title={title}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={SPRING}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${SIDE_BG[side]} ${
        human ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface" : ""
      }`}
    >
      {label}
    </motion.span>
  );
}
