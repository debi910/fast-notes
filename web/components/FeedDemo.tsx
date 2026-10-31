"use client";

import Link from "next/link";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { fmtDuration, SIM_MINUTES_PER_RATING } from "@/components/room/shared";
import { FILLER_POSTS, illustrativePost } from "@/lib/demoPosts";
import { EASE_OUT, SPRING } from "@/lib/motion";
import type { ShowcaseNote } from "@/lib/types";

// Replays one real note's timeline in a simulated feed, twice side by side:
// today (note shows when X decides) vs with a Fast Notes room (note shows when the room settles).
// Spread follows the measured repost half-life of 5.75 h (Chuai et al. 2024).

const HALF_LIFE_H = 5.75;
const TOTAL_REPOSTS = 18400;
const BASE_SECONDS = 18; // real seconds for the whole timeline
const ROOM_SECONDS = 3.5; // the room's few minutes are slowed down so you can watch them

const spread = (h: number) => 1 - Math.pow(2, -Math.max(0, h) / HALF_LIFE_H);
const compact = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(1)}K` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n)));

function clock(h: number) {
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return hh === 0 ? `${mm} min` : `${hh} h ${String(mm).padStart(2, "0")} min`;
}

export function FeedDemo({ note, autoPlay = true }: { note: ShowcaseNote; autoPlay?: boolean }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35, once: true });
  const tNote = note.timeline.hoursPostToNote ?? 1.5;
  const roomH = Math.max(1, note.replay.kTargeted ?? 6) * (SIM_MINUTES_PER_RATING / 60) + 1 / 60;
  const xH = note.timeline.hoursNoteToStatus;
  const xAt = xH === null ? null : tNote + xH;
  const fnAt = tNote + roomH;
  const total = Math.min(36, Math.max((xAt ?? 24) + 2, 12));

  const [rawT, setT] = useState(0);
  const [mode, setMode] = useState<"auto" | "playing" | "paused">("auto");
  const t = mode === "auto" && reduce ? total : rawT;
  const playing = mode === "playing" || (mode === "auto" && autoPlay && inView && !reduce && rawT < total);
  const setPlaying = (p: boolean) => setMode(p ? "playing" : "paused");

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setT((cur) => {
        const inRoom = cur >= tNote && cur < fnAt;
        const speed = inRoom ? roomH / ROOM_SECONDS : total / BASE_SECONDS;
        const next = Math.min(total, cur + dt * speed);
        if (next >= total) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, tNote, fnAt, roomH, total]);

  const done = t >= total;
  const slowed = playing && t >= tNote && t < fnAt;

  return (
    <div ref={ref}>
      {/* controls + clock */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => {
            if (done) setT(0);
            setPlaying(!playing || done);
          }}
          className="pressable inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          {playing ? (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden>
              <rect x="3" y="2" width="3.5" height="12" rx="1" />
              <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden>
              <path d="M4 2.5v11a.5.5 0 0 0 .77.42l8.5-5.5a.5.5 0 0 0 0-.84l-8.5-5.5A.5.5 0 0 0 4 2.5z" />
            </svg>
          )}
          {playing ? "Pause" : done ? "Replay" : t > 0 ? "Resume" : "Play"}
        </button>
        <div className="tabular rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm">
          <span className="text-muted">Since the post: </span>
          <span className="font-semibold">{clock(t)}</span>
        </div>
        <AnimatePresence>
          {slowed && (
            <motion.span
              initial={{ opacity: 0, transform: "translateX(-4px)" }}
              animate={{ opacity: 1, transform: "translateX(0px)" }}
              exit={{ opacity: 0 }}
              className="text-xs font-medium text-side-a"
            >
              Slowed down to show the room&apos;s few minutes
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Lane title="Community Notes today" tone="late" t={t} tNote={tNote} noteAt={xAt} note={note} />
        <Lane title="With a Fast Notes room" tone="good" t={t} tNote={tNote} noteAt={fnAt} note={note} room={{ k: note.replay.kTargeted ?? 6 }} />
      </div>

      <Scrubber t={t} total={total} tNote={tNote} fnAt={fnAt} xAt={xAt} onSeek={(h) => { setPlaying(false); setT(h); }} />

      <AnimatePresence>
        {done && (
          <motion.div
            initial={{ opacity: 0, transform: "translateY(8px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            transition={SPRING}
            className="mt-5 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center"
          >
            <p className="flex-1 text-[15px]">
              Readers saw the context after{" "}
              <b className="text-late">{xAt === null ? "never" : `${Math.round(spread(xAt) * 100)}%`}</b> of the post&apos;s spread today,
              versus <b className="text-good">{Math.round(spread(fnAt) * 100)}%</b> with a room.
            </p>
            <Link
              href={`/room/${note.id}`}
              className="pressable shrink-0 rounded-full bg-foreground px-5 py-2.5 text-center text-sm font-medium text-background hover:opacity-90"
            >
              Rate this note in a live room →
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
      <p className="mt-3 text-xs text-muted">
        The note and its timings are real. The post text and engagement counts are illustrative; spread follows the measured 5.75 h repost
        half-life.
      </p>
    </div>
  );
}

const ICON = "h-[18px] w-[18px] fill-none stroke-current stroke-[1.75]";

function Actions({ reposts, live }: { reposts: number; live: boolean }) {
  const items = [
    { n: reposts * 0.18, d: "M4 12a8 8 0 0 1 8-8h1a7 7 0 0 1 0 14h-1l-5 3v-4.5A8 8 0 0 1 4 12z", hl: "" },
    { n: reposts, d: "M7 7h10v6M17 13l-3-3M17 13l3-3M17 17H7v-6M7 11l-3 3M7 11l3 3", hl: live ? "text-[#00ba7c]" : "" },
    { n: reposts * 3.1, d: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z", hl: "" },
    { n: reposts * 42, d: "M5 20V11M10 20V5M15 20v-7M20 20V9", hl: "" },
  ];
  return (
    <div className="tabular mt-3 flex max-w-[420px] justify-between pr-2 text-[13px] text-[var(--x-muted)]">
      {items.map((it, i) => (
        <span key={i} className={`flex items-center gap-1 ${it.hl}`}>
          <svg viewBox="0 0 24 24" className={ICON} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={it.d} />
          </svg>
          {compact(it.n)}
        </span>
      ))}
      <span className="flex items-center gap-3">
        <svg viewBox="0 0 24 24" className={ICON} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 4h12v16l-6-4-6 4z" />
        </svg>
        <svg viewBox="0 0 24 24" className={ICON} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6" />
        </svg>
      </span>
    </div>
  );
}

function XNote({ text }: { text: string }) {
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--x-line)]">
      <div className="px-3 pt-3">
        <div className="flex items-center gap-1.5 text-[15px] font-bold">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-[#1d9bf0]" aria-hidden>
            <circle cx="8" cy="8" r="3" />
            <circle cx="16" cy="8" r="3" />
            <path d="M2 19a6 6 0 0 1 12 0zM10 19a6 6 0 0 1 12 0z" />
          </svg>
          Readers added context
        </div>
        <p className="mt-1.5 pb-3 text-[15px] leading-5">{text}</p>
      </div>
      <div className="flex items-center justify-between border-t border-[var(--x-line)] px-3 py-2.5 text-[13px]">
        <span className="text-[var(--x-muted)]">Do you find this helpful?</span>
        <span className="rounded-full border border-[var(--x-line)] px-3 py-0.5 font-bold">Rate it</span>
      </div>
    </div>
  );
}

function Lane({
  title,
  tone,
  t,
  tNote,
  noteAt,
  note,
  room,
}: {
  title: string;
  tone: "late" | "good";
  t: number;
  tNote: number;
  noteAt: number | null;
  note: ShowcaseNote;
  room?: { k: number };
}) {
  const shown = noteAt !== null && t >= noteAt;
  const pending = t >= tNote && !shown;
  const frac = spread(t);
  const reposts = TOTAL_REPOSTS * frac;
  const atShow = noteAt === null ? null : spread(noteAt);
  const ratingsIn = room && pending ? Math.min(room.k, Math.floor(((t - tNote) / (noteAt! - tNote)) * room.k) + 1) : 0;

  return (
    <section className="flex flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className={`tabular text-xs font-medium ${tone === "late" ? "text-late" : "text-good"}`}>
          {shown
            ? `Note shown at ${clock(noteAt!)}`
            : noteAt === null && t >= tNote
              ? "Note never shown"
              : pending
                ? room
                  ? "Room settling…"
                  : "Waiting for ratings…"
                : ""}
        </span>
      </div>
      <div className="xfeed flex-1 overflow-hidden rounded-2xl border border-[var(--x-line)] bg-[var(--x-bg)] text-[var(--x-fg)] shadow-[0_8px_24px_-12px_rgb(0_0_0/0.15)]">
        {/* app chrome */}
        <div className="border-b border-[var(--x-line)]">
          <div className="relative flex h-11 items-center justify-center">
            <span className="absolute left-4 h-7 w-7 rounded-full bg-[var(--x-soft)]" />
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] fill-[var(--x-fg)]" aria-label="X">
              <path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8zM16.7 19.2h1.7L7.2 4.7H5.4z" />
            </svg>
            <span className="absolute right-3 rounded-full bg-[var(--x-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--x-muted)]">
              Simulated
            </span>
          </div>
          <div className="grid grid-cols-2 text-center text-[14px]">
            <span className="relative py-2.5 font-bold">
              For you
              <span className="absolute bottom-0 left-1/2 h-1 w-14 -translate-x-1/2 rounded-full bg-[#1d9bf0]" />
            </span>
            <span className="py-2.5 text-[var(--x-muted)]">Following</span>
          </div>
        </div>
        <Filler i={0} />
        {/* the viral post */}
        <article className="border-b border-[var(--x-line)] px-4 py-3">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-rose-500 text-sm font-bold text-white">
              DP
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-[15px] leading-5">
                <span className="font-bold">Daily Pulse</span>
                <span className="truncate text-[var(--x-muted)]">@dailypulse_now · {t < 1 ? `${Math.max(1, Math.round(t * 60))}m` : `${Math.floor(t)}h`}</span>
              </div>
              <p className="mt-0.5 text-[15px] leading-5">{illustrativePost(note.summary)}</p>

              <AnimatePresence initial={false}>
                {pending && room && (
                  <motion.div
                    key="room"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: EASE_OUT }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 rounded-2xl border border-side-a/40 bg-side-a/8 px-3 py-2.5 text-xs">
                      <div className="flex items-center gap-2 font-semibold text-side-a">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-side-a opacity-60" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-side-a" />
                        </span>
                        Fast Notes room open · inviting the missing side
                      </div>
                      <div className="mt-2 flex gap-1">
                        {Array.from({ length: room.k }, (_, i) => (
                          <motion.span
                            key={i}
                            className={`h-1.5 flex-1 rounded-full ${i < ratingsIn ? (i % 2 ? "bg-side-b" : "bg-side-a") : "bg-[var(--x-line)]"}`}
                            animate={{ scaleY: i === ratingsIn - 1 ? [1, 1.8, 1] : 1 }}
                            transition={{ duration: 0.3 }}
                          />
                        ))}
                      </div>
                      <div className="tabular mt-1.5 text-[var(--x-muted)]">
                        {ratingsIn} of {room.k} ratings from both sides
                      </div>
                    </div>
                  </motion.div>
                )}
                {shown && (
                  <motion.div
                    key="note"
                    initial={{ opacity: 0, height: 0, filter: "blur(4px)" }}
                    animate={{ opacity: 1, height: "auto", filter: "blur(0px)" }}
                    transition={{ duration: 0.45, ease: EASE_OUT }}
                    className="overflow-hidden"
                  >
                    <XNote text={note.summary.replace(/^\[MOCK\]\s*/, "")} />
                  </motion.div>
                )}
              </AnimatePresence>

              <Actions reposts={reposts} live={!shown} />
              {pending && !room && (
                <p className="mt-2 text-[12px] text-[var(--x-muted)]">A note exists but readers can&apos;t see it yet: it needs more ratings.</p>
              )}
            </div>
          </div>
        </article>
        <Filler i={1} />
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-xs">
          <span className="text-muted">Spread before readers saw context</span>
          <span className="tabular font-semibold">{shown || (noteAt === null && t >= tNote) ? (atShow === null ? `${Math.round(frac * 100)}%+` : `${Math.round(atShow * 100)}%`) : `${Math.round(frac * 100)}%…`}</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full ${tone === "late" ? "bg-late" : "bg-good"}`}
            style={{ width: `${(shown && atShow !== null ? atShow : frac) * 100}%` }}
          />
        </div>
      </div>
    </section>
  );
}

