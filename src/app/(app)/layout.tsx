import Link from "next/link";
import type { ReactNode } from "react";

import { summarizePrompts, reuseOpportunities } from "@/lib/progress";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import { NavLink } from "../nav-link";
import { signOutAction } from "../auth-actions";
import { loadDemoWorkspace, openPersonalWorkspace } from "../workspace-actions";

// None of these routes can be prerendered: every one reads the active
// workspace cookie and the database.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const overall = summarizePrompts(snapshot.prompts);
  const reuse = reuseOpportunities(snapshot.essays, snapshot.matches, snapshot.prompts);
  const openReuse = reuse.reduce((total, group) => total + group.open.length, 0);

  const navigation: [string, string, number | null][] = [
    ["Overview", "/", null],
    ["All prompts", "/schools", overall.total],
    ["Categories", "/families", snapshot.families.filter((family) => family.promptCount > 0).length],
    ["My essays", "/essays", snapshot.essays.length],
    ["Reuse", "/reuse", openReuse],
  ];

  const schools = [...snapshot.schools].sort((a, b) => a.name.localeCompare(b.name));
  const isDemo = snapshot.workspace.kind === "demo";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="College Essay Organizer home">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span>
            <span className="brand-name">College Essay</span>
            <span className="brand-subtitle">Organizer</span>
          </span>
        </Link>

        <nav className="primary-nav" aria-label="Primary navigation">
          {navigation.map(([label, href, count]) => (
            <NavLink className="nav-link" href={href} key={href}>
              <span>{label}</span>
              {count === null ? null : <span className="nav-count">{count}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="nav-schools">
          <p className="nav-label">
            Schools <span>{schools.length}</span>
          </p>
          {schools.length > 0 ? (
            <ul>
              {schools.map((school) => {
                const progress = summarizePrompts(snapshot.prompts.filter((prompt) => prompt.schoolId === school.id));
                return (
                  <li key={school.id}>
                    <NavLink className="nav-school" href={`/schools?school=${school.id}`} schoolId={school.id}>
                      <span title={school.name}>{school.name}</span>
                      <span className="nav-progress">
                        {progress.total > 0 ? `${progress.complete}/${progress.total}` : "—"}
                      </span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="nav-empty">No colleges yet.</p>
          )}
          <Link className="nav-add" href="/schools#add-college">
            <span aria-hidden="true">+</span> Add college
          </Link>
        </div>

        <div className="workspace-switch">
          <p className="nav-label">Workspace</p>
          <strong>{snapshot.workspace.name}</strong>
          <span>{isDemo ? "Real prompts · sample essays" : "Your colleges · private to you"}</span>
          <div className="workspace-switch-actions">
            <form action={openPersonalWorkspace}>
              <button type="submit" aria-current={isDemo ? undefined : "true"}>My workspace</button>
            </form>
            <form action={loadDemoWorkspace}>
              <button type="submit">{isDemo ? "Reset example" : "Example workspace"}</button>
            </form>
          </div>
          <form action={signOutAction} className="sign-out-form">
            <button className="text-link" type="submit">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="workspace">{children}</main>
    </div>
  );
}
