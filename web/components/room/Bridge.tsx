"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE_OUT, SPRING } from "@/lib/motion";
import type { Side, Verdict } from "@/lib/types";
import type { Phase, Placed } from "./shared";

// The room's centrepiece: a bridge between Side A and Side B.
// Each side's planks fill as that side's raters weigh in; the keystone drops in
// only when the bridging model decides. Same rule as Community Notes, drawn.

const W = 600;
const H = 250;
const PLANKS = 6; // per side
const X0 = 150;
const X1 = 450;
const DECK_Y = 150;
const SAG = 22;

function deckY(x: number) {
  const t = (x - X0) / (X1 - X0);
  return DECK_Y + SAG * 4 * t * (1 - t);
}

function Person({ x, y, side, human, delay }: { x: number; y: number; side: Side; human: boolean; delay: number }) {
  const cls = side === "A" ? "fill-side-a" : side === "B" ? "fill-side-b" : "fill-side-c";
  return (
    <motion.g
      initial={{ opacity: 0, transform: "translateY(-14px) scale(0.6)" }}
      animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
      transition={{ ...SPRING, delay }}
      style={{ transformOrigin: `${x}px ${y}px`, transformBox: "view-box" }}
    >
      {human && <circle cx={x} cy={y - 6} r={13} fill="none" strokeWidth={2} className="stroke-foreground" />}
      <circle cx={x} cy={y - 11} r={5} className={cls} />
      <path d={`M${x - 8} ${y + 4} a8 8 0 0 1 16 0z`} className={cls} />
    </motion.g>
  );
}

function crowd(list: Placed[], side: "A" | "B") {
  // Up to 10 people stacked on the cliff top, newest nearest the bridge.
  const baseX = side === "A" ? 120 : 480;
  const dir = side === "A" ? -1 : 1;
  return list.slice(-10).map((p, i) => {
    const row = Math.floor(i / 5);
    const col = i % 5;
    return { p, x: baseX + dir * (col * 20 + row * 10), y: 128 - row * 22 };
  });
}

