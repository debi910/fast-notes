"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SIDE_BG, SIDE_LABEL, SIDE_TEXT, ViewpointBar } from "@/components/ViewpointBar";
import { buildBrief } from "@/lib/brief";
import { findNote, loadRaters, loadShowcase, useData } from "@/lib/data";
import { missingSide, refitNote, sideOf, verdict } from "@/lib/model";
import type { ModelConfig, NoteRating, RatingValue, ShowcaseNote, Side, Verdict } from "@/lib/types";
import { readViewer, sampleViewer, type Viewer } from "@/lib/viewer";

// Simulated live arrival: one rating per participant every ~30 s.
const SIM_MINUTES_PER_RATING = 0.5;
const DECIDED_STREAK_TO_LOCK = 3;

interface Placed {
  who: "bot" | "you";
  raterId: string;
  value: RatingValue;
  raterIntercept: number;
  raterFactor: number;
  side: Side;
}

type Phase = "running" | "waiting" | "settled";

const VALUE_LABEL: Record<string, string> = { "1": "Helpful", "0.5": "Somewhat helpful", "0": "Not helpful" };
const CHOICES: { value: RatingValue; label: string }[] = [
  { value: 1, label: "Helpful" },
  { value: 0.5, label: "Somewhat" },
  { value: 0, label: "Not helpful" },
];

function fmtH(h: number | null): string {
  return h === null ? "–" : `${h.toFixed(1)} h`;
}

/** Live version of targeted_order in pipeline/fastnotes/refit.py: next rater comes from the
 *  factor sign with less accumulated |f_u| (viewer included), largest |f_u| first. */
function pickNext(remaining: NoteRating[], placed: Placed[]): NoteRating {
  let massA = 0;
  let massB = 0;
  for (const p of placed) {
    if (p.raterFactor > 0) massB += Math.abs(p.raterFactor);
    else massA += Math.abs(p.raterFactor);
  }
  const wantPositive = massA > massB;
  const pool = remaining.filter((r) => r.raterFactor > 0 === wantPositive);
  let best: NoteRating | null = null;
  for (const r of pool.length ? pool : remaining) {
    if (!best || Math.abs(r.raterFactor) > Math.abs(best.raterFactor)) best = r;
  }
  return best!;
}

function verdictPath(placed: Placed[], m: ModelConfig): Verdict[] {
  return placed.map((_, k) => {
    const prefix = placed.slice(0, k + 1);
    const e = refitNote(prefix, m);
    return verdict(e.intercept, e.factor, prefix.length, m);
  });
}

export function Room({ roomId }: { roomId: string }) {
  const showcase = useData(loadShowcase);
  const raters = useData(loadRaters);
  const error = showcase.error ?? raters.error;
  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!showcase.data || !raters.data) return <p className="p-6 text-stone-500">Opening room…</p>;
  const note = findNote(showcase.data, roomId);
  const fallback = sampleViewer(raters.data);
  return (
    <RoomInner
      key={note.id}
      note={note}
      allNotes={showcase.data.notes}
      model={showcase.data.model}
      threshold={raters.data.sideThreshold}
      isMock={showcase.data.isMock}
      fallbackViewer={fallback}
    />
  );
}

