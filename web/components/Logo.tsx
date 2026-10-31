/** Two viewpoints meeting on one verdict. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path d="M12 2a10 10 0 0 0 0 20z" className="fill-side-a" />
      <path d="M12 2a10 10 0 0 1 0 20z" className="fill-side-b" />
      <path d="M7.5 12.3l3 3 6-6.3" fill="none" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
