"use client";

import { motion, useReducedMotion } from "motion/react";
import { EASE_OUT } from "@/lib/motion";

const view = { once: true, amount: 0.6 } as const;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 160 110" className="h-28 w-full" aria-hidden>
      {children}
    </svg>
  );
}

/** 1. A scale tipped to Side A, with Side B's pan empty. */
export function SpotIcon() {
  const reduce = useReducedMotion();
  return (
    <Frame>
      <line x1={80} y1={30} x2={80} y2={95} strokeWidth={3} className="stroke-muted" strokeLinecap="round" />
      <path d="M62 96h36" strokeWidth={3} className="stroke-muted" strokeLinecap="round" />
      <motion.g
        initial={{ rotate: 0 }}
        whileInView={{ rotate: reduce ? -14 : [0, -18, -14] }}
        viewport={view}
        transition={{ duration: 1.2, ease: EASE_OUT }}
        style={{ transformOrigin: "80px 30px" }}
      >
        <line x1={30} y1={30} x2={130} y2={30} strokeWidth={3} className="stroke-foreground" strokeLinecap="round" />
        <path d="M18 52 a14 7 0 0 0 28 0z" className="fill-side-a" />
        <line x1={32} y1={30} x2={22} y2={52} className="stroke-muted" />
        <line x1={32} y1={30} x2={42} y2={52} className="stroke-muted" />
        {[0, 1, 2].map((i) => (
          <circle key={i} cx={24 + i * 8} cy={46 - (i % 2) * 4} r={4} className="fill-side-a" />
        ))}
        <path d="M114 52 a14 7 0 0 0 28 0z" className="fill-side-b" opacity={0.35} />
        <line x1={128} y1={30} x2={118} y2={52} className="stroke-muted" />
        <line x1={128} y1={30} x2={138} y2={52} className="stroke-muted" />
        <motion.text
          x={128}
          y={46}
          textAnchor="middle"
          className="fill-side-b text-[16px] font-bold"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={view}
          transition={{ delay: 0.9, duration: 0.3 }}
        >
          ?
        </motion.text>
      </motion.g>
      <circle cx={80} cy={30} r={4} className="fill-foreground" />
    </Frame>
  );
}

/** 2. Side B raters stream into the room. */
export function RecruitIcon() {
  return (
    <Frame>
      <rect x={92} y={18} width={56} height={78} rx={12} className="fill-surface-2 stroke-line" strokeWidth={2} />
      <text x={120} y={62} textAnchor="middle" className="fill-muted text-[10px] font-semibold uppercase tracking-wider">
        room
      </text>
      {[0, 1, 2].map((i) => (
        <motion.g
          key={i}
          initial={{ opacity: 0, transform: "translateX(-30px)" }}
          whileInView={{ opacity: 1, transform: "translateX(0px)" }}
          viewport={view}
          transition={{ duration: 0.6, delay: 0.2 + i * 0.15, ease: EASE_OUT }}
        >
          <circle cx={36 + i * 18} cy={44 + (i % 2) * 18} r={6} className="fill-side-b" />
          <path d={`M${27 + i * 18} ${64 + (i % 2) * 18} a9 9 0 0 1 18 0z`} className="fill-side-b" />
        </motion.g>
      ))}
      <motion.path
        d="M20 100 C 60 100, 70 70, 88 60"
        fill="none"
        strokeWidth={2}
        strokeDasharray="4 4"
        className="stroke-side-b"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={view}
        transition={{ duration: 0.9, ease: EASE_OUT }}
      />
    </Frame>
  );
}

/** 3. Both halves agree: the verdict locks. */
export function LockIcon() {
  return (
    <Frame>
      <motion.path
        d="M80 15a40 40 0 0 0 0 80z"
        className="fill-side-a"
        initial={{ transform: "translateX(-18px)", opacity: 0.4 }}
        whileInView={{ transform: "translateX(0px)", opacity: 1 }}
        viewport={view}
        transition={{ type: "spring", duration: 0.7, bounce: 0.25 }}
      />
      <motion.path
        d="M80 15a40 40 0 0 1 0 80z"
        className="fill-side-b"
        initial={{ transform: "translateX(18px)", opacity: 0.4 }}
        whileInView={{ transform: "translateX(0px)", opacity: 1 }}
        viewport={view}
        transition={{ type: "spring", duration: 0.7, bounce: 0.25 }}
      />
      <motion.path
        d="M64 56l11 11 22-23"
        fill="none"
        stroke="white"
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={view}
        transition={{ duration: 0.4, delay: 0.55, ease: EASE_OUT }}
      />
    </Frame>
  );
}