function RoomInner({
  note,
  allNotes,
  model,
  threshold,
  isMock,
  fallbackViewer,
}: {
  note: ShowcaseNote;
  allNotes: ShowcaseNote[];
  model: ModelConfig;
  threshold: number;
  isMock: boolean;
  fallbackViewer: Viewer;
}) {
  const [viewer] = useState<Viewer>(() => readViewer() ?? fallbackViewer);
  const [invite] = useState(() => new URLSearchParams(window.location.search).has("invite"));
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [phase, setPhase] = useState<Phase>("running");
  const [askedYou, setAskedYou] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const [copied, setCopied] = useState(false);

  const est = useMemo(() => {
    const e = refitNote(placed, model);
    return { ...e, verdict: verdict(e.intercept, e.factor, placed.length, model) };
  }, [placed, model]);
  const miss = missingSide(placed, threshold, model);
  const youRated = placed.some((p) => p.who === "you");
  const botsPlaced = placed.filter((p) => p.who === "bot").length;

  useEffect(() => {
    if (phase !== "running") return;
    const id = setTimeout(
      () => {
        // 1. Lock the verdict once it is decided and stable.
        const path = verdictPath(placed, model);
        let streak = 0;
        for (let i = path.length - 1; i >= 0 && path[i] !== "UNDECIDED" && path[i] === path[path.length - 1]; i--) streak++;
        const kTarget = note.replay.kTargeted ?? Infinity;
        if (streak > 0 && (botsPlaced >= kTarget || streak >= DECIDED_STREAK_TO_LOCK)) {
          setPhase("settled");
          return;
        }
        const used = new Set(placed.map((p) => p.raterId));
        const remaining = note.ratings.filter((r) => !used.has(r.raterId));
        if (remaining.length === 0) {
          setPhase("settled");
          return;
        }
        // 2. Route by need: if the viewer's side is the missing one, ask them.
        if (!youRated && !askedYou && placed.length >= 1 && viewer.side === missingSide(placed, threshold, model).side) {
          setAskedYou(true);
          setPhase("waiting");
          return;
        }
        // 3. Otherwise a bot from the missing side replays its real rating.
        const r = pickNext(remaining, placed);
        setPlaced((prev) => [...prev, { ...r, who: "bot", side: sideOf(r.raterFactor, threshold) }]);
      },
      placed.length === 0 ? 700 : placed.length < 10 ? 1000 : 450,
    );
    return () => clearTimeout(id);
  }, [phase, placed, model, note, threshold, viewer, youRated, askedYou, botsPlaced]);

  function rate(value: RatingValue) {
    if (youRated || phase === "settled") return;
    setPlaced((prev) => [
      ...prev,
      { who: "you", raterId: "you", value, raterIntercept: viewer.intercept, raterFactor: viewer.factor, side: viewer.side },
    ]);
    setPhase("running");
  }

  function restart() {
    setPlaced([]);
    setAskedYou(false);
    setPhase("running");
  }

  const t = note.timeline;
  const nextNote = allNotes.filter((n) => n.fitted.verdict !== "UNDECIDED" && n.id !== note.id)[0];
  const simMinutes = Math.max(1, Math.round(placed.length * SIM_MINUTES_PER_RATING));
  const brief = buildBrief(note, placed, est, threshold, model);

  const ratingPanel = (
    <section
      className={`rounded-2xl border p-5 ${phase === "waiting" ? "border-2 border-foreground bg-white dark:bg-stone-950" : "border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950"}`}
    >
      <div className="mb-4">
        <ViewpointBar factor={viewer.factor} side={viewer.side} />
        {viewer.source === "sample" && (
          <p className="mt-2 text-xs text-stone-500">
            Sample viewer. <Link href={`/calibrate?next=/room/${note.id}`} className="underline">Calibrate yourself</Link>
          </p>
        )}
      </div>
      {youRated ? (
        <p className="text-sm text-stone-600 dark:text-stone-400">Thanks, your rating is in. Watch the meter.</p>
      ) : phase === "settled" ? (
        <p className="text-sm text-stone-600 dark:text-stone-400">This note is settled.</p>
      ) : (
        <>
          <p className="font-medium">
            {phase === "waiting" || miss.side === viewer.side
              ? `${SIDE_LABEL[viewer.side]} is missing. Your rating is needed.`
              : "Your side is covered for now. You can still rate."}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {CHOICES.map((c) => (
              <button
                key={c.label}
                onClick={() => rate(c.value)}
                className="rounded-xl border border-stone-300 px-2 py-3 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-900"
              >
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-6 lg:grid-cols-[3fr_2fr]">
      <div className="space-y-5">
        {isMock && (
          <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Mock data while the real Community Notes replay is being computed.
          </p>
        )}

        <section className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-950">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>Community Note · room {note.id}</span>
            <a className="underline" href={`https://x.com/i/status/${note.tweetId}`} target="_blank" rel="noreferrer">
              View post
            </a>
          </div>
          <p className="mt-2 text-lg leading-snug">{note.summary}</p>
          <ol className="mt-4 grid grid-cols-3 gap-2 text-xs">
            <li className="rounded-lg bg-stone-100 p-2 dark:bg-stone-900">
              <div className="text-stone-500">Post</div>
              <div className="font-medium">0 h</div>
            </li>
            <li className="rounded-lg bg-stone-100 p-2 dark:bg-stone-900">
              <div className="text-stone-500">Note written</div>
              <div className="font-medium">+{fmtH(t.hoursPostToNote)}</div>
            </li>
            <li className="rounded-lg bg-stone-100 p-2 dark:bg-stone-900">
              <div className="text-stone-500">X verdict</div>
              <div className="font-medium">{t.hoursNoteToStatus === null ? "never" : `+${fmtH(t.hoursNoteToStatus)} after note`}</div>
            </li>
          </ol>
        </section>

        <div className="lg:hidden">{ratingPanel}</div>

        {phase === "settled" && (
          <section className="rounded-2xl border-2 border-foreground p-5" role="status">
            <div className="text-sm font-medium uppercase tracking-wide text-stone-500">Verdict locked</div>
            {est.verdict === "UNDECIDED" ? (
              <p className="mt-1 text-xl font-semibold">No consensus after {placed.length} ratings.</p>
            ) : (
              <p className="mt-1 text-xl font-semibold">
                {est.verdict === "HELPFUL" ? "Helpful" : "Not helpful"} · settled in ~{simMinutes} min with {placed.length} ratings
                {t.hoursNoteToStatus !== null && <> · X took {t.hoursNoteToStatus.toFixed(1)} h</>}
              </p>
            )}
            <p className="mt-1 text-xs text-stone-500">
              Ratings and raters are real{isMock ? " (mock for now)" : ""}; live arrival timing is simulated at one rating per ~30 s.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <button onClick={restart} className="rounded-full border border-stone-300 px-4 py-2 dark:border-stone-700">
                Replay this room
              </button>
              {nextNote && (
                <Link href={`/room/${nextNote.id}`} className="rounded-full border border-stone-300 px-4 py-2 dark:border-stone-700">
                  Try another note
                </Link>
              )}
            </div>
          </section>
        )}

        <Meter placed={placed} est={est} model={model} miss={miss} phase={phase} />

        <section className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-950">
          <button onClick={() => setShowBrief((s) => !s)} className="flex w-full items-center justify-between text-left font-medium">
            Evidence brief
            <span className="text-xs font-normal text-stone-500">{showBrief ? "Hide" : "Show"} · built from room data, not AI</span>
          </button>
          {showBrief && (
            <div className="mt-4 space-y-4 text-sm">
              {brief.map((s) => (
                <div key={s.heading}>
                  <h3 className="font-medium">{s.heading}</h3>
                  {s.lines.map((l) => (
                    <p key={l} className="text-stone-600 dark:text-stone-400">
                      {l}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="space-y-5">
        <div className="hidden lg:block">{ratingPanel}</div>

        {invite && (
          <section className="rounded-2xl border border-stone-200 bg-white p-5 text-sm dark:border-stone-800 dark:bg-stone-950">
            <p className="font-medium">Invite friends</p>
            <p className="mt-1 text-stone-600 dark:text-stone-400">
              Share this room. Live multi-human sync is coming next; until then real-rater bots fill the missing seats.
            </p>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(`${window.location.origin}/room/${note.id}`).then(() => setCopied(true));
              }}
              className="mt-3 rounded-full border border-stone-300 px-4 py-2 dark:border-stone-700"
            >
              {copied ? "Link copied" : "Copy room link"}
            </button>
          </section>
        )}

        <section className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-950">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">In the room</h2>
            <span className="text-xs text-stone-500">{placed.length + (youRated ? 0 : 1)} present</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {!youRated && <Avatar side={viewer.side} you title="You" />}
            {placed.map((p) => (
              <Avatar
                key={p.raterId}
                side={p.side}
                you={p.who === "you"}
                title={p.who === "you" ? "You" : `Replaying real rater #${p.raterId}`}
              />
            ))}
          </div>
          <ul className="mt-4 space-y-1.5 text-xs">
            {placed
              .slice(-6)
              .reverse()
              .map((p) => (
                <li key={p.raterId} className="flex justify-between gap-2">
                  <span className={SIDE_TEXT[p.side]}>{p.who === "you" ? "You" : `Replaying real rater #${p.raterId}`}</span>
                  <span className="text-stone-500">{VALUE_LABEL[String(p.value)]}</span>
                </li>
              ))}
            {placed.length === 0 && <li className="text-stone-500">Raters are joining…</li>}
          </ul>
          <p className="mt-3 text-xs text-stone-500">Solo mode: bots replay real raters&apos;  actual ratings on this note.</p>
        </section>
      </aside>
    </div>
  );
}

function Avatar({ side, you, title }: { side: Side; you?: boolean; title: string }) {
  return (
    <span
      title={title}
      className={`pop-in inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white ${SIDE_BG[side]} ${you ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""}`}
    >
      {you ? "You" : side}
    </span>
  );
}

function Meter({
  placed,
  est,
  model,
  miss,
  phase,
}: {
  placed: Placed[];
  est: { intercept: number; factor: number; verdict: Verdict };
  model: ModelConfig;
  miss: { side: "A" | "B" | null; need: number };
  phase: Phase;
}) {
  const W = 560;
  const H = 170;
  const R = 1.5;
  const x = (f: number) => 20 + ((Math.max(-R, Math.min(R, f)) + R) / (2 * R)) * (W - 40);
  const y = (v: number) => 24 + (1 - v) * (H - 56);
  const jitter = (i: number) => ((i * 37) % 11) - 5;

  const iPct = Math.max(0, Math.min(1, (est.intercept + 0.2) / 1.0));
  const iThreshPct = (model.helpfulInterceptMin + 0.2) / 1.0;
  const fPct = Math.min(1, Math.abs(est.factor) / 1.0);

  let message: string;
  if (phase === "settled") message = "Verdict locked.";
  else if (placed.length < model.minRatings && !miss.side) message = `Need ${model.minRatings - placed.length} more ratings.`;
  else if (miss.side) message = `Need ${miss.need} more rater${miss.need === 1 ? "" : "s"} from ${SIDE_LABEL[miss.side]}.`;
  else if (est.verdict === "UNDECIDED") message = "Both sides present. Waiting for agreement.";
  else message = "Both sides agree. Confirming…";

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-950">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-medium">Missing-viewpoint meter</h2>
        <span className={`text-sm font-medium ${miss.side && phase !== "settled" ? SIDE_TEXT[miss.side] : ""}`} aria-live="polite">
          {message}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Ratings plotted by rater viewpoint">
        {[1, 0.5, 0].map((v) => (
          <g key={v}>
            <line x1={20} x2={W - 20} y1={y(v)} y2={y(v)} className="stroke-stone-200 dark:stroke-stone-800" />
            <text x={W - 20} y={y(v) - 5} textAnchor="end" className="fill-stone-400 text-[10px]">
              {VALUE_LABEL[String(v)]}
            </text>
          </g>
        ))}
        <line x1={W / 2} x2={W / 2} y1={12} y2={H - 28} className="stroke-stone-300 dark:stroke-stone-700" strokeDasharray="3 3" />
        <text x={24} y={H - 8} className="fill-side-a text-[11px] font-medium">
          ← Side A
        </text>
        <text x={W - 24} y={H - 8} textAnchor="end" className="fill-side-b text-[11px] font-medium">
          Side B →
        </text>
        {placed.map((p, i) => (
          <circle
            key={p.raterId}
            cx={x(p.raterFactor)}
            cy={y(p.value) + jitter(i)}
            r={p.who === "you" ? 8 : 6}
            className={`pop-in ${p.side === "A" ? "fill-side-a" : p.side === "B" ? "fill-side-b" : "fill-side-c"} ${p.who === "you" ? "stroke-foreground" : "stroke-background"}`}
            strokeWidth={2}
            style={{ transformOrigin: `${x(p.raterFactor)}px ${y(p.value) + jitter(i)}px` }}
          />
        ))}
      </svg>
      <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
        <div>
          <div className="flex justify-between text-stone-500">
            <span>Helpfulness (i_n)</span>
            <span className="font-mono">{est.intercept.toFixed(2)}</span>
          </div>
          <div className="relative mt-1 h-2 rounded-full bg-stone-200 dark:bg-stone-800">
            <div className="h-2 rounded-full bg-foreground transition-all duration-500" style={{ width: `${iPct * 100}%` }} />
            <div className="absolute -top-1 h-4 w-0.5 bg-emerald-600" style={{ left: `${iThreshPct * 100}%` }} title="Helpful threshold" />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-stone-500">
            <span>One-sidedness |f_n|</span>
            <span className="font-mono">{Math.abs(est.factor).toFixed(2)}</span>
          </div>
          <div className="relative mt-1 h-2 rounded-full bg-stone-200 dark:bg-stone-800">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${Math.abs(est.factor) < model.maxAbsFactor ? "bg-foreground" : "bg-red-500"}`}
              style={{ width: `${fPct * 100}%` }}
            />
            <div className="absolute -top-1 h-4 w-0.5 bg-red-500" style={{ left: `${model.maxAbsFactor * 100}%` }} title="Max allowed" />
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-stone-500">
        {placed.length} rating{placed.length === 1 ? "" : "s"} · model verdict:{" "}
        <span className="font-medium text-foreground">{est.verdict.replace("_", " ").toLowerCase()}</span> · refit live in your browser
      </p>
    </section>
  );
}