function Filler({ i }: { i: number }) {
  const p = FILLER_POSTS[i];
  const hues = ["from-sky-400 to-indigo-500", "from-emerald-400 to-teal-600"];
  return (
    <div className="flex gap-3 border-b border-[var(--x-line)] px-4 py-3 last:border-0">
      <span className={`h-10 w-10 shrink-0 rounded-full bg-gradient-to-br ${hues[i % 2]}`} />
      <div className="min-w-0 text-[15px] leading-5">
        <span className="font-bold">{p.name}</span> <span className="text-[var(--x-muted)]">@{p.handle} · {p.time}</span>
        <p className="mt-0.5">{p.text}</p>
      </div>
    </div>
  );
}

function Scrubber({
  t,
  total,
  tNote,
  fnAt,
  xAt,
  onSeek,
}: {
  t: number;
  total: number;
  tNote: number;
  fnAt: number;
  xAt: number | null;
  onSeek: (h: number) => void;
}) {
  const pct = (h: number) => `${(Math.min(h, total) / total) * 100}%`;
  const marks = [
    { h: tNote, label: "Note written", cls: "bg-muted" },
    { h: fnAt, label: "Room settles", cls: "bg-good" },
    ...(xAt !== null ? [{ h: xAt, label: "X decides", cls: "bg-late" }] : []),
  ];
  return (
    <div className="mt-6">
      <div
        className="relative h-8 cursor-pointer"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek(((e.clientX - r.left) / r.width) * total);
        }}
        role="slider"
        aria-label="Timeline"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.round(t * 10) / 10}
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line" />
        <div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-foreground" style={{ width: pct(t) }} />
        {marks.map((m) => (
          <span key={m.label} className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface ${m.cls}`} style={{ left: pct(m.h) }} />
        ))}
        <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-foreground shadow" style={{ left: pct(t) }} />
      </div>
      <div className="relative h-8 text-[11px] text-muted">
        {marks.map((m, i) => (
          <span
            key={m.label}
            className={`tabular absolute whitespace-nowrap ${m.h / total < 0.15 ? "" : m.h / total > 0.85 ? "-translate-x-full" : "-translate-x-1/2"}`}
            style={{ left: m.h / total < 0.15 ? 0 : pct(m.h), top: i === 1 && Math.abs(m.h - marks[0].h) / total < 0.12 ? 14 : 0 }}
          >
            {m.label} · {fmtDuration(m.h)}
          </span>
        ))}
      </div>
    </div>
  );
}
