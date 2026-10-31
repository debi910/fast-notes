"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { EASE_IN_OUT, EASE_OUT } from "@/lib/motion";

// A looping story of one room: Side A rates, the room sees Side B is missing,
// recruits Side B, and the note settles.
const STEPS = 6;
const STEP_MS = 1500;

const A_PEOPLE = [
  [58, 90],
  [40, 160],
  [70, 225],
  [44, 290],
];
const B_PEOPLE = [
  [422, 90],
  [440, 160],
  [410, 225],
  [436, 290],
];
const CARD = { x: 150, y: 110, w: 180, h: 140 };
const TARGET: [number, number] = [CARD.x + CARD.w / 2, CARD.y + CARD.h / 2];

function Person({ x, y, side, active }: { x: number; y: number; side: "a" | "b"; active: boolean }) {
  const cls = side === "a" ? "fill-side-a" : "fill-side-b";
  return (
    <motion.g
      initial={false}
      animate={{ opacity: active ? 1 : 0.35 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
    >
      <circle cx={x} cy={y - 9} r={7} className={cls} />
      <path d={`M${x - 11} ${y + 12} a11 11 0 0 1 22 0z`} className={cls} />
    </motion.g>
  );
}

function Pill({ step }: { step: number }) {
  const state = step >= 4 ? "helpful" : step >= 2 ? "missing" : "nmr";
  const label = { nmr: "Needs more ratings", missing: "Side B missing", helpful: "Helpful ✓" }[state];
  const cls = { nmr: "fill-surface-2", missing: "fill-side-b", helpful: "fill-good" }[state];
  const text = state === "nmr" ? "fill-muted" : "fill-white";
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.g
        key={state}
        initial={{ opacity: 0, transform: "translateY(6px)", filter: "blur(2px)" }}
        animate={{ opacity: 1, transform: "translateY(0px)", filter: "blur(0px)" }}
        exit={{ opacity: 0, transform: "translateY(-6px)", filter: "blur(2px)" }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
      >
        <rect x={CARD.x + 16} y={CARD.y + CARD.h - 38} width={state === "nmr" ? 128 : 104} height={24} rx={12} className={cls} />
        <text x={CARD.x + 28} y={CARD.y + CARD.h - 22} className={`${text} text-[11px] font-semibold`}>
          {label}
        </text>
      </motion.g>
    </AnimatePresence>
  );
}

function Flyers({ from, side, show }: { from: number[][]; side: "a" | "b"; show: boolean }) {
  const cls = side === "a" ? "fill-side-a" : "fill-side-b";
  return (
    <>
      {from.map(([x, y], i) => (
        <motion.circle
          key={i}
          r={5}
          className={cls}
          initial={false}
          animate={
            show
              ? { cx: [x, TARGET[0] + (side === "a" ? -40 : 40) + i * 6 - 9], cy: [y, CARD.y + 18 + i * 4], opacity: [0, 1, 0] }
              : { cx: x, cy: y, opacity: 0 }
          }
          transition={show ? { duration: 1.1, delay: i * 0.08, ease: EASE_IN_OUT, times: [0, 0.7, 1] } : { duration: 0 }}
        />
      ))}
    </>
  );
}

export function HeroIllustration() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setStep((s) => (s + 1) % STEPS), STEP_MS);
    return () => clearInterval(id);
  }, [reduce]);

  const s = reduce ? 4 : step;
  const needle = s >= 3 ? 0 : s >= 1 ? -38 : -10;

  return (
    <svg viewBox="0 0 480 380" className="w-full" role="img" aria-label="Raters from two sides meet in a room and settle a note">
      <defs>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--good)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--good)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <motion.circle
        cx={TARGET[0]}
        cy={TARGET[1]}
        r={150}
        fill="url(#glow)"
        initial={false}
        animate={{ opacity: s >= 4 ? 1 : 0 }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
      />

      {/* connection lines */}
      {[...A_PEOPLE.map((p) => ({ p, side: "a" as const })), ...B_PEOPLE.map((p) => ({ p, side: "b" as const }))].map(({ p, side }, i) => (
        <motion.path
          key={i}
          d={`M${p[0]} ${p[1]} Q ${(p[0] + TARGET[0]) / 2} ${p[1]} ${side === "a" ? CARD.x : CARD.x + CARD.w} ${TARGET[1]}`}
          fill="none"
          strokeWidth={1.5}
          strokeDasharray="3 5"
          className={side === "a" ? "stroke-side-a" : "stroke-side-b"}
          initial={false}
          animate={{ opacity: (side === "a" ? s >= 1 : s >= 3) ? 0.6 : 0.12 }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
        />
      ))}

      {A_PEOPLE.map(([x, y], i) => (
        <Person key={`a${i}`} x={x} y={y} side="a" active={s >= 1} />
      ))}
      {B_PEOPLE.map(([x, y], i) => (
        <g key={`b${i}`}>
          {s === 2 && !reduce && (
            <motion.circle
              cx={x}
              cy={y}
              r={18}
              fill="none"
              strokeWidth={2}
              className="stroke-side-b"
              initial={{ opacity: 0.8, scale: 0.8 }}
              animate={{ opacity: 0, scale: 1.6 }}
              transition={{ duration: 1.2, ease: EASE_OUT, repeat: 1 }}
              style={{ transformOrigin: `${x}px ${y}px` }}
            />
          )}
          <Person x={x} y={y} side="b" active={s >= 2} />
        </g>
      ))}

      <text x={50} y={340} textAnchor="middle" className="fill-side-a text-[12px] font-semibold">
        Side A
      </text>
      <text x={430} y={340} textAnchor="middle" className="fill-side-b text-[12px] font-semibold">
        Side B
      </text>

      {/* the note */}
      <motion.rect
        x={CARD.x}
        y={CARD.y}
        width={CARD.w}
        height={CARD.h}
        rx={18}
        className="fill-surface"
        strokeWidth={2}
        initial={false}
        animate={{ stroke: s >= 4 ? "var(--good)" : "var(--line)" }}
        transition={{ duration: 0.4 }}
        style={{ filter: "drop-shadow(0 12px 24px rgb(0 0 0 / 0.08))" }}
      />
      <rect x={CARD.x + 16} y={CARD.y + 18} width={70} height={8} rx={4} className="fill-muted" opacity={0.5} />
      <rect x={CARD.x + 16} y={CARD.y + 38} width={148} height={7} rx={3.5} className="fill-line" />
      <rect x={CARD.x + 16} y={CARD.y + 52} width={132} height={7} rx={3.5} className="fill-line" />
      <rect x={CARD.x + 16} y={CARD.y + 66} width={96} height={7} rx={3.5} className="fill-line" />
      <Pill step={s} />

      <Flyers from={A_PEOPLE} side="a" show={s === 1} />
      <Flyers from={B_PEOPLE} side="b" show={s === 3} />

      {/* balance meter under the card */}
      <g transform={`translate(${TARGET[0]} 312)`}>
        <path d="M-56 0 A56 56 0 0 1 56 0" fill="none" strokeWidth={8} strokeLinecap="round" className="stroke-line" />
        <path d="M-56 0 A56 56 0 0 1 -20 -52" fill="none" strokeWidth={8} strokeLinecap="round" className="stroke-side-a" opacity={0.7} />
        <path d="M20 -52 A56 56 0 0 1 56 0" fill="none" strokeWidth={8} strokeLinecap="round" className="stroke-side-b" opacity={0.7} />
        <motion.line
          x1={0}
          y1={0}
          x2={0}
          y2={-46}
          strokeWidth={3}
          strokeLinecap="round"
          className="stroke-foreground"
          initial={false}
          animate={{ rotate: needle }}
          transition={{ type: "spring", duration: 0.8, bounce: 0.3 }}
          style={{ transformOrigin: "0px 0px" }}
        />
        <circle r={5} className="fill-foreground" />
        <text y={22} textAnchor="middle" className="fill-muted text-[10px] font-medium uppercase tracking-wider">
          balance
        </text>
      </g>
    </svg>
  );
}
