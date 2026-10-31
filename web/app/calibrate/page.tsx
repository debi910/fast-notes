"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ViewpointBar } from "@/components/ViewpointBar";
import { loadRaters, loadShowcase, useData } from "@/lib/data";
import { fitViewer, sideOf } from "@/lib/model";
import { EASE_OUT } from "@/lib/motion";
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
  const showcase = useData(loadShowcase);
  const raters = useData(loadRaters);
  const [answers, setAnswers] = useState<RatingValue[]>([]);
  const [viewer, setViewer] = useState<Viewer | null>(null);

  const error = showcase.error ?? raters.error;
  if (error) return <p className="p-6 text-late">{error}</p>;
  if (!showcase.data || !raters.data) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className="card h-64 animate-pulse" />
      </div>
    );
  }

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
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <p className="text-sm font-semibold uppercase tracking-wider text-side-b">Step 1 of 2 · 15 seconds</p>
      <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Which side do you add to a room?</h1>
      <p className="mt-3 max-w-[56ch] text-muted">
        Rate {calib.length} real notes. Your answers place you on a neutral A ↔ B axis learned from how real Community Notes raters agree and
        disagree. It never uses political labels.
      </p>

      <div className="mt-6 flex gap-1.5" aria-label={`${answers.length} of ${calib.length} rated`}>
        {calib.map((n, i) => (
          <div key={n.id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <motion.div
              className="h-full bg-foreground"
              initial={false}
              animate={{ width: i < answers.length ? "100%" : "0%" }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
            />
          </div>
        ))}
      </div>

      <div className="relative mt-6">
        <AnimatePresence mode="popLayout" initial={false}>
          {!viewer && current && (
            <motion.div
              key={current.id}
              className="card p-6"
              initial={{ opacity: 0, transform: "translateX(24px)" }}
              animate={{ opacity: 1, transform: "translateX(0px)" }}
              exit={{ opacity: 0, transform: "translateX(-24px)", pointerEvents: "none" }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
            >
              <div className="text-xs font-medium text-muted">
                Note {answers.length + 1} of {calib.length}
              </div>
              <p className="mt-3 text-xl leading-snug">{current.summary}</p>
              <p className="mt-4 text-sm text-muted">Is this a helpful note?</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {CHOICES.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => answer(current.id, c.value)}
                    className="pressable rounded-xl border border-line bg-surface-2 px-2 py-3.5 text-sm font-semibold hover:border-foreground/30"
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
              className="card p-6"
              initial={{ opacity: 0, transform: "translateY(12px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
            >
              <p className="text-lg font-semibold">Here&apos;s where you land.</p>
              <p className="mt-1 text-sm text-muted">
                In a room you&apos;ll be asked to rate whenever Side {viewer.side} is missing.
              </p>
              <div className="mt-6">
                <ViewpointBar factor={viewer.factor} side={viewer.side} />
              </div>
              <button
                onClick={() => router.push(safeNext())}
                className="pressable mt-8 w-full rounded-full bg-foreground px-6 py-3.5 font-medium text-background hover:opacity-90"
              >
                Enter the room →
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!viewer && (
        <button onClick={pickSample} className="pressable mt-5 w-full rounded-full border border-dashed border-line px-6 py-3 text-sm font-medium text-muted hover:border-foreground/30 hover:text-foreground">
          Skip: use a sample viewer
        </button>
      )}
    </div>
  );
}
