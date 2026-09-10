import Link from "next/link";
import type { ReactNode } from "react";

import { reuseOpportunities } from "@/lib/progress";
import { workspaceWorkload } from "@/lib/workload";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import { NavLink } from "../nav-link";
import { PendingButton } from "../pending-button";
import { deleteAccountAction, signOutAction } from "../auth-actions";
import { loadDemoWorkspace, openPersonalWorkspace } from "../workspace-actions";

// None of these routes can be prerendered: every one reads the active
// workspace cookie and the database.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const overall = workspaceWorkload(snapshot);
  const reuse = reuseOpportunities(snapshot.essays, snapshot.matches, snapshot.prompts);
  const openReuse = reuse.reduce((total, group) => total + group.open.length, 0);

  // Overview is a tab in its own right rather than something you reach only by
  // clicking the wordmark. Same routes as before: renaming /schools would break
  // every ?school= link and any bookmark.
  //
  // A null count means the tab carries no badge - Overview is the whole picture,
  // so there is no single number that belongs to it.
  const sections: [string, string, number | null][] = [
    ["Overview", "/", null],
    ["Your Prompts", "/schools", overall.requiredTotal],
    ["Categories", "/families", snapshot.families.filter((family) => family.promptCount > 0).length],
    ["My Essays", "/essays", snapshot.essays.length],
    ["Essay Editor", "/editor", null],
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
            <span className="wordmark-text">College Essay Organizer</span>
          </Link>

          <nav className="sections" aria-label="Primary navigation">
            {sections.map(([label, href, count]) => (
              <NavLink className="section-tab" href={href} key={href}>
                {/* data-label lets CSS reserve the bold width at all times, so
                    marking a tab active cannot shift the tabs after it. */}
                <span className="tab-label" data-label={label}>{label}</span>
                {count === null ? null : <span className="tab-count">{count}</span>}
              </NavLink>
            ))}
          </nav>

          <div className="topnav-utility">
            {/* The route exists only in development (see pageExtensions in
                next.config.ts), so the link must not be offered in production
                where it would 404. */}
            {process.env.NODE_ENV === "development" ? (
              <NavLink className="utility-link" href="/plans">
                Plans
              </NavLink>
            ) : null}

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
                <span>
                  {isDemo
                    ? "Real prompts · sample essays · read-only"
                    : "Your colleges · private to you"}
                </span>
              </div>

              <div className="account-actions">
                <form action={openPersonalWorkspace}>
                  <PendingButton pendingLabel="Opening…" ariaCurrent={isDemo ? undefined : "true"}>
                    My workspace
                  </PendingButton>
                </form>
                <form action={loadDemoWorkspace}>
                  <PendingButton pendingLabel="Loading…" ariaCurrent={isDemo ? "true" : undefined}>
                    Example workspace
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

                {/* Two steps, like deleting a document: opening the disclosure
                    states what goes, and only then is the button there to
                    press. Native <details> so it needs no JavaScript. */}
                <details className="account-danger">
                  <summary>Delete account</summary>
                  <p className="detail-note">
                    This permanently deletes your account, every essay and version you have written, your colleges and
                    your progress. It cannot be undone, and it does not affect the example workspace.
                  </p>
                  <form action={deleteAccountAction}>
                    <button className="text-link danger" type="submit">
                      Yes, delete my account and all my essays
                    </button>
                  </form>
                </details>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="workspace">{children}</main>
    </div>
  );
}
