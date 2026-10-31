"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useState } from "react";
import { fmtDuration } from "@/components/room/shared";
import { loadResults, useData } from "@/lib/data";
import { EASE_OUT } from "@/lib/motion";
import type { PerNoteResult } from "@/lib/types";

// Replay experiment: how many ratings each note needs before its verdict is final,
// when ratings arrive in X's real order, in random order, or in our targeted order.

const SERIES = [
  { key: "kTargeted", label: "Fast Notes order", cls: "fill-side-a", ring: false },
  { key: "kRandomMedian", label: "Random order", cls: "fill-surface stroke-muted", ring: true },
  { key: "kActual", label: "Real order on X", cls: "fill-side-b", ring: false },
] as const;

export default function ResultsPage() {
  const { data, error } = useData(loadResults);
  const [hover, setHover] = useState<PerNoteResult | null>(null);
  if (error) return <p className="p-6 text-late">{error}</p>;
  if (!data)
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-12">
        <div className="card h-96 animate-pulse bg-surface-2/60" />
      </div>
    );

  const s = data.summary;
  const rows = data.perNote
    .filter((n) => n.xStatus === "CURRENTLY_RATED_HELPFUL" && n.kTargeted !== null && n.kActual !== null)
    .sort((a, b) => (a.kActual ?? 0) - (b.kActual ?? 0));
  const maxK = Math.max(...rows.map((r) => Math.max(r.kActual ?? 0, r.kRandomMedian ?? 0, r.kTargeted ?? 0)), 10);
  const W = 640;
  const L = 28;
  const R = 16;
  const rowH = 18;
  const H = rows.length * rowH + 40;
  const x = (k: number) => L + (k / maxK) * (W - L - R);
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((maxK / 4) * i));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <p className="text-sm font-semibold uppercase tracking-wider text-side-a">Replay experiment</p>
      <h1 className="mt-2 max-w-[24ch] text-3xl font-semibold sm:text-4xl">
        Asking the missing side first settles notes with {Math.round(s.medianKActual / s.medianKTargeted)}× fewer ratings.
      </h1>
      <p className="mt-3 max-w-[62ch] text-muted">
        We took {s.nReplayed} notes X rated helpful and replayed their real ratings three ways, refitting the bridging model after each
        one. We count how many ratings it takes until the verdict is final.
      </p>

      <dl className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line">
        {[
          { k: "Fast Notes order", v: s.medianKTargeted, dot: "bg-side-a" },
          { k: "Random order", v: s.medianKRandom, dot: "border-2 border-muted bg-surface" },
          { k: "Real order on X", v: s.medianKActual, dot: "bg-side-b" },
        ].map((t) => (
          <div key={t.k} className="bg-surface px-4 py-4">
            <dt className="flex items-center gap-2 text-xs text-muted">
              <span className={`h-2.5 w-2.5 rounded-full ${t.dot}`} />
              {t.k}
            </dt>
            <dd className="tabular mt-1 text-2xl font-semibold">
              {t.v.toFixed(t.v % 1 ? 1 : 0)} <span className="text-sm font-normal text-muted">ratings</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted">
        Medians. On X those {s.medianKActual} ratings took a median of {fmtDuration(s.medianHoursToKActual)} to arrive.
      </p>

      <section className="card mt-6 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Ratings needed, note by note</h2>
          <div className="flex gap-4 text-xs text-muted">
            {SERIES.map((se) => (
              <span key={se.key} className="flex items-center gap-1.5">
                <svg width="10" height="10" aria-hidden>
                  <circle cx="5" cy="5" r="4" className={se.cls} strokeWidth={se.ring ? 2 : 0} />
                </svg>
                {se.label}
              </span>
            ))}
          </div>
        </div>
        <div className="relative mt-4">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Ratings needed per note under three orderings">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={8} y2={H - 24} className="stroke-line" />
                <text x={x(t)} y={H - 8} textAnchor="middle" className="tabular fill-muted text-[10px]">
                  {t}
                </text>
              </g>
            ))}
            {rows.map((r, i) => {
              const y = 16 + i * rowH;
              const ks = [r.kTargeted!, r.kRandomMedian ?? r.kTargeted!, r.kActual!];
              return (
                <g key={r.noteId} onMouseEnter={() => setHover(r)} onMouseLeave={() => setHover(null)} className="cursor-default">
                  <rect x={0} y={y - rowH / 2} width={W} height={rowH} className={hover === r ? "fill-surface-2" : "fill-transparent"} />
                  <motion.line
                    x1={x(Math.min(...ks))}
                    x2={x(Math.max(...ks))}
                    y1={y}
                    y2={y}
                    strokeWidth={2}
                    className="stroke-line"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.5, delay: i * 0.02, ease: EASE_OUT }}
                  />
                  {SERIES.map((se, j) => (
                    <motion.circle
                      key={se.key}
                      cx={x(ks[j])}
                      cy={y}
                      r={4.5}
                      strokeWidth={se.ring ? 2 : 2}
                      className={`${se.cls} ${se.ring ? "" : "stroke-surface"}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.2 + i * 0.02 }}
                    />
                  ))}
                </g>
              );
            })}
          </svg>
          {hover && (
            <div className="pointer-events-none absolute right-0 top-0 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
              <div className="font-medium">Note …{hover.noteId.slice(-4)}</div>
              <div className="tabular mt-1 text-muted">
                Fast Notes {hover.kTargeted} · random {hover.kRandomMedian} · real {hover.kActual}
              </div>
              {hover.hoursToKActual !== null && <div className="tabular text-muted">Real wait {fmtDuration(hover.hoursToKActual)}</div>}
            </div>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">
          Each row is one note. Fewer ratings is better. Targeted order is as fast or faster than random on {s.pctTargetedNoSlower}% of
          notes.
        </p>
      </section>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold">Does our model agree with X?</h2>
          <p className="tabular mt-2 text-4xl font-semibold">{data.modelAgreement.pctAgreement.toFixed(0)}%</p>
          <p className="mt-1 text-sm text-muted">
            of {data.modelAgreement.nCompared} notes get the same final status from our simplified one-dimensional model as from X&apos;s
            full scorer.
          </p>
        </section>
        <section className="card p-5">
          <h2 className="font-semibold">What&apos;s real, what&apos;s simulated</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            <li>
              <span className="font-medium text-good">Real:</span> notes, ratings, rater viewpoints, X&apos;s timelines and verdicts.
            </li>
            <li>
              <span className="font-medium text-side-b">Simulated:</span> when ratings arrive in a live room (about one every 30 s).
            </li>
            <li>
              <span className="font-medium text-muted">Not built:</span> any connection to X itself.
            </li>
          </ul>
        </section>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3 text-sm">
        <Link href="/notes" className="pressable rounded-full bg-foreground px-5 py-2.5 font-medium text-background hover:opacity-90">
          Open a note
        </Link>
        <span className="text-xs text-muted">
          Sample: {data.sample.nNotes} notes, {data.sample.nRatings.toLocaleString()} ratings, {data.sample.nRaters} raters
          {data.isMock ? " (mock data for now)" : ""}.
        </span>
      </div>
    </div>
  );
}
