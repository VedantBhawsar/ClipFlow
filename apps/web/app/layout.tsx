import type { Metadata } from "next";
import {
  Inter_Tight,
  JetBrains_Mono,
  Instrument_Serif,
} from "next/font/google";
import { SessionProvider } from "next-auth/react";

import { QueryProvider } from "@/components/shared/query-provider";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { Toaster } from "@/components/shared/toaster";
import NextTopLoader from "nextjs-toploader";

import "./globals.css";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: ["400", "500"],
});

// Instrument Serif — sculpted italic-leaning display face, used for
// the marketing landing's hero/section titles. Loads only on pages
// that reference it via the `--font-instrument-serif` variable.
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
  weight: ["400"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "ClipFlow — schedule, thumbnail, and chapter your YouTube videos",
    template: "%s",
  },
  description:
    "Upload once, and ClipFlow schedules, generates thumbnails, and writes chapter timestamps — automatically.",
  applicationName: "ClipFlow",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${interTight.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="font-sans antialiased">
        <SessionProvider>
          <QueryProvider>
            <ThemeProvider>
              <NextTopLoader color="#E8B14A" />
              {children}
              <Toaster />
            </ThemeProvider>
          </QueryProvider>
        </SessionProvider>
      </body>
    </html>
  );
}