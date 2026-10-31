"use client";

import { useEffect, useState } from "react";
import type { RatersFile, ResultsFile, ShowcaseFile, ShowcaseNote } from "./types";

// Static JSON in public/data is the source of truth, so the demo works with no backend.
const cache = new Map<string, Promise<unknown>>();

function load<T>(name: string): Promise<T> {
  if (!cache.has(name)) {
    cache.set(
      name,
      fetch(`/data/${name}.json`).then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${name}.json (${r.status})`);
        return r.json();
      }),
    );
  }
  return cache.get(name) as Promise<T>;
}

export const loadShowcase = () => load<ShowcaseFile>("showcase_notes");
export const loadRaters = () => load<RatersFile>("raters");
export const loadResults = () => load<ResultsFile>("results");

export function useData<T>(loader: () => Promise<T>): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loader()
      .then((d) => live && setData(d))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [loader]);
  return { data, error };
}

/** The best solo-demo note: decided helpful, and where targeted ordering beats random the most. */
export function pickDemoNote(notes: ShowcaseNote[]): ShowcaseNote {
  const scored = notes
    .filter((n) => n.fitted.verdict === "HELPFUL" && n.replay.kTargeted && n.replay.kRandomMedian)
    .map((n) => ({ n, gain: (n.replay.kRandomMedian ?? 0) - (n.replay.kTargeted ?? 0) }))
    .sort((a, b) => b.gain - a.gain);
  return scored[0]?.n ?? notes[0];
}

export function findNote(file: ShowcaseFile, roomId: string): ShowcaseNote {
  if (roomId === "demo") return pickDemoNote(file.notes);
  return file.notes.find((n) => n.id === roomId || n.noteId === roomId) ?? pickDemoNote(file.notes);
}
