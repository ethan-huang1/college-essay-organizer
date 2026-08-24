import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
