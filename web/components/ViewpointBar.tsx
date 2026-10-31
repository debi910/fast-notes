"use client";

import { motion } from "motion/react";
import { SPRING } from "@/lib/motion";
import type { Side } from "@/lib/types";

export const SIDE_LABEL: Record<Side, string> = { A: "Side A", B: "Side B", C: "Centre" };
export const SIDE_TEXT: Record<Side, string> = { A: "text-side-a", B: "text-side-b", C: "text-side-c" };
export const SIDE_BG: Record<Side, string> = { A: "bg-side-a", B: "bg-side-b", C: "bg-side-c" };

const RANGE = 1.5;

/** Neutral left-to-right viewpoint bar. Never labelled with politics. */
export function ViewpointBar({ factor, side }: { factor: number; side: Side }) {
  const pct = ((Math.max(-RANGE, Math.min(RANGE, factor)) + RANGE) / (2 * RANGE)) * 100;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-xs">
        <span className="font-medium text-muted">Your viewpoint</span>
        <span className={`font-semibold ${SIDE_TEXT[side]}`}>
          {SIDE_LABEL[side]} <span className="font-mono font-normal tabular text-muted">({factor >= 0 ? "+" : ""}{factor.toFixed(2)})</span>
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-gradient-to-r from-side-a via-line to-side-b">
        <div className="absolute left-1/2 top-1/2 h-4 w-px -translate-y-1/2 bg-muted/50" />
        <motion.div
          className={`absolute top-1/2 h-6 w-6 rounded-full border-[3px] border-surface ${SIDE_BG[side]} shadow-md`}
          initial={{ left: "50%" }}
          animate={{ left: `${pct}%` }}
          transition={SPRING}
          style={{ x: "-50%", y: "-50%" }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] font-medium">
        <span className="text-side-a">Side A</span>
        <span className="text-side-b">Side B</span>
      </div>
    </div>
  );
}
