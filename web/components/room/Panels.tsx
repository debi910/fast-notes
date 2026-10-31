"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { SIDE_BG, SIDE_LABEL, SIDE_TEXT } from "@/components/ViewpointBar";
import type { BriefSection } from "@/lib/brief";
import { EASE_OUT, SPRING } from "@/lib/motion";
import type { LinkStatus, Peer } from "@/lib/realtime";
import type { ModelConfig, RatingValue, ShowcaseNote, Side, Verdict } from "@/lib/types";
import type { Viewer } from "@/lib/viewer";
import { type Estimate, fmtDuration, initials, type Phase, type Placed, SIM_MINUTES_PER_RATING, VALUE_LABEL } from "./shared";

/* ───────────────────────── Note card ───────────────────────── */

export function NoteCard({ note }: { note: ShowcaseNote }) {
  const misleading = note.classification === "MISINFORMED_OR_POTENTIALLY_MISLEADING";
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-3 px-5 pt-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-muted" aria-hidden>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="h-2.5 w-28 rounded-full bg-line" />
          <div className="mt-1.5 h-2 w-16 rounded-full bg-line/70" />
        </div>
        <a
          className="pressable shrink-0 rounded-full border border-line px-3 py-1 text-xs font-medium text-muted hover:text-foreground"
          href={`https://x.com/i/status/${note.tweetId}`}
          target="_blank"
          rel="noreferrer"
        >
          View post on X ↗
        </a>
      </div>
      <div className="mx-5 mt-4 space-y-2">
        <div className="h-2.5 w-full rounded-full bg-surface-2" />
        <div className="h-2.5 w-4/5 rounded-full bg-surface-2" />
      </div>
      <div className="m-5 rounded-2xl border border-line bg-surface-2/60 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
            <circle cx="7" cy="8" r="3.2" className="fill-side-a" />
            <circle cx="13" cy="8" r="3.2" className="fill-side-b" />
            <path d="M2.5 17a4.5 4.5 0 0 1 9 0zM8.5 17a4.5 4.5 0 0 1 9 0z" className="fill-muted" opacity={0.5} />
          </svg>
          Readers added context
          <span
            className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${misleading ? "bg-late/12 text-late" : "bg-good/12 text-good"}`}
          >
            {misleading ? "Says: misleading" : "Says: not misleading"}
          </span>
        </div>
        <p className="mt-2 text-[15px] leading-relaxed">{note.summary}</p>
        <p className="mt-2 text-xs text-muted">Is this note helpful? This room decides.</p>
      </div>
    </section>
  );
}

/* ───────────────────────── Checklist ───────────────────────── */

function Check({ done, active }: { done: boolean; active: boolean }) {
  return (
    <span
      className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-300 ${done ? "border-good bg-good" : active ? "border-foreground" : "border-line"}`}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
        <motion.path
          d="M3.5 8.5l3 3 6-7"
          fill="none"
          stroke="white"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
        />
      </svg>
      {active && !done && <span className="absolute inset-0 animate-ping rounded-full border-2 border-foreground/40" />}
    </span>
  );
}

