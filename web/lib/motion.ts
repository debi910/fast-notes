// Motion tokens (after Emil Kowalski's design-engineering guidelines).
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
export const SPRING = { type: "spring", duration: 0.5, bounce: 0.2 } as const;

export const fadeUp = {
  hidden: { opacity: 0, transform: "translateY(12px)" },
  show: { opacity: 1, transform: "translateY(0px)", transition: { duration: 0.5, ease: EASE_OUT } },
};

export const stagger = (each = 0.06) => ({
  hidden: {},
  show: { transition: { staggerChildren: each } },
});
