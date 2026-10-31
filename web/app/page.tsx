import Link from "next/link";

const HALF_LIFE_H = 5.75; // Chuai et al.: half of reposts within 5.75 h
const NOTE_SHOWN_H = 18.1; // median post -> note display

function share(t: number): number {
  return 1 - Math.pow(2, -t / HALF_LIFE_H);
}

function SpreadChart() {
  const W = 560;
  const H = 220;
  const pad = { l: 40, r: 16, t: 16, b: 32 };
  const maxT = 24;
  const x = (t: number) => pad.l + (t / maxT) * (W - pad.l - pad.r);
  const y = (s: number) => H - pad.b - s * (H - pad.t - pad.b);
  const pts = Array.from({ length: 97 }, (_, i) => (i / 96) * maxT);
  const path = pts.map((t, i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(share(t)).toFixed(1)}`).join(" ");
  const marks = [
    { t: 2, label: "Fast Notes goal: hour 2", cls: "text-side-a" },
    { t: HALF_LIFE_H, label: "Half of reposts done", cls: "text-stone-500" },
    { t: NOTE_SHOWN_H, label: "Note shown on X (median)", cls: "text-red-600 dark:text-red-400" },
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Share of reposts over time, with the median note arrival at 18.1 hours">
      <line x1={pad.l} y1={y(0)} x2={W - pad.r} y2={y(0)} className="stroke-stone-300 dark:stroke-stone-700" />
      <line x1={pad.l} y1={y(0)} x2={pad.l} y2={y(1)} className="stroke-stone-300 dark:stroke-stone-700" />
      {[0, 6, 12, 18, 24].map((t) => (
        <text key={t} x={x(t)} y={H - 10} textAnchor="middle" className="fill-stone-500 text-[11px]">
          {t} h
        </text>
      ))}
      {[0, 0.5, 1].map((s) => (
        <text key={s} x={pad.l - 6} y={y(s) + 4} textAnchor="end" className="fill-stone-500 text-[11px]">
          {Math.round(s * 100)}%
        </text>
      ))}
      <path d={path} fill="none" strokeWidth={2.5} className="stroke-foreground" />
      {marks.map((m) => (
        <g key={m.t} className={m.cls}>
          <line x1={x(m.t)} x2={x(m.t)} y1={y(0)} y2={y(share(m.t))} stroke="currentColor" strokeDasharray="4 3" />
          <circle cx={x(m.t)} cy={y(share(m.t))} r={4.5} fill="currentColor" />
          <text x={x(m.t) + 7} y={y(share(m.t)) + 16} fill="currentColor" className="text-[11px] font-medium">
            {m.label} · {Math.round(share(m.t) * 100)}%
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-16">
      <p className="text-sm font-medium uppercase tracking-wide text-stone-500">LovHack × TRMI · Multiplayer Everything</p>
      <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
        Fact-checks arrive 18 hours late. Half the damage is done in 6.
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-stone-600 dark:text-stone-400">
        Community Notes only go live when raters who usually disagree both call a note helpful. X waits for them to wander by.
        Fast Notes knows which side a note is missing and pulls exactly those raters into a live room, so it settles in minutes.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/calibrate?next=/room/demo"
          className="rounded-full bg-foreground px-6 py-3 text-center font-medium text-background hover:opacity-90"
        >
          Try a real case (30 sec)
        </Link>
        <Link
          href="/calibrate?next=/room/demo%3Finvite%3D1"
          className="rounded-full border border-stone-300 px-6 py-3 text-center font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-900"
        >
          Open a room with friends
        </Link>
      </div>

      <section className="mt-12 grid gap-8 md:grid-cols-[3fr_2fr]">
        <figure className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-950">
          <figcaption className="mb-2 text-sm font-medium">Share of a post&apos;s reposts that have already happened</figcaption>
          <SpreadChart />
          <p className="mt-2 text-xs text-stone-500">
            Curve: exponential with the measured 5.75 h half-life (illustrative shape). Markers use real medians.
          </p>
        </figure>
        <ul className="space-y-4 text-sm text-stone-700 dark:text-stone-300">
          <li>
            <span className="block text-2xl font-semibold text-foreground">18.1 h</span>
            median from post to note display. Only 13.5% of helpful notes are shown before half the reposts happen.
          </li>
          <li>
            <span className="block text-2xl font-semibold text-foreground">15.3% → 53.1%</span>
            reposts prevented today, versus if notes were shown at hour 2.{" "}
            <a className="underline" href="https://arxiv.org/abs/2409.08781">Chuai et al.</a>
          </li>
          <li>
            <span className="block text-2xl font-semibold text-foreground">11.5%</span>
            of ~1.8M notes ever reach consensus.{" "}
            <a className="underline" href="https://arxiv.org/abs/2510.12559">Razuvayevskaya et al.</a>
          </li>
        </ul>
      </section>
    </div>
  );
}
