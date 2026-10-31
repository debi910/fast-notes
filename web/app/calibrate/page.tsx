"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SIDE_LABEL, SIDE_TEXT } from "@/components/ViewpointBar";
import { loadRaters, loadShowcase, useData } from "@/lib/data";
import { EASE_OUT, SPRING } from "@/lib/motion";
import { fitViewer, sideOf } from "@/lib/model";
import type { RatingValue, ShowcaseNote } from "@/lib/types";
import { sampleViewer, saveViewer, type Viewer } from "@/lib/viewer";

const CHOICES: { value: RatingValue; label: string }[] = [
  { value: 1, label: "Helpful" },
  { value: 0.5, label: "Somewhat" },
  { value: 0, label: "Not helpful" },
];

function safeNext(): string {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/room/demo";
}

export default function CalibratePage() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const showcase = useData(loadShowcase);
  const raters = useData(loadRaters);
  const [answers, setAnswers] = useState<RatingValue[]>([]);
  const [viewer, setViewer] = useState<Viewer | null>(null);

  const error = showcase.error ?? raters.error;
  if (error) return <p className="p-6 text-late">{error}</p>;
  if (!showcase.data || !raters.data)
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className="card h-72 animate-pulse bg-surface-2/60" />
      </div>
    );

  const s = showcase.data;
  const calib: ShowcaseNote[] = s.calibrationNoteIds
    .map((id) => s.notes.find((n) => n.id === id))
    .filter((n): n is ShowcaseNote => Boolean(n));
  const current = calib[answers.length];

  function pickSample() {
    saveViewer(sampleViewer(raters.data!));
    router.push(safeNext());
  }

  function answer(noteId: string, value: RatingValue) {
    if (noteId !== current?.id) return; // a click on the card that is animating out
    const all = [...answers, value];
    setAnswers(all);
    if (all.length === calib.length) {
      const fit = fitViewer(
        all.map((v, i) => ({ value: v, noteIntercept: calib[i].fitted.intercept, noteFactor: calib[i].fitted.factor })),
        s.model,
      );
      const v: Viewer = { ...fit, side: sideOf(fit.factor, 0), source: "calibrated" };
      saveViewer(v);
      setViewer(v);
    }
  }

  return (
    <div className="relative flex-1">
      <div className="dot-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_0%,black,transparent_65%)]" />
      <div className="relative mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-semibold uppercase tracking-wider text-side-a">Step 1 of 2 · Find your seat</p>
          <button onClick={pickSample} className="pressable shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:border-foreground/30">
            Skip: use a sample viewer
          </button>
        </div>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Rate {calib.length} real notes so the room knows which side you bring.</h1>
        <p className="mt-3 text-muted">
          Takes about 15 seconds. You land on a neutral Side A ↔ Side B line learned from real raters. No political labels, nothing
          leaves your browser.
        </p>

        {/* progress */}
        <div className="mt-8 flex gap-1.5" aria-label={`${answers.length} of ${calib.length} answered`}>
          {calib.map((n, i) => (
            <div key={n.id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <motion.div
                className="h-full rounded-full bg-foreground"
                initial={false}
                animate={{ width: i < answers.length ? "100%" : "0%" }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
              />
            </div>
          ))}
        </div>

        <div className="relative mt-5">
          <AnimatePresence mode="popLayout" initial={false}>
            {!viewer && current && (
              <motion.div
                key={current.id}
                initial={{ opacity: 0, transform: reduce ? "none" : "translateX(40px) rotate(2deg)" }}
                animate={{ opacity: 1, transform: "translateX(0px) rotate(0deg)" }}
                exit={{ opacity: 0, transform: reduce ? "none" : "translateX(-60px) rotate(-3deg)", pointerEvents: "none" }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
                className="card p-6"
              >
                <div className="flex items-center justify-between text-xs font-medium text-muted">
                  <span>
                    Note {answers.length + 1} of {calib.length}
                  </span>
                  <span>Readers added context</span>
                </div>
                <p className="mt-3 text-lg leading-relaxed">{current.summary}</p>
                <p className="mt-4 text-sm text-muted">Would this note help someone who saw the post?</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {CHOICES.map((c) => (
                    <button
                      key={c.label}
                      onClick={() => answer(current.id, c.value)}
                      className="pressable rounded-xl border border-line bg-surface px-3 py-3.5 font-medium hover:border-foreground/40 hover:bg-surface-2"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {viewer && (
              <motion.div
                key="result"
                initial={{ opacity: 0, transform: "translateY(12px) scale(0.98)" }}
                animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
                transition={SPRING}
                className="card p-6"
              >
                <p className="text-sm font-medium text-muted">Your ratings put you here</p>
                <h2 className={`mt-1 text-3xl font-semibold ${SIDE_TEXT[viewer.side]}`}>
                  {viewer.side === "C" ? "Near the centre" : SIDE_LABEL[viewer.side]}
                </h2>
                <Spectrum factor={viewer.factor} side={viewer.side} />
                <p className="mt-5 text-sm text-muted">
                  In a room, when {viewer.side === "C" ? "a side" : SIDE_LABEL[viewer.side]} is missing, you&apos;ll be asked first.
                  When your side is already covered, you can watch.
                </p>
                <button
                  onClick={() => router.push(safeNext())}
                  className="pressable mt-6 w-full rounded-full bg-foreground px-6 py-3.5 font-medium text-background hover:opacity-90"
                >
                  Enter the room →
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/** Crowd of past raters along the A↔B line, with you dropping into place. */
function Spectrum({ factor, side }: { factor: number; side: "A" | "B" | "C" }) {
  const W = 520;
  const R = 1.5;
  const x = (f: number) => 20 + ((Math.max(-R, Math.min(R, f)) + R) / (2 * R)) * (W - 40);
  const crowd = Array.from({ length: 46 }, (_, i) => {
    const f = Math.sin(i * 12.9898) * 1.35;
    return { f, y: 50 + ((i * 7) % 5) * 7 };
  });
  const cls = side === "A" ? "fill-side-a" : side === "B" ? "fill-side-b" : "fill-side-c";
  return (
    <svg viewBox={`0 0 ${W} 120`} className="mt-4 w-full" role="img" aria-label={`You sit at ${factor.toFixed(2)} on the Side A to Side B line`}>
      <defs>
        <linearGradient id="spec" x1="0" x2="1">
          <stop offset="0%" stopColor="var(--side-a)" />
          <stop offset="50%" stopColor="var(--line)" />
          <stop offset="100%" stopColor="var(--side-b)" />
        </linearGradient>
      </defs>
      {crowd.map((c, i) => (
        <motion.circle
          key={i}
          cx={x(c.f)}
          cy={c.y}
          r={4}
          className={c.f < -0.3 ? "fill-side-a" : c.f > 0.3 ? "fill-side-b" : "fill-side-c"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
          transition={{ delay: i * 0.012, duration: 0.3 }}
        />
      ))}
      <rect x={20} y={88} width={W - 40} height={6} rx={3} fill="url(#spec)" opacity={0.8} />
      <motion.g
        initial={{ x: W / 2 - x(factor), y: -50, opacity: 0 }}
        animate={{ x: 0, y: 0, opacity: 1 }}
        transition={{ type: "spring", duration: 0.9, bounce: 0.3, delay: 0.25 }}
      >
        <line x1={x(factor)} x2={x(factor)} y1={34} y2={88} strokeWidth={2} className="stroke-foreground" />
        <circle cx={x(factor)} cy={91} r={9} strokeWidth={3} className={`${cls} stroke-surface`} />
        <rect x={x(factor) - 20} y={12} width={40} height={20} rx={10} className="fill-foreground" />
        <text x={x(factor)} y={26} textAnchor="middle" className="fill-background text-[11px] font-semibold">
          You
        </text>
      </motion.g>
      <text x={20} y={114} className="fill-side-a text-[11px] font-semibold">
        Side A
      </text>
      <text x={W - 20} y={114} textAnchor="end" className="fill-side-b text-[11px] font-semibold">
        Side B
      </text>
    </svg>
  );
}