export function Bridge({
  placed,
  target,
  verdict,
  missing,
  phase,
}: {
  placed: Placed[];
  target: number;
  verdict: Verdict;
  missing: "A" | "B" | null;
  phase: Phase;
}) {
  const reduce = useReducedMotion();
  const a = placed.filter((p) => p.side === "A");
  const b = placed.filter((p) => p.side === "B");
  const fillA = Math.round(Math.min(1, a.length / target) * PLANKS);
  const fillB = Math.round(Math.min(1, b.length / target) * PLANKS);
  const decided = verdict !== "UNDECIDED";
  const plankW = (X1 - X0) / (PLANKS * 2);
  const kx = W / 2;
  const ky = deckY(kx);

  return (
    <svg viewBox={`0 30 ${W} ${H - 30}`} className="w-full" role="img" aria-label={`Side A ${a.length} raters, Side B ${b.length} raters, verdict ${verdict.toLowerCase()}`}>
      <defs>
        <linearGradient id="cliffA" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--side-a)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--side-a)" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="cliffB" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--side-b)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--side-b)" stopOpacity="0.02" />
        </linearGradient>
        <radialGradient id="keyGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={verdict === "NOT_HELPFUL" ? "var(--late)" : "var(--good)"} stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--good)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* valley */}
      <path d={`M150 ${H} Q300 ${H - 70} 450 ${H}`} className="fill-surface-2" />
      {[0, 1, 2].map((i) => (
        <motion.path
          key={i}
          d={`M${190 + i * 30} ${H - 8 - i * 6} q20 -6 40 0 t40 0`}
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          className="stroke-line"
          animate={reduce ? undefined : { x: [0, 12, 0] }}
          transition={{ duration: 5 + i, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      {/* cliffs */}
      <path d={`M0 140 L135 140 Q150 140 152 152 L165 ${H} L0 ${H} Z`} fill="url(#cliffA)" />
      <path d={`M0 140 L135 140 Q150 140 152 152`} fill="none" strokeWidth={2} className="stroke-side-a" />
      <path d={`M${W} 140 L465 140 Q450 140 448 152 L435 ${H} L${W} ${H} Z`} fill="url(#cliffB)" />
      <path d={`M${W} 140 L465 140 Q450 140 448 152`} fill="none" strokeWidth={2} className="stroke-side-b" />

      <text x={24} y={170} className="fill-side-a text-[13px] font-semibold">Side A</text>
      <text x={24} y={188} className="fill-muted text-[11px] tabular">{a.length} rated</text>
      <text x={W - 24} y={170} textAnchor="end" className="fill-side-b text-[13px] font-semibold">Side B</text>
      <text x={W - 24} y={188} textAnchor="end" className="fill-muted text-[11px] tabular">{b.length} rated</text>

      {/* missing-side beacon */}
      <AnimatePresence>
        {missing && phase !== "settled" && (
          <motion.g
            key={missing}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {!reduce && (
              <motion.circle
                cx={missing === "A" ? 80 : 520}
                cy={110}
                r={34}
                fill="none"
                strokeWidth={2}
                className={missing === "A" ? "stroke-side-a" : "stroke-side-b"}
                initial={{ opacity: 0.7, scale: 0.6 }}
                animate={{ opacity: 0, scale: 1.5 }}
                transition={{ duration: 1.6, repeat: Infinity, ease: EASE_OUT }}
                style={{ transformOrigin: `${missing === "A" ? 80 : 520}px 110px`, transformBox: "view-box" }}
              />
            )}
            <rect
              x={(missing === "A" ? 80 : 520) - 52}
              y={40}
              width={104}
              height={24}
              rx={12}
              className={missing === "A" ? "fill-side-a" : "fill-side-b"}
            />
            <text x={missing === "A" ? 80 : 520} y={56} textAnchor="middle" className="fill-white text-[11px] font-semibold">
              Side {missing} needed
            </text>
          </motion.g>
        )}
      </AnimatePresence>

      {/* crowds */}
      {crowd(a, "A").map(({ p, x, y }) => (
        <Person key={p.raterId} x={x} y={y} side="A" human={p.kind === "human"} delay={0} />
      ))}
      {crowd(b, "B").map(({ p, x, y }) => (
        <Person key={p.raterId} x={x} y={y} side="B" human={p.kind === "human"} delay={0} />
      ))}

      {/* towers + ropes */}
      <line x1={X0} y1={DECK_Y} x2={X0} y2={92} strokeWidth={4} strokeLinecap="round" className="stroke-foreground/70" />
      <line x1={X1} y1={DECK_Y} x2={X1} y2={92} strokeWidth={4} strokeLinecap="round" className="stroke-foreground/70" />
      <path d={`M${X0} 92 Q${kx} ${ky - 20} ${X1} 92`} fill="none" strokeWidth={1.5} className="stroke-muted" />
      {Array.from({ length: PLANKS * 2 - 1 }, (_, i) => {
        const x = X0 + plankW * (i + 1);
        const t = (x - X0) / (X1 - X0);
        const ropeY = (1 - t) * (1 - t) * 92 + 2 * (1 - t) * t * (ky - 20) + t * t * 92;
        return <line key={i} x1={x} y1={ropeY} x2={x} y2={deckY(x) - 3} strokeWidth={1} className="stroke-line" />;
      })}

      {/* planks */}
      {Array.from({ length: PLANKS * 2 }, (_, i) => {
        const isA = i < PLANKS;
        const filled = isA ? i < fillA : PLANKS * 2 - 1 - i < fillB;
        const x = X0 + plankW * i + 1.5;
        const y = deckY(x + plankW / 2) - 4;
        return (
          <g key={i}>
            <rect x={x} y={y} width={plankW - 3} height={8} rx={2} fill="none" strokeDasharray="3 3" className="stroke-line" />
            <AnimatePresence>
              {filled && (
                <motion.rect
                  x={x}
                  y={y}
                  width={plankW - 3}
                  height={8}
                  rx={2}
                  className={isA ? "fill-side-a" : "fill-side-b"}
                  initial={{ opacity: 0, transform: "translateY(-18px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  exit={{ opacity: 0, transform: "translateY(10px)" }}
                  transition={SPRING}
                />
              )}
            </AnimatePresence>
          </g>
        );
      })}

      {/* keystone */}
      <motion.circle
        cx={kx}
        cy={ky}
        r={70}
        fill="url(#keyGlow)"
        initial={false}
        animate={{ opacity: decided ? 1 : 0 }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
      />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.g
          key={verdict}
          initial={{ opacity: 0, transform: "translateY(-30px) scale(0.7)" }}
          animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
          exit={{ opacity: 0, transform: "translateY(10px) scale(0.9)" }}
          transition={{ type: "spring", duration: 0.55, bounce: 0.35 }}
          style={{ transformOrigin: `${kx}px ${ky}px`, transformBox: "view-box" }}
        >
          <circle
            cx={kx}
            cy={ky}
            r={22}
            strokeWidth={3}
            className={
              verdict === "HELPFUL"
                ? "fill-good stroke-surface"
                : verdict === "NOT_HELPFUL"
                  ? "fill-late stroke-surface"
                  : "fill-surface stroke-line"
            }
          />
          {verdict === "HELPFUL" && (
            <motion.path
              d={`M${kx - 9} ${ky + 1} l6 6 l12 -13`}
              fill="none"
              stroke="white"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.4, delay: 0.2, ease: EASE_OUT }}
            />
          )}
          {verdict === "NOT_HELPFUL" && (
            <path d={`M${kx - 7} ${ky - 7} l14 14 M${kx + 7} ${ky - 7} l-14 14`} stroke="white" strokeWidth={3.5} strokeLinecap="round" />
          )}
          {verdict === "UNDECIDED" && (
            <text x={kx} y={ky + 6} textAnchor="middle" className="fill-muted text-[18px] font-semibold">
              ?
            </text>
          )}
        </motion.g>
      </AnimatePresence>
    </svg>
  );
}
