// Evidence brief built from room data with a template (no LLM, no API key).
// It summarises what the note claims, the real X timeline, and how each side is rating so far.

import type { ModelConfig, ShowcaseNote, Verdict } from "./types";
import { sideOf, type PointRating } from "./model";

export interface BriefSection {
  heading: string;
  lines: string[];
}

function fmtHours(h: number | null): string {
  if (h === null) return "unknown";
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${h.toFixed(1)} h`;
}

function sideSummary(label: string, rs: PointRating[]): string {
  if (rs.length === 0) return `${label}: no ratings yet.`;
  const helpful = rs.filter((r) => r.value === 1).length;
  const somewhat = rs.filter((r) => r.value === 0.5).length;
  const not = rs.length - helpful - somewhat;
  const avg = rs.reduce((s, r) => s + r.value, 0) / rs.length;
  const lean = avg >= 0.7 ? "leans helpful" : avg <= 0.35 ? "leans not helpful" : "is split";
  return `${label}: ${rs.length} rating${rs.length === 1 ? "" : "s"} (${helpful} helpful, ${somewhat} somewhat, ${not} not helpful), ${lean}.`;
}

export function buildBrief(
  note: ShowcaseNote,
  ratings: PointRating[],
  estimate: { intercept: number; factor: number; verdict: Verdict },
  threshold: number,
  m: ModelConfig,
): BriefSection[] {
  const t = note.timeline;
  const a = ratings.filter((r) => sideOf(r.raterFactor, threshold) === "A");
  const b = ratings.filter((r) => sideOf(r.raterFactor, threshold) === "B");
  const c = ratings.filter((r) => sideOf(r.raterFactor, threshold) === "C");

  const claim =
    note.classification === "MISINFORMED_OR_POTENTIALLY_MISLEADING"
      ? "The note says the post is misleading and adds this context:"
      : "The note says the post is not misleading:";

  const timeline = [
    t.hoursPostToNote !== null ? `The note was written ${fmtHours(t.hoursPostToNote)} after the post.` : "The note's delay after the post is not known.",
    t.hoursNoteToStatus !== null
      ? `On X it took another ${fmtHours(t.hoursNoteToStatus)} to reach a status (${t.finalStatus.replaceAll("_", " ").toLowerCase()}).`
      : "On X it never left Needs More Ratings.",
    `X collected ${note.ratings.length} ratings on it in total.`,
  ];

  const sides = [sideSummary("Side A", a), sideSummary("Side B", b)];
  if (c.length) sides.push(sideSummary("Near the centre", c));

  const status: string[] = [];
  if (ratings.length < m.minRatings) {
    status.push(`${m.minRatings - ratings.length} more rating(s) before any verdict is possible.`);
  } else if (estimate.verdict === "HELPFUL") {
    status.push("Raters from both sides find it helpful, so the bridging model marks it Helpful.");
  } else if (estimate.verdict === "NOT_HELPFUL") {
    status.push("Raters across the spectrum find it unhelpful, so the model marks it Not Helpful.");
  } else if (Math.abs(estimate.factor) >= m.maxAbsFactor) {
    status.push("Support comes mostly from one side. The model will not call it until the other side agrees.");
  } else {
    status.push("Support is not yet strong enough on both sides to decide.");
  }
  status.push(
    `Current estimate: helpfulness ${estimate.intercept.toFixed(2)} (needs ≥ ${m.helpfulInterceptMin.toFixed(2)}), one-sidedness ${estimate.factor.toFixed(2)} (needs |x| < ${m.maxAbsFactor.toFixed(2)}).`,
  );

  return [
    { heading: "What the note claims", lines: [claim, `“${note.summary}”`] },
    { heading: "Real timeline on X", lines: timeline },
    { heading: "How each side is rating here", lines: sides },
    { heading: "What would settle it", lines: status },
  ];
}
