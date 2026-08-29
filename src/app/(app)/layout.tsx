import Link from "next/link";
import type { ReactNode } from "react";

import { reuseOpportunities } from "@/lib/progress";
import { workspaceWorkload } from "@/lib/workload";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import { NavLink } from "../nav-link";
import { PendingButton } from "../pending-button";
import { signOutAction } from "../auth-actions";
import { loadDemoWorkspace, openPersonalWorkspace } from "../workspace-actions";

// None of these routes can be prerendered: every one reads the active
// workspace cookie and the database.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const overall = workspaceWorkload(snapshot);
  const reuse = reuseOpportunities(snapshot.essays, snapshot.matches, snapshot.prompts);
  const openReuse = reuse.reduce((total, group) => total + group.open.length, 0);

  // The wordmark leads to Overview, so the four product sections are the four
  // tabs. Same routes as before: renaming /schools would break every
  // ?school= link and any bookmark.
  const sections: [string, string, number][] = [
    ["Your Prompts", "/schools", overall.requiredTotal],
    ["Categories", "/families", snapshot.families.filter((family) => family.promptCount > 0).length],
    ["My Essays", "/essays", snapshot.essays.length],
    ["Reuse", "/reuse", openReuse],
  ];

  const isDemo = snapshot.workspace.kind === "demo";
  const initial = (snapshot.user.email.trim()[0] ?? "?").toUpperCase();

  return (
    <div className="app">
      <header className="topnav">
        <div className="topnav-inner">
          <Link className="wordmark" href="/" aria-label="College Essay Organizer — Overview">
            <span className="wordmark-mark" aria-hidden="true">
              E
            </span>
            <span className="wordmark-text">
              <strong>College Essay</strong> <span>Organizer</span>
            </span>
          </Link>

          <nav className="sections" aria-label="Primary navigation">
            {sections.map(([label, href, count]) => (
              <NavLink className="section-tab" href={href} key={href}>
                <span>{label}</span>
                <span className="tab-count">{count}</span>
              </NavLink>
            ))}
          </nav>

          <div className="topnav-utility">
            <NavLink className="utility-link" href="/plans">
              Plans
            </NavLink>

            {/* The native popover attribute brings Escape, light-dismiss and
                top-layer stacking with no JavaScript. */}
            <button
              className="avatar"
              type="button"
              popoverTarget="account-menu"
              aria-label={`Account and workspace — ${snapshot.user.email}`}
            >
              <span aria-hidden="true">{initial}</span>
            </button>

            <div className="account-menu" id="account-menu" popover="auto">
              <p className="account-email" title={snapshot.user.email}>
                {snapshot.user.email}
              </p>

              <div className="account-workspace">
                <strong>{snapshot.workspace.name}</strong>
                <span>{isDemo ? "Real prompts · sample essays" : "Your colleges · private to you"}</span>
              </div>

              <div className="account-actions">
                <form action={openPersonalWorkspace}>
                  <PendingButton pendingLabel="Opening…" ariaCurrent={isDemo ? undefined : "true"}>
                    My workspace
                  </PendingButton>
                </form>
                <form action={loadDemoWorkspace}>
                  <PendingButton pendingLabel={isDemo ? "Rebuilding…" : "Loading…"}>
                    {isDemo ? "Reset example" : "Example workspace"}
                  </PendingButton>
                </form>
              </div>

              <div className="account-actions">
                <Link className="account-link" href="/photo-credits">Image credits</Link>
              </div>

              <div className="account-signout">
                <form action={signOutAction}>
                  <button className="text-link" type="submit">
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="workspace">{children}</main>
    </div>
  );
}
