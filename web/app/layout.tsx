import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Logo } from "@/components/Logo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const serif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Fast Notes",
  description: "Crowd fact-checks that arrive while a post is still spreading.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-30 border-b border-line/70 bg-background/80 backdrop-blur-md">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 text-sm">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <Logo />
              Fast Notes
            </Link>
            <div className="flex items-center gap-1 text-muted">
              <Link href="/demo" className="rounded-full px-3 py-1.5 hover:text-foreground">
                Demo
              </Link>
              <Link href="/notes" className="hidden rounded-full px-3 py-1.5 hover:text-foreground sm:block">
                Notes
              </Link>
              <Link href="/results" className="hidden rounded-full px-3 py-1.5 hover:text-foreground sm:block">
                Results
              </Link>
              <Link
                href="/calibrate?next=/room/demo"
                className="pressable rounded-full bg-foreground px-3.5 py-1.5 font-medium text-background hover:opacity-90"
              >
                Try it
              </Link>
            </div>
          </nav>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
        <footer className="border-t border-line/70">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:justify-between">
            <span>Built in TRMI for LovHack × TRMI: Multiplayer Everything.</span>
            <span>
              Data: X Community Notes public data. Model after the open-source{" "}
              <a className="underline underline-offset-2" href="https://github.com/twitter/communitynotes">
                Community Notes scorer
              </a>
              .
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