export function Steps({
  n,
  minRatings,
  a,
  b,
  target,
  verdict,
}: {
  n: number;
  minRatings: number;
  a: number;
  b: number;
  target: number;
  verdict: Verdict;
}) {
  const s1 = n >= minRatings;
  const s2 = a >= target && b >= target;
  const s3 = verdict !== "UNDECIDED";
  const first = !s1 ? 0 : !s2 ? 1 : !s3 ? 2 : 3;
  const rows = [
    { done: s1, title: "Enough people rated", detail: `${Math.min(n, minRatings)} of ${minRatings}` },
    {
      done: s2,
      title: "Both sides weighed in",
      detail: (
        <>
          <span className="text-side-a">A {Math.min(a, target)}/{target}</span> ·{" "}
          <span className="text-side-b">B {Math.min(b, target)}/{target}</span>
        </>
      ),
    },
    {
      done: s3,
      title: verdict === "NOT_HELPFUL" ? "Both sides call it unhelpful" : "Both sides agree it helps",
      detail: s3 ? (verdict === "HELPFUL" ? "Helpful" : "Not helpful") : "waiting",
    },
  ];
  return (
    <ol className="grid gap-2 sm:grid-cols-3">
      {rows.map((r, i) => (
        <li
          key={i}
          className={`flex items-center gap-3 rounded-xl border p-3 transition-colors duration-300 ${first === i ? "border-foreground/25 bg-surface" : "border-line bg-surface-2/50"}`}
        >
          <Check done={r.done} active={first === i} />
          <div className="min-w-0">
            <div className="text-sm font-medium leading-tight">{r.title}</div>
            <div className="tabular mt-0.5 text-xs text-muted">{r.detail}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ───────────────────────── Race: X vs this room ───────────────────────── */

export function Race({ note, ratings, phase }: { note: ShowcaseNote; ratings: number; phase: Phase }) {
  const xh = note.timeline.hoursNoteToStatus;
  const roomH = (ratings * SIM_MINUTES_PER_RATING) / 60;
  const scale = xh ?? 24;
  const pct = Math.max(1.2, Math.min(100, (roomH / scale) * 100));
  const factor = xh && roomH > 0 ? Math.round(xh / roomH) : null;
  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">How long until a verdict?</h2>
        <AnimatePresence>
          {phase === "settled" && factor && factor > 1 && (
            <motion.span
              initial={{ opacity: 0, transform: "scale(0.8)" }}
              animate={{ opacity: 1, transform: "scale(1)" }}
              transition={SPRING}
              className="rounded-full bg-good/12 px-2.5 py-1 text-xs font-semibold text-good"
            >
              {factor}× faster
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="mt-4 space-y-4 text-sm">
        <div>
          <div className="flex justify-between">
            <span className="font-medium">Community Notes on X</span>
            <span className="tabular text-muted">{xh === null ? "never decided" : fmtDuration(xh)}</span>
          </div>
          <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className={`h-full rounded-full ${xh === null ? "bg-[repeating-linear-gradient(45deg,var(--late)_0_6px,transparent_6px_12px)]" : "bg-late"}`}
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 1.1, ease: EASE_OUT }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between">
            <span className="font-medium">This room</span>
            <span className="tabular text-muted">
              {ratings === 0 ? "starting" : `~${fmtDuration(roomH)}`}
              {phase !== "settled" && ratings > 0 ? " so far" : ""}
            </span>
          </div>
          <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-surface-2">
            <motion.div className="h-full rounded-full bg-good" animate={{ width: `${pct}%` }} transition={{ duration: 0.5, ease: EASE_OUT }} />
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        X time is this note&apos;s real delay from note to status. Room time assumes one rating every ~30 s.
      </p>
    </section>
  );
}

/* ───────────────────────── Your seat ───────────────────────── */

const CHOICES: { value: RatingValue; label: string; icon: React.ReactNode }[] = [
  {
    value: 1,
    label: "Helpful",
    icon: <path d="M7 11v8H4v-8zM7 11l4-7a2 2 0 0 1 3 2l-1 4h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7" />,
  },
  { value: 0.5, label: "Somewhat", icon: <path d="M5 12h14M5 12a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /> },
  {
    value: 0,
    label: "Not helpful",
    icon: <path d="M17 13V5h3v8zM17 13l-4 7a2 2 0 0 1-3-2l1-4H6a2 2 0 0 1-2-2.3l1.2-6A2 2 0 0 1 7.2 4H17" />,
  },
];

export function YourSeat({
  me,
  viewer,
  needed,
  myRating,
  phase,
  noteId,
  onRate,
}: {
  me: Peer;
  viewer: Viewer;
  needed: boolean;
  myRating: RatingValue | null;
  phase: Phase;
  noteId: string;
  onRate: (v: RatingValue) => void;
}) {
  const RANGE = 1.5;
  const pct = ((Math.max(-RANGE, Math.min(RANGE, viewer.factor)) + RANGE) / (2 * RANGE)) * 100;
  const rated = myRating !== null;
  const open = !rated && phase !== "settled";
  return (
    <section
      className={`card relative overflow-hidden p-5 transition-[box-shadow,border-color] duration-300 ${needed && open ? "border-foreground shadow-[0_0_0_4px_color-mix(in_oklab,var(--foreground)_10%,transparent)]" : ""}`}
    >
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white ${SIDE_BG[viewer.side]}`}>
          {initials(me.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted">Your seat</div>
          <div className="font-semibold leading-tight">{me.name}</div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SIDE_TEXT[viewer.side]} bg-surface-2`}>{SIDE_LABEL[viewer.side]}</span>
      </div>

      <div className="mt-4">
        <div className="relative h-2 rounded-full bg-gradient-to-r from-side-a/70 via-line to-side-b/70">
          <motion.div
            className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface ${SIDE_BG[viewer.side]} shadow`}
            initial={{ left: "50%" }}
            animate={{ left: `${pct}%` }}
            transition={SPRING}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-muted">
          <span>Side A</span>
          <span>
            {viewer.source === "sample" ? (
              <Link href={`/calibrate?next=/room/${noteId}`} className="underline underline-offset-2 hover:text-foreground">
                Sample viewer · calibrate yourself
              </Link>
            ) : (
              "Placed by your calibration"
            )}
          </span>
          <span>Side B</span>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <motion.div
            key="ask"
            initial={{ opacity: 0, transform: "translateY(6px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            exit={{ opacity: 0, transform: "translateY(-6px)" }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
            <p className="mt-5 font-medium">
              {needed ? (
                <>
                  <span className={SIDE_TEXT[viewer.side]}>{SIDE_LABEL[viewer.side]} is missing.</span> The room is waiting for you.
                </>
              ) : (
                "Your side is covered for now. You can still rate."
              )}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {CHOICES.map((c) => (
                <button
                  key={c.label}
                  onClick={() => onRate(c.value)}
                  className="pressable group flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface px-2 py-3 text-sm font-medium hover:border-foreground/40 hover:bg-surface-2"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 fill-none stroke-current stroke-[1.8] transition-transform duration-200 ease-out group-hover:-translate-y-0.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    {c.icon}
                  </svg>
                  {c.label}
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="done"
            initial={{ opacity: 0, transform: "scale(0.96)" }}
            animate={{ opacity: 1, transform: "scale(1)" }}
            transition={SPRING}
            className="mt-5 flex items-center gap-3 rounded-xl bg-surface-2 p-3 text-sm"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-good">
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                <motion.path
                  d="M3.5 8.5l3 3 6-7"
                  fill="none"
                  stroke="white"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.35, delay: 0.1, ease: EASE_OUT }}
                />
              </svg>
            </span>
            {rated ? (
              <span>
                You rated it <b>{VALUE_LABEL[String(myRating)]}</b>. Watch the bridge.
              </span>
            ) : (
              <span>This note is settled.</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ───────────────────────── Who is here ───────────────────────── */

export function WhoIsHere({
  peers,
  me,
  placed,
  status,
  waitingFor,
  noteId,
}: {
  peers: Peer[];
  me: Peer;
  placed: Placed[];
  status: LinkStatus;
  waitingFor: string | null;
  noteId: string;
}) {
  const [copied, setCopied] = useState(false);
  const bots = placed.filter((p) => p.kind === "bot");
  const botA = bots.filter((p) => p.side === "A").length;
  const botB = bots.filter((p) => p.side === "B").length;
  const botC = bots.length - botA - botB;
  const rated = new Map(placed.filter((p) => p.kind === "human").map((p) => [p.raterId, p.value]));
  const humans = [...peers].sort((x, y) => (x.id === me.id ? -1 : y.id === me.id ? 1 : x.joinedAt - y.joinedAt));
  const pill =
    status === "live"
      ? { dot: "bg-good", text: "Live across devices" }
      : status === "local"
        ? { dot: "bg-side-b", text: "Live in this browser" }
        : { dot: "bg-muted", text: "Connecting…" };

  function copy() {
    const url = `${window.location.origin}/room/${noteId}`;
    void navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  }

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">In the room</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted">
          <span className="relative flex h-2 w-2">
            {status !== "connecting" && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${pill.dot}`} />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${pill.dot}`} />
          </span>
          {pill.text}
        </span>
      </div>

      <ul className="mt-4 space-y-2">
        <AnimatePresence initial={false}>
          {humans.map((p) => {
            const v = rated.get(p.id);
            return (
              <motion.li
                key={p.id}
                layout
                initial={{ opacity: 0, transform: "translateX(-8px)" }}
                animate={{ opacity: 1, transform: "translateX(0px)" }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
                className="flex items-center gap-3 text-sm"
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white ${SIDE_BG[p.side]}`}>
                  {initials(p.name)}
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate font-medium">
                    {p.name}
                    {p.id === me.id && <span className="ml-1 text-muted">(you)</span>}
                  </div>
                  <div className={`text-xs ${SIDE_TEXT[p.side]}`}>{SIDE_LABEL[p.side]}</div>
                </div>
                <span className="text-xs text-muted">
                  {v !== undefined ? VALUE_LABEL[String(v)] : waitingFor === p.id ? <span className="font-medium text-foreground">needed now</span> : "watching"}
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <div className="mt-4 rounded-xl bg-surface-2/70 p-3 text-xs text-muted">
        <div className="flex items-center justify-between">
          <span>Replayed real raters</span>
          <span className="tabular font-medium text-foreground">{bots.length}</span>
        </div>
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-line">
          <motion.div className="bg-side-a" animate={{ flexGrow: botA }} style={{ flexBasis: 0 }} transition={{ duration: 0.4 }} />
          <motion.div className="bg-side-c" animate={{ flexGrow: botC }} style={{ flexBasis: 0 }} transition={{ duration: 0.4 }} />
          <motion.div className="bg-side-b" animate={{ flexGrow: botB }} style={{ flexBasis: 0 }} transition={{ duration: 0.4 }} />
        </div>
        <p className="mt-2">Real raters&apos; actual ratings on this note fill the seats no human has taken.</p>
      </div>

      <button
        onClick={copy}
        className="pressable mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={copied ? "y" : "n"}
            initial={{ opacity: 0, transform: "translateY(6px)", filter: "blur(2px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)", filter: "blur(0px)" }}
            exit={{ opacity: 0, transform: "translateY(-6px)", filter: "blur(2px)" }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
            {copied ? "Link copied ✓" : "Invite someone from the other side"}
          </motion.span>
        </AnimatePresence>
      </button>
    </section>
  );
}

/* ───────────────────────── Activity feed ───────────────────────── */

export function Feed({ placed, meId }: { placed: Placed[]; meId: string }) {
  const items = placed.map((p, i) => ({ p, i })).slice(-7).reverse();
  return (
    <section className="card p-5">
      <h2 className="font-semibold">Live activity</h2>
      <ul className="mt-3 space-y-0.5">
        <AnimatePresence initial={false}>
          {items.map(({ p, i }) => (
            <motion.li
              key={p.raterId}
              layout="position"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2.5 py-1.5 text-sm">
                <span className={`h-2 w-2 shrink-0 rounded-full ${SIDE_BG[p.side]}`} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">
                    {p.raterId === meId ? "You" : p.kind === "human" ? p.name : `Rater #${p.raterId.slice(-4)}`}
                  </span>
                  <span className="text-muted"> rated </span>
                  <span className={p.value === 1 ? "text-good" : p.value === 0 ? "text-late" : ""}>{VALUE_LABEL[String(p.value)]}</span>
                </span>
                <span className="tabular shrink-0 text-xs text-muted">{fmtDuration(((i + 1) * SIM_MINUTES_PER_RATING) / 60)}</span>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
        {placed.length === 0 && <li className="py-1.5 text-sm text-muted">Raters are joining…</li>}
      </ul>
    </section>
  );
}

/* ───────────────────────── Under the hood ───────────────────────── */

export function UnderTheHood({
  placed,
  est,
  model,
  brief,
  meId,
}: {
  placed: Placed[];
  est: Estimate;
  model: ModelConfig;
  brief: BriefSection[];
  meId: string;
}) {
  const tabs = ["Evidence brief", "Rating map", "Model numbers"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("Evidence brief");
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Under the hood</h2>
        <div className="flex rounded-full bg-surface-2 p-1 text-xs font-medium">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`relative rounded-full px-3 py-1.5 ${tab === t ? "text-foreground" : "text-muted hover:text-foreground"}`}>
              {tab === t && (
                <motion.span layoutId="hood-tab" className="absolute inset-0 rounded-full bg-surface shadow-sm" transition={SPRING} />
              )}
              <span className="relative">{t}</span>
            </button>
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, transform: "translateY(4px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          exit={{ opacity: 0, transform: "translateY(-4px)" }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          className="mt-4"
        >
          {tab === "Evidence brief" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {brief.map((s) => (
                <div key={s.heading} className="rounded-xl border border-line p-3.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{s.heading}</h3>
                  <div className="mt-1.5 space-y-1 text-sm">
                    {s.lines.map((l) => (
                      <p key={l}>{l}</p>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted sm:col-span-2">Written from the room&apos;s own data by a template. No AI, nothing invented.</p>
            </div>
          )}
          {tab === "Rating map" && <RatingMap placed={placed} meId={meId} />}
          {tab === "Model numbers" && <ModelNumbers est={est} model={model} n={placed.length} />}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

function RatingMap({ placed, meId }: { placed: Placed[]; meId: string }) {
  const reduce = useReducedMotion();
  const W = 560;
  const H = 180;
  const R = 1.5;
  const x = (f: number) => 24 + ((Math.max(-R, Math.min(R, f)) + R) / (2 * R)) * (W - 48);
  const y = (v: number) => 22 + (1 - v) * (H - 60);
  const jitter = (i: number) => ((i * 37) % 11) - 5;
  const fill: Record<Side, string> = { A: "fill-side-a", B: "fill-side-b", C: "fill-side-c" };
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Each rating plotted by the rater's viewpoint">
        {[1, 0.5, 0].map((v) => (
          <g key={v}>
            <line x1={24} x2={W - 24} y1={y(v)} y2={y(v)} className="stroke-line" />
            <text x={W - 24} y={y(v) - 6} textAnchor="end" className="fill-muted text-[10px]">
              {VALUE_LABEL[String(v)]}
            </text>
          </g>
        ))}
        <line x1={W / 2} x2={W / 2} y1={10} y2={H - 30} className="stroke-line" strokeDasharray="3 3" />
        <text x={24} y={H - 8} className="fill-side-a text-[11px] font-medium">
          ← Side A
        </text>
        <text x={W - 24} y={H - 8} textAnchor="end" className="fill-side-b text-[11px] font-medium">
          Side B →
        </text>
        {placed.map((p, i) => {
          const cx = x(p.raterFactor);
          const cy = y(p.value) + jitter(i);
          const mine = p.raterId === meId;
          return (
            <motion.circle
              key={p.raterId}
              cx={cx}
              cy={cy}
              r={mine ? 8 : p.kind === "human" ? 7 : 5.5}
              className={`${fill[p.side]} ${p.kind === "human" ? "stroke-foreground" : "stroke-surface"}`}
              strokeWidth={2}
              initial={reduce ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={SPRING}
              style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: "view-box" }}
            />
          );
        })}
      </svg>
      <p className="text-xs text-muted">
        Each dot is one rating. Left-right is the rater&apos;s viewpoint, learned from their past ratings. A note goes live only when
        dots on <i>both</i> sides sit high.
      </p>
    </div>
  );
}

function ModelNumbers({ est, model, n }: { est: Estimate; model: ModelConfig; n: number }) {
  const iPct = Math.max(0, Math.min(1, (est.intercept + 0.2) / 1.0));
  const iThreshPct = (model.helpfulInterceptMin + 0.2) / 1.0;
  const fPct = Math.min(1, Math.abs(est.factor) / 1.0);
  const bar = (label: string, hint: string, value: string, pct: number, mark: number, ok: boolean, markLabel: string) => (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-xs">{value}</span>
      </div>
      <div className="relative mt-2 h-2.5 rounded-full bg-surface-2">
        <motion.div className={`h-full rounded-full ${ok ? "bg-good" : "bg-foreground/60"}`} animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.5, ease: EASE_OUT }} />
        <div className="absolute -top-1 h-4.5 w-0.5 rounded bg-foreground" style={{ left: `${mark * 100}%` }} title={markLabel} />
      </div>
      <p className="mt-1.5 text-xs text-muted">{hint}</p>
    </div>
  );
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {bar(
        "Helpfulness",
        `How helpful raters find it once viewpoint is removed. Needs ≥ ${model.helpfulInterceptMin.toFixed(2)}.`,
        est.intercept.toFixed(2),
        iPct,
        iThreshPct,
        est.intercept >= model.helpfulInterceptMin,
        "Helpful threshold",
      )}
      {bar(
        "One-sidedness",
        `How much the support comes from one side only. Must stay under ${model.maxAbsFactor.toFixed(2)}.`,
        Math.abs(est.factor).toFixed(2),
        fPct,
        model.maxAbsFactor,
        Math.abs(est.factor) < model.maxAbsFactor && n >= model.minRatings,
        "Max allowed",
      )}
      <p className="text-xs text-muted sm:col-span-2">
        rating ≈ μ + i<sub>u</sub> + i<sub>n</sub> + f<sub>u</sub>·f<sub>n</sub>, refit in your browser after every rating ({n} so far).
      </p>
    </div>
  );
}

/* ───────────────────────── Settled ───────────────────────── */

export function Settled({
  verdict,
  n,
  note,
  onReplay,
  nextId,
  isMock,
}: {
  verdict: Verdict;
  n: number;
  note: ShowcaseNote;
  onReplay: () => void;
  nextId: string | null;
  isMock: boolean;
}) {
  const reduce = useReducedMotion();
  const roomH = (n * SIM_MINUTES_PER_RATING) / 60;
  const xh = note.timeline.hoursNoteToStatus;
  const good = verdict === "HELPFUL";
  const color = verdict === "HELPFUL" ? "var(--good)" : verdict === "NOT_HELPFUL" ? "var(--late)" : "var(--muted)";
  const bits = Array.from({ length: 18 }, (_, i) => {
    const ang = (i / 18) * Math.PI * 2;
    const d = 60 + (i % 3) * 22;
    return { x: Math.cos(ang) * d, y: Math.sin(ang) * d * 0.7, c: ["var(--side-a)", "var(--side-b)", color][i % 3], r: 3 + (i % 2) };
  });
  return (
    <motion.section
      role="status"
      initial={{ opacity: 0, transform: "translateY(10px) scale(0.98)" }}
      animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
      transition={SPRING}
      className="card relative overflow-hidden p-6"
      style={{ borderColor: color }}
    >
      {!reduce && good && (
        <svg className="pointer-events-none absolute left-14 top-12 h-0 w-0 overflow-visible" aria-hidden>
          {bits.map((b, i) => (
            <motion.circle
              key={i}
              r={b.r}
              fill={b.c}
              initial={{ cx: 0, cy: 0, opacity: 1 }}
              animate={{ cx: b.x, cy: b.y, opacity: 0 }}
              transition={{ duration: 1.1, ease: EASE_OUT, delay: 0.15 }}
            />
          ))}
        </svg>
      )}
      <div className="flex items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl" style={{ background: color }}>
          <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
            {verdict === "NOT_HELPFUL" ? (
              <path d="M7 7l10 10M17 7L7 17" stroke="white" strokeWidth={2.6} strokeLinecap="round" />
            ) : verdict === "HELPFUL" ? (
              <motion.path
                d="M5 12.5l4.5 4.5L19 7.5"
                fill="none"
                stroke="white"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.45, delay: 0.1, ease: EASE_OUT }}
              />
            ) : (
              <path d="M6 12h12" stroke="white" strokeWidth={2.6} strokeLinecap="round" />
            )}
          </svg>
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">Verdict locked</div>
          <h2 className="mt-0.5 text-2xl font-semibold">
            {verdict === "UNDECIDED" ? `No consensus after ${n} ratings` : verdict === "HELPFUL" ? "Helpful. Both sides agree." : "Not helpful, across both sides."}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Settled in <b className="text-foreground">~{fmtDuration(roomH)}</b> with {n} ratings
            {xh !== null ? (
              <>
                . X took <b className="text-foreground">{fmtDuration(xh)}</b>.
              </>
            ) : (
              ". X never reached a decision."
            )}
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 text-sm">
        <button onClick={onReplay} className="pressable rounded-full border border-line px-4 py-2 font-medium hover:border-foreground/30">
          Replay this room
        </button>
        {nextId && (
          <Link href={`/room/${nextId}`} className="pressable rounded-full bg-foreground px-4 py-2 font-medium text-background hover:opacity-90">
            Try another note →
          </Link>
        )}
      </div>
      <p className="mt-4 text-xs text-muted">
        Ratings and raters are real{isMock ? " (mock data for now)" : ""}. Live arrival timing is simulated.
      </p>
    </motion.section>
  );
}
