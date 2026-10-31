"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { fmtDuration } from "@/components/room/shared";
import { loadShowcase, useData } from "@/lib/data";
import { EASE_OUT } from "@/lib/motion";
import type { ShowcaseNote } from "@/lib/types";

type Filter = "all" | "stuck" | "settled";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All notes" },
  { id: "stuck", label: "Never settled on X" },
  { id: "settled", label: "Settled on X" },
];

function xOutcome(n: ShowcaseNote): { text: string; cls: string } {
  const t = n.timeline;
  if (t.finalStatus === "NEEDS_MORE_RATINGS" || t.hoursNoteToStatus === null) return { text: "Never settled", cls: "text-late" };
  return { text: fmtDuration(t.hoursNoteToStatus), cls: "" };
}

export default function NotesPage() {
  const { data, error } = useData(loadShowcase);
  const [filter, setFilter] = useState<Filter>("all");

  if (error) return <p className="p-6 text-late">{error}</p>;

  const notes = (data?.notes ?? []).filter((n) => !data?.calibrationNoteIds.includes(n.id));
  const stuck = notes.filter((n) => n.timeline.hoursNoteToStatus === null || n.timeline.finalStatus === "NEEDS_MORE_RATINGS");
  const shown = filter === "all" ? notes : filter === "stuck" ? stuck : notes.filter((n) => !stuck.includes(n));
  const medianX = (() => {
    const hs = notes.map((n) => n.timeline.hoursNoteToStatus).filter((h): h is number => h !== null).sort((a, b) => a - b);
    return hs.length ? hs[Math.floor(hs.length / 2)] : null;
  })();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Notes waiting for a verdict</h1>
          <p className="mt-2 max-w-[60ch] text-muted">
            Real Community Notes from X&apos;s public data. Open one to run a live room and settle it.
          </p>
        </div>
        <Link
          href="/calibrate?next=/notes"
          className="pressable rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium hover:border-foreground/30"
        >
          Find my side
        </Link>
      </div>

      <dl className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line">
        {[
          { k: "Notes", v: data ? String(notes.length) : "–" },
          { k: "Never settled on X", v: data ? String(stuck.length) : "–" },
          { k: "Median wait on X", v: medianX === null ? "–" : fmtDuration(medianX) },
        ].map((x) => (
          <div key={x.k} className="bg-surface px-4 py-3.5">
            <dt className="text-xs text-muted">{x.k}</dt>
            <dd className="tabular mt-0.5 text-xl font-semibold">{x.v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex gap-1 overflow-x-auto rounded-full bg-surface-2 p-1 text-sm font-medium sm:w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`relative shrink-0 rounded-full px-3.5 py-1.5 ${filter === f.id ? "text-foreground" : "text-muted hover:text-foreground"}`}
          >
            {filter === f.id && (
              <motion.span layoutId="notes-filter" className="absolute inset-0 rounded-full bg-surface shadow-sm" transition={{ type: "spring", duration: 0.4, bounce: 0.15 }} />
            )}
            <span className="relative">{f.label}</span>
          </button>
        ))}
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="hidden grid-cols-[1fr_7rem_7rem_6rem] gap-4 border-b border-line px-5 py-2.5 text-xs font-medium text-muted sm:grid">
          <span>Note</span>
          <span>Written after post</span>
          <span>X took</span>
          <span />
        </div>
        {!data && (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-2" />
            ))}
          </div>
        )}
        <ul>
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((n) => {
              const x = xOutcome(n);
              const misleading = n.classification === "MISINFORMED_OR_POTENTIALLY_MISLEADING";
              return (
                <motion.li
                  key={n.id}
                  layout="position"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                  className="border-b border-line/70 last:border-0"
                >
                  <Link
                    href={`/room/${n.id}`}
                    className="group grid gap-2 px-5 py-4 transition-colors hover:bg-surface-2/60 sm:grid-cols-[1fr_7rem_7rem_6rem] sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-[15px] leading-snug">{n.summary}</p>
                      <span className={`mt-1 inline-block text-xs font-medium ${misleading ? "text-late" : "text-good"}`}>
                        {misleading ? "Says the post is misleading" : "Says the post is fine"}
                      </span>
                    </div>
                    <span className="tabular text-sm text-muted">
                      <span className="sm:hidden">Written </span>
                      {n.timeline.hoursPostToNote === null ? "–" : fmtDuration(n.timeline.hoursPostToNote)}
                      <span className="sm:hidden"> after the post</span>
                    </span>
                    <span className={`tabular text-sm ${x.cls}`}>
                      <span className="text-muted sm:hidden">X took </span>
                      {x.text}
                    </span>
                    <span className="text-sm font-medium sm:text-right">
                      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-foreground px-3 py-1.5 text-background transition-transform duration-200 group-hover:translate-x-0.5">
                        Open room
                      </span>
                    </span>
                  </Link>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </div>
      {data?.isMock && <p className="mt-3 text-xs text-muted">Mock data while the real Community Notes sample is processed.</p>}
    </div>
  );
}
