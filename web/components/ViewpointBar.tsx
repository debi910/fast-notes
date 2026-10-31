import type { Side } from "@/lib/types";

export const SIDE_LABEL: Record<Side, string> = { A: "Side A", B: "Side B", C: "Centre" };
export const SIDE_TEXT: Record<Side, string> = { A: "text-side-a", B: "text-side-b", C: "text-side-c" };
export const SIDE_BG: Record<Side, string> = { A: "bg-side-a", B: "bg-side-b", C: "bg-side-c" };

const RANGE = 1.5;

/** Neutral left-to-right viewpoint bar. Never labelled with politics. */
export function ViewpointBar({ factor, side }: { factor: number; side: Side }) {
  const pct = ((Math.max(-RANGE, Math.min(RANGE, factor)) + RANGE) / (2 * RANGE)) * 100;
  return (
    <div>
      <div className="relative h-3 rounded-full bg-gradient-to-r from-side-a/60 via-stone-200 to-side-b/60 dark:via-stone-700">
        <div
          className={`absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-background ${SIDE_BG[side]} shadow transition-all duration-500`}
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-stone-500">
        <span className="text-side-a">Side A</span>
        <span>
          You: {SIDE_LABEL[side]} ({factor >= 0 ? "+" : ""}
          {factor.toFixed(2)})
        </span>
        <span className="text-side-b">Side B</span>
      </div>
    </div>
  );
}
