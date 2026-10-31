import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-stone-200 dark:border-stone-800">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 text-sm">
            <Link href="/" className="font-semibold tracking-tight">
              Fast Notes
            </Link>
            <div className="flex gap-4 text-stone-600 dark:text-stone-400">
              <Link href="/room/demo" className="hover:text-foreground">
                Demo room
              </Link>
              <Link href="/calibrate" className="hover:text-foreground">
                Calibrate
              </Link>
            </div>
          </nav>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
