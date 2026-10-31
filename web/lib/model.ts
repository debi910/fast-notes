// TypeScript port of pipeline/fastnotes/refit.py. Keep the two in sync.
// rating ~ mu + i_u + i_n + f_u * f_n, rater params frozen, 2x2 ridge solve per note.

import type { ModelConfig, RatingValue, Side, Verdict } from "./types";

export interface PointRating {
  value: RatingValue;
  raterIntercept: number;
  raterFactor: number;
}

export const NOT_HELPFUL_INTERCEPT_MAX = -0.05;

export function refitNote(ratings: PointRating[], m: ModelConfig): { intercept: number; factor: number } {
  if (ratings.length === 0) return { intercept: 0, factor: 0 };
  let a12 = 0;
  let a22 = m.lambdaFactor;
  let b1 = 0;
  let b2 = 0;
  for (const r of ratings) {
    const y = r.value - m.mu - r.raterIntercept;
    a12 += r.raterFactor;
    a22 += r.raterFactor * r.raterFactor;
    b1 += y;
    b2 += r.raterFactor * y;
  }
  const a11 = ratings.length + m.lambdaIntercept;
  const det = a11 * a22 - a12 * a12;
  return {
    intercept: (a22 * b1 - a12 * b2) / det,
    factor: (a11 * b2 - a12 * b1) / det,
  };
}

export function verdict(intercept: number, factor: number, nRatings: number, m: ModelConfig): Verdict {
  if (nRatings < m.minRatings) return "UNDECIDED";
  if (intercept >= m.helpfulInterceptMin && Math.abs(factor) < m.maxAbsFactor) return "HELPFUL";
  if (intercept <= (m.notHelpfulInterceptMax ?? NOT_HELPFUL_INTERCEPT_MAX)) return "NOT_HELPFUL";
  return "UNDECIDED";
}

/** Estimate a viewer's (i_u, f_u) from their ratings on notes with known (i_n, f_n).
 *  Same ridge solve with the roles of rater and note swapped. */
export function fitViewer(
  ratings: { value: RatingValue; noteIntercept: number; noteFactor: number }[],
  m: ModelConfig,
): { intercept: number; factor: number } {
  return refitNote(
    ratings.map((r) => ({
      value: r.value,
      raterIntercept: r.noteIntercept,
      raterFactor: r.noteFactor,
    })),
    m,
  );
}

export function sideOf(factor: number, threshold: number): Side {
  if (Math.abs(factor) < threshold) return "C";
  return factor < 0 ? "A" : "B";
}

/** Which side a room still needs, and roughly how many more raters from it. */
export function missingSide(
  ratings: PointRating[],
  threshold: number,
  m: ModelConfig,
): { side: "A" | "B" | null; need: number } {
  let a = 0;
  let b = 0;
  for (const r of ratings) {
    const s = sideOf(r.raterFactor, threshold);
    if (s === "A") a++;
    else if (s === "B") b++;
  }
  const target = Math.max(2, Math.ceil(m.minRatings / 2));
  const needA = Math.max(0, target - a, b - a);
  const needB = Math.max(0, target - b, a - b);
  if (needA === 0 && needB === 0) return { side: null, need: 0 };
  return needA >= needB ? { side: "A", need: needA } : { side: "B", need: needB };
}
