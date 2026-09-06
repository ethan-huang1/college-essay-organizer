import type { Metadata } from "next";
import Link from "next/link";

import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import { documentName, essayPromptContext } from "../../essay-ui";
import { LocalTime } from "../../local-time";
import { SchoolMark } from "../../school-mark";
import { statusLabel } from "../../text";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const metadata: Metadata = { title: "Essay Editor" };

/**
 * The editor's front door: every document, grouped by the school it's
 * written for (most recently written first within each), plus a Reusable
 * library group for documents attached to no school yet.
 *
 * My Essays answers "where is each college up to"; this answers "what was I
 * writing". Rows rather than cards - this is a list to scan, not a set of
 * things to act on - and the only action on each is to open it.
 *
 * Grouping uses the same single-school precedent essayPromptContext already
 * resolves for this page's own "school · prompt" line - a reused essay is
 * its own independent document with its own origin, so it lands under its
 * own school with no special-casing for reuse.
 */
export default async function EditorIndexPage() {
  const snapshot = await getActiveWorkspaceSnapshot();
  const documents = [...snapshot.essays].sort(
    (a, b) => b.lastEditedAt.getTime() - a.lastEditedAt.getTime(),
  );

  const bySchool = new Map<string, typeof documents>();
  const unassigned: typeof documents = [];
  for (const essay of documents) {
    const schoolName = essayPromptContext(snapshot, essay)?.schoolName;
    if (!schoolName) {
      unassigned.push(essay);
      continue;
    }
    const bucket = bySchool.get(schoolName);
    if (bucket) bucket.push(essay);
    else bySchool.set(schoolName, [essay]);
  }
  const groups: { schoolName: string | null; documents: typeof documents }[] = [...bySchool.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([schoolName, docs]) => ({ schoolName, documents: docs }));
  if (unassigned.length > 0) groups.push({ schoolName: null, documents: unassigned });

  return (
    <div className="page-frame">
      <header className="section-heading">
        <div>
          <h1>Essay Editor</h1>
          <p className="lede">Your documents, grouped by school and most recently written first within each. Open one to write in full.</p>
        </div>
        <p className="progress-line section-progress">
          <strong>{documents.length}</strong> {documents.length === 1 ? "document" : "documents"}
        </p>
      </header>

      {documents.length === 0 ? (
        <div className="empty-state card">
          <p>
            No documents yet. Open <Link className="text-link" href="/essays">My Essays</Link> and press
            “Start Writing” on a prompt — the school, prompt and word limit come with it.
          </p>
        </div>
      ) : (
        <div className="document-groups">
          {groups.map((group) => (
            <section className="document-group" key={group.schoolName ?? "unassigned"}>
              <h2 className="document-group-heading">
                {group.schoolName ? <SchoolMark name={group.schoolName} small /> : null}
                {group.schoolName ?? "Reusable library"}
              </h2>
              <ul className="rows card document-list">
                {group.documents.map((essay) => {
                  const origin = essayPromptContext(snapshot, essay);
                  return (
                    <li key={essay.id}>
                      <Link className="row document-row" href={`/editor/${essay.id}`}>
                        <span className="row-main">
                          <span className="row-title">{documentName(essay)}</span>
                          <span className="row-sub">{origin?.title ?? "No prompt attached"}</span>
                        </span>
                        <span className="cell-limit">
                          {essay.wordCount}{essay.targetWordCount ? ` / ${essay.targetWordCount}` : ""} words
                        </span>
                        <span className={`pill ${essay.status}`}>{statusLabel(essay.status)}</span>
                        {/* When it was last written in, which is what this column
                            is actually useful for - a version number was
                            arithmetic. */}
                        <span className="row-side">
                          <LocalTime iso={essay.lastEditedAt.toISOString()} withDate />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
