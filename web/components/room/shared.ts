import type { RatingValue, Side, Verdict } from "@/lib/types";

export type Phase = "running" | "waiting" | "settled";

export interface Placed {
  kind: "bot" | "human";
  raterId: string;
  name?: string;
  value: RatingValue;
  raterIntercept: number;
  raterFactor: number;
  side: Side;
}

export interface RoomState {
  round: number;
  placed: Placed[];
  phase: Phase;
  /** Peer id the room is paused for, when their side is the missing one. */
  waitingFor: string | null;
  waitStartedAt: number | null;
  asked: string[];
}

export type RoomMsg =
  | { t: "state"; from: string; s: RoomState }
  | { t: "rate"; p: Placed }
  | { t: "restart" };

export interface Estimate {
  intercept: number;
  factor: number;
  verdict: Verdict;
}

export const SIM_MINUTES_PER_RATING = 0.5;

export const VALUE_LABEL: Record<string, string> = { "1": "Helpful", "0.5": "Somewhat helpful", "0": "Not helpful" };

export const SIDE_FILL: Record<Side, string> = { A: "fill-side-a", B: "fill-side-b", C: "fill-side-c" };
export const SIDE_STROKE: Record<Side, string> = { A: "stroke-side-a", B: "stroke-side-b", C: "stroke-side-c" };

export function fmtDuration(hours: number): string {
  if (hours < 1 / 60) return "under a minute";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
