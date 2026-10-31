"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { EASE_OUT } from "@/lib/motion";

const MAX_H = 24;

function Track({
  label,
  sub,
  endH,
  color,
  endLabel,
  delay,
  run,
}: {
  label: string;
  sub: string;
  endH: number;
  color: string;
  endLabel: string;
  delay: number;
  run: boolean;
}) {
  const pct = (endH / MAX_H) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted">{sub}</span>
      </div>
      <div className="relative mt-2 h-10 rounded-xl bg-surface-2">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-xl"
          style={{ width: `${pct}%`, background: `color-mix(in oklab, ${color} 28%, transparent)`, transformOrigin: "left" }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: run ? 1 : 0 }}
          transition={{ duration: 1.1, delay, ease: EASE_OUT }}
        />
        <motion.div
          className="absolute top-1/2 -translate-y-1/2"
          style={{ left: `${pct}%` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: run ? 1 : 0 }}
          transition={{ duration: 0.3, delay: delay + 1.0 }}
        >
          <div className="-ml-2 h-4 w-4 rounded-full border-2 border-surface" style={{ background: color }} />
        </motion.div>
        <motion.span
          className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-xs font-semibold"
          style={pct > 60 ? { right: `${100 - pct + 2}%`, color } : { left: `calc(${pct}% + 14px)`, color }}
          initial={{ opacity: 0 }}
          animate={{ opacity: run ? 1 : 0 }}
          transition={{ duration: 0.3, delay: delay + 1.0 }}
        >
          {endLabel}
        </motion.span>
      </div>
    </div>
  );
}

/** Side-by-side: when does the fact-check show up, today vs with a Fast Notes room? */
export function Timelines() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const run = inView || Boolean(reduce);
  return (
    <div ref={ref} className="space-y-5">
      <Track label="Today on X" sub="raters wander in at random" endH={18.1} color="var(--late)" endLabel="Note shown · 18.1 h" delay={0} run={run} />
      <Track
        label="With a Fast Notes room"
        sub="missing side recruited live"
        endH={2}
        color="var(--side-a)"
        endLabel="Settled · ~2 h"
        delay={0.4}
        run={run}
      />
      <div className="flex justify-between text-[11px] text-muted tabular">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h}>{h}h</span>
        ))}
      </div>
    </div>
  );
}
