"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ViewpointBar } from "@/components/ViewpointBar";
import { loadRaters, loadShowcase, useData } from "@/lib/data";
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
  const showcase = useData(loadShowcase);
  const raters = useData(loadRaters);
  const [answers, setAnswers] = useState<RatingValue[]>([]);
  const [viewer, setViewer] = useState<Viewer | null>(null);


  const error = showcase.error ?? raters.error;
  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!showcase.data || !raters.data) return <p className="p-6 text-stone-500">Loading…</p>;

  const s = showcase.data;
  const threshold = raters.data.sideThreshold;
  const calib: ShowcaseNote[] = s.calibrationNoteIds
    .map((id) => s.notes.find((n) => n.id === id))
    .filter((n): n is ShowcaseNote => Boolean(n));
  const current = calib[answers.length];

  function pickSample() {
    const v = sampleViewer(raters.data!);
    saveViewer(v);
    router.push(safeNext());
  }

  function answer(value: RatingValue) {
    const all = [...answers, value];
    setAnswers(all);
    if (all.length === calib.length) {
      const fit = fitViewer(
        all.map((v, i) => ({ value: v, noteIntercept: calib[i].fitted.intercept, noteFactor: calib[i].fitted.factor })),
        s.model,
      );
      const v: Viewer = { ...fit, side: sideOf(fit.factor, threshold), source: "calibrated" };
      saveViewer(v);
      setViewer(v);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Find your viewpoint</h1>
        <button onClick={pickSample} className="shrink-0 text-sm font-medium underline underline-offset-4">
          Use a sample viewer
        </button>
      </div>
      <p className="mt-2 text-stone-600 dark:text-stone-400">
        Rate {calib.length} real notes so the room knows which side you add. Takes 15 seconds. We only place you on a neutral
        A ↔ B axis, never a political label.
      </p>

      {!viewer && current && (
        <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-950">
          <div className="text-xs font-medium text-stone-500">
            Note {answers.length + 1} of {calib.length}
          </div>
          <p className="mt-2 text-lg">{current.summary}</p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {CHOICES.map((c) => (
              <button
                key={c.label}
                onClick={() => answer(c.value)}
                className="rounded-xl border border-stone-300 px-3 py-3 font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-900"
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {viewer && (
        <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-950">
          <p className="mb-6 font-medium">Here is where your ratings put you:</p>
          <ViewpointBar factor={viewer.factor} side={viewer.side} />
          <button
            onClick={() => router.push(safeNext())}
            className="mt-8 w-full rounded-full bg-foreground px-6 py-3 font-medium text-background hover:opacity-90"
          >
            Enter the room
          </button>
        </div>
      )}
    </div>
  );
}
