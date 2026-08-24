import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "College Essay Organizer",
    template: "%s · College Essay Organizer",
  },
  description: "A private workspace for organizing, matching, and revising college essays.",
};

const navigation = [
  ["Dashboard", "/"],
  ["Schools & prompts", "/schools"],
  ["Essay library", "/essays"],
  ["Prompt families", "/families"],
  ["Reuse map", "/reuse"],
] as const;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <aside className="sidebar">
            <Link className="brand" href="/" aria-label="College Essay Organizer home">
              <span className="brand-mark" aria-hidden="true">E</span>
              <span>
                <span className="brand-name">College Essay</span>
                <span className="brand-subtitle">Organizer</span>
              </span>
            </Link>

            <p className="nav-label">Workspace</p>
            <nav className="primary-nav" aria-label="Primary navigation">
              {navigation.map(([label, href], index) => (
                <Link className="nav-link" href={href} key={href}>
                  <span>{label}</span>
                  <span className="nav-glyph" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                </Link>
              ))}
            </nav>

            <p className="sidebar-note">
              Local-first and private. Your writing stays in this workspace.
            </p>
          </aside>
          <main className="workspace">{children}</main>
        </div>
      </body>
    </html>
  );
}
