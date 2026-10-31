import Link from "next/link";
import { CountUp } from "@/components/CountUp";
import { HeroIllustration } from "@/components/HeroIllustration";
import { LockIcon, RecruitIcon, SpotIcon } from "@/components/HowIcons";
import { Reveal } from "@/components/Reveal";
import { SpreadChart } from "@/components/SpreadChart";
import { Timelines } from "@/components/Timelines";

const STEPS = [
  {
    Icon: SpotIcon,
    title: "Spot the missing side",
    body: "A note only goes live when people who usually disagree both call it helpful. Fast Notes reads the ratings so far and sees which side hasn't weighed in.",
  },
  {
    Icon: RecruitIcon,
    title: "Recruit them, live",
    body: "Instead of waiting hours for those raters to wander by, the room invites exactly them. Anyone whose side is already covered is asked to sit this one out.",
  },
  {
    Icon: LockIcon,
    title: "Lock it when both agree",
    body: "The same bridging model X uses (simplified) refits after every rating. Once both sides agree and it holds, the verdict locks. People decide; no AI does.",
  },
];

export default function Home() {
  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="relative">
        <div className="dot-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_70%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 pb-12 pt-10 sm:pt-16 lg:grid-cols-[1.1fr_1fr]">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-late" />
              Community Notes, but in minutes
            </p>
            <h1 className="mt-5 text-[2.6rem] font-semibold leading-[1.05] sm:text-6xl">
              Fact-checks arrive <span className="font-serif font-normal italic text-late">18 hours</span> late.
              <br />
              Half the damage is done in <span className="font-serif font-normal italic">6</span>.
            </h1>
            <p className="mt-5 max-w-[52ch] text-lg text-muted">
              Fast Notes is a live room that brings the missing viewpoint to a Community Note and settles it while the post is
              still spreading.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/calibrate?next=/room/demo"
                className="pressable group inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-6 py-3.5 font-medium text-background hover:opacity-90"
              >
                Try a real case
                <span className="rounded-full bg-background/15 px-2 py-0.5 text-xs">30 sec</span>
              </Link>
              <Link
                href="/calibrate?next=/room/demo%3Finvite%3D1"
                className="pressable inline-flex items-center justify-center rounded-full border border-line bg-surface px-6 py-3.5 font-medium hover:border-foreground/30"
              >
                Open a room with friends
              </Link>
            </div>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="card relative p-2 sm:p-4">
              <HeroIllustration />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-wider text-late">The problem</p>
          <h2 className="mt-2 max-w-[24ch] text-3xl font-semibold sm:text-4xl">By the time a note appears, most people have already seen the post.</h2>
        </Reveal>
        <div className="mt-8 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <Reveal className="card p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="font-medium">How much of a post&apos;s spread has already happened</h3>
            </div>
            <SpreadChart />
            <p className="mt-3 text-xs text-muted">Exponential curve with the measured 5.75 h half-life. Markers use real medians.</p>
          </Reveal>
          <div className="grid gap-5">
            {[
              { n: 18.1, d: 1, s: " h", t: "median from post to note display on X." },
              { n: 15.3, d: 1, s: "%", t: "of reposts prevented today. Shown at hour 2 instead, notes would prevent 53.1%." },
              { n: 11.5, d: 1, s: "%", t: "of ~1.8M notes ever reach consensus. The rest wait forever." },
            ].map((x, i) => (
              <Reveal key={x.t} delay={i * 0.08} className="card p-5">
                <div className="text-4xl font-semibold tracking-tight">
                  <CountUp to={x.n} decimals={x.d} suffix={x.s} />
                </div>
                <p className="mt-1 text-sm text-muted">{x.t}</p>
              </Reveal>
            ))}
          </div>
        </div>
        <p className="mt-4 text-xs text-muted">
          Sources:{" "}
          <a className="underline underline-offset-2" href="https://arxiv.org/abs/2409.08781">
            Chuai et al. 2024
          </a>
          ,{" "}
          <a className="underline underline-offset-2" href="https://arxiv.org/abs/2510.12559">
            Razuvayevskaya et al. 2025
          </a>
          .
        </p>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-line/70 bg-surface/60">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-wider text-side-a">How a room works</p>
            <h2 className="mt-2 max-w-[26ch] text-3xl font-semibold sm:text-4xl">Don&apos;t wait for consensus. Go and get it.</h2>
          </Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map(({ Icon, title, body }, i) => (
              <Reveal key={title} delay={i * 0.08} className="card p-5">
                <div className="rounded-xl bg-surface-2 p-3">
                  <Icon />
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                    {i + 1}
                  </span>
                  <h3 className="font-semibold">{title}</h3>
                </div>
                <p className="mt-2 text-sm text-muted">{body}</p>
              </Reveal>
            ))}
          </div>

          <Reveal className="card mt-5 p-5 sm:p-6">
            <h3 className="mb-5 font-medium">When does the fact-check show up?</h3>
            <Timelines />
          </Reveal>
        </div>
      </section>

      {/* Real vs simulated */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-5 md:grid-cols-2">
          <Reveal className="card p-6">
            <h3 className="flex items-center gap-2 font-semibold">
              <span className="h-2 w-2 rounded-full bg-good" /> Real
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>Notes, ratings and raters from X&apos;s public Community Notes data</li>
              <li>Each note&apos;s real timeline: when it was written and when X decided</li>
              <li>The bridging model, refit in your browser after every rating</li>
            </ul>
          </Reveal>
          <Reveal delay={0.08} className="card p-6">
            <h3 className="flex items-center gap-2 font-semibold">
              <span className="h-2 w-2 rounded-full bg-side-b" /> Simulated
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>Live arrival times in the room (about one rating every 30 s)</li>
              <li>Bots that replay real raters&apos; actual ratings when you play solo</li>
              <li>No integration with X: rooms are standalone</li>
            </ul>
          </Reveal>
        </div>
        <Reveal className="mt-10 flex flex-col items-center gap-4 text-center">
          <h2 className="text-3xl font-semibold">See one settle in 30 seconds.</h2>
          <Link
            href="/calibrate?next=/room/demo"
            className="pressable rounded-full bg-foreground px-7 py-3.5 font-medium text-background hover:opacity-90"
          >
            Try a real case
          </Link>
        </Reveal>
      </section>
    </div>
  );
}
