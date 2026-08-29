import type { Metadata } from "next";
import { Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

// Self-hosted at build time, so there is no runtime request to Google and no
// layout shift. Plus Jakarta Sans carries the whole interface; Newsreader is
// reserved for the two surfaces where paragraphs are actually read - prompt
// text and essay prose.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-newsreader",
});

// Deliberately minimal: the sign-in page renders under this layout, so nothing
// here may touch the database. The sidebar and its workspace reads live in the
// (app) route group's layout instead, behind the auth gate.
export const metadata: Metadata = {
  title: {
    default: "College Essay Organizer",
    template: "%s · College Essay Organizer",
  },
  description: "A private workspace for organizing, matching, and revising college essays.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${newsreader.variable}`}>
      <body>{children}</body>
    </html>
  );
}
