"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { EASE_IN_OUT, EASE_OUT } from "@/lib/motion";

const HALF_LIFE_H = 5.75; // Chuai et al.: half of reposts within 5.75 h
const NOTE_SHOWN_H = 18.1; // median post -> note display
const MAX_T = 24;
const W = 600;
const H = 260;
const PAD = { l: 40, r: 16, t: 20, b: 34 };

const share = (t: number) => 1 - Math.pow(2, -t / HALF_LIFE_H);
const x = (t: number) => PAD.l + (t / MAX_T) * (W - PAD.l - PAD.r);
const y = (s: number) => H - PAD.b - s * (H - PAD.t - PAD.b);

const MARKS = [
  { t: 2, label: "Fast Notes goal", cls: "text-side-a" },
  { t: HALF_LIFE_H, label: "Half of reposts done", cls: "text-muted" },
  { t: NOTE_SHOWN_H, label: "Note shown on X", cls: "text-late" },
];

export function SpreadChart() {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);

  const pts = Array.from({ length: 121 }, (_, i) => (i / 120) * MAX_T);
  const line = pts.map((t, i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(share(t)).toFixed(1)}`).join(" ");
  const lateArea =
    pts
      .filter((t) => t <= NOTE_SHOWN_H)
      .map((t, i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(share(t)).toFixed(1)}`)
      .join(" ") + ` L${x(NOTE_SHOWN_H)},${y(0)} L${x(0)},${y(0)} Z`;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const t = ((px - PAD.l) / (W - PAD.l - PAD.r)) * MAX_T;
    setHover(Math.max(0, Math.min(MAX_T, t)));
  }

  const draw = inView || reduce;

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        role="img"
        aria-label="Share of reposts over time. Half happen by 5.75 hours; notes appear at 18.1 hours."
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="late-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--late)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--late)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((s) => (
          <g key={s}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(s)} y2={y(s)} className="stroke-line" strokeDasharray={s ? "2 4" : undefined} />
            <text x={PAD.l - 8} y={y(s) + 4} textAnchor="end" className="fill-muted text-[11px] tabular">
              {Math.round(s * 100)}%
            </text>
          </g>
        ))}
        {[0, 6, 12, 18, 24].map((t) => (
          <text key={t} x={x(t)} y={H - 12} textAnchor="middle" className="fill-muted text-[11px] tabular">
            {t}h
          </text>
        ))}

        <motion.path
          d={lateArea}
          fill="url(#late-fill)"
          initial={{ opacity: 0 }}
          animate={{ opacity: draw ? 1 : 0 }}
          transition={{ duration: 0.8, delay: reduce ? 0 : 1.1, ease: EASE_OUT }}
        />
        <motion.path
          d={line}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          className="stroke-foreground"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: draw ? 1 : 0 }}
          transition={{ duration: 1.4, ease: EASE_IN_OUT }}
        />

        {MARKS.map((m, i) => (
          <motion.g
            key={m.t}
            className={m.cls}
            initial={{ opacity: 0 }}
            animate={{ opacity: draw ? 1 : 0 }}
            transition={{ duration: 0.4, delay: reduce ? 0 : 0.5 + i * 0.35, ease: EASE_OUT }}
          >
            <line x1={x(m.t)} x2={x(m.t)} y1={y(0)} y2={y(share(m.t))} stroke="currentColor" strokeDasharray="4 3" />
            <circle cx={x(m.t)} cy={y(share(m.t))} r={5} fill="currentColor" stroke="var(--surface)" strokeWidth={2} />
            <text
              x={x(m.t) + (m.t > 15 ? -8 : 8)}
              y={y(share(m.t)) + (i === 0 ? -10 : 18)}
              textAnchor={m.t > 15 ? "end" : "start"}
              fill="currentColor"
              className="text-[11px] font-semibold"
            >
              {m.label} · {m.t}h · {Math.round(share(m.t) * 100)}%
            </text>
          </motion.g>
        ))}

        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={y(0)} className="stroke-foreground" strokeOpacity={0.25} />
            <circle cx={x(hover)} cy={y(share(hover))} r={6} className="fill-foreground" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      <div className="pointer-events-none mt-1 h-5 text-center text-xs text-muted tabular">
        {hover !== null ? (
          <span>
            At hour <b className="text-foreground">{hover.toFixed(1)}</b>,{" "}
            <b className="text-foreground">{Math.round(share(hover) * 100)}%</b> of reposts have already happened
            {hover >= NOTE_SHOWN_H ? "" : " and the typical note isn't showing yet"}.
          </span>
        ) : (
          <span>Move across the chart to scrub through a post&apos;s first day.</span>
        )}
      </div>
    </div>
  );
}
