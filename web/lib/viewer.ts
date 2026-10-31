"use client";

import type { RaterProfile, RatersFile, Side } from "./types";

export interface Viewer {
  intercept: number;
  factor: number;
  side: Side;
  source: "calibrated" | "sample";
}

const KEY = "fastnotes.viewer";

export function saveViewer(v: Viewer): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // Private mode etc.: the viewer just isn't remembered.
  }
}

export function readViewer(): Viewer | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Viewer) : null;
  } catch {
    return null;
  }
}

export function sampleViewer(raters: RatersFile): Viewer {
  const r: RaterProfile = raters.raters.find((x) => x.isSampleViewer) ?? raters.raters[0];
  return { intercept: r.intercept, factor: r.factor, side: r.side, source: "sample" };
}
