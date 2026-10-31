"use client";

import { AnimatePresence, motion } from "motion/react";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { EASE_OUT } from "@/lib/motion";

// Invite = a QR code a second person scans from across the table. The link goes
// through the 15-second calibration first, so the room knows their side and can
// route them straight to the missing one.
export function InviteQR({ noteId }: { noteId: string }) {
  const [open, setOpen] = useState(false);
  const [{ url, qr }, setLink] = useState<{ url: string; qr: string | null }>({ url: "", qr: null });
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u = `${window.location.origin}/calibrate?next=${encodeURIComponent(`/room/${noteId}`)}`;
    QRCode.toDataURL(u, { margin: 1, width: 360, color: { dark: "#141414", light: "#ffffff" } })
      .then((q) => setLink({ url: u, qr: q }))
      .catch(() => setLink({ url: u, qr: null }));
  }, [noteId]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function copy() {
    void navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  }

  const isLocal = url.includes("localhost") || url.includes("127.0.0.1");

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="pressable inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium hover:border-foreground/30"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-[1.7]" strokeLinecap="round" aria-hidden>
          <rect x="3" y="3" width="5" height="5" rx="1" />
          <rect x="12" y="3" width="5" height="5" rx="1" />
          <rect x="3" y="12" width="5" height="5" rx="1" />
          <path d="M12 12h2v2M17 12v5h-5M14.5 16.5v.01" />
        </svg>
        Invite
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Invite someone to this room"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            style={{ transformOrigin: "top right" }}
            className="card absolute right-0 top-full z-30 mt-2 w-[18rem] p-4 shadow-xl"
          >
            <p className="font-semibold">Bring in the missing side</p>
            <p className="mt-1 text-sm text-muted">
              Scan with a phone. They calibrate in 15 seconds, then join this room on their side.
            </p>
            <div className="mt-3 overflow-hidden rounded-xl border border-line bg-white p-2">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR code that opens this room on a phone" className="mx-auto aspect-square w-full" />
              ) : (
                <div className="aspect-square w-full animate-pulse bg-surface-2" />
              )}
            </div>
            {isLocal && (
              <p className="mt-2 text-xs text-late">This is a localhost link. Open the deployed site so a phone can reach it.</p>
            )}
            <button
              onClick={copy}
              className="pressable mt-3 w-full rounded-full bg-foreground px-3 py-2 text-sm font-medium text-background"
            >
              {copied ? "Link copied" : "Copy link"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
