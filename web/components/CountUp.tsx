"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { EASE_OUT } from "@/lib/motion";

export function CountUp({ to, decimals = 0, suffix = "" }: { to: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;
    if (reduce) {
      el.textContent = to.toFixed(decimals) + suffix;
      return;
    }
    const controls = animate(0, to, {
      duration: 1.2,
      ease: EASE_OUT,
      onUpdate: (v) => (el.textContent = v.toFixed(decimals) + suffix),
    });
    return () => controls.stop();
  }, [inView, reduce, to, decimals, suffix]);

  return (
    <span ref={ref} className="tabular">
      {to.toFixed(decimals)}
      {suffix}
    </span>
  );
}
