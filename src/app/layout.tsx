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
  // Stated explicitly because the icon lives in public/ rather than app/. The
  // file-based convention (app/favicon.ico) compiles into a route handler,
  // which counts against Vercel's 12-function-per-deployment limit on Hobby;
  // a static asset does not, and nothing else about the icon changes.
  //
  // The sizes are enumerated rather than left to the convention, which
  // advertised only "16x16": this .ico actually carries four images, so
  // under-declaring it could have a browser wanting a 32px icon discount it.
  icons: {
    icon: { url: "/favicon.ico", type: "image/x-icon", sizes: "16x16 32x32 48x48 256x256" },
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${newsreader.variable}`}>
      <body>{children}</body>
    </html>
  );
}
