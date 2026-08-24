import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import type { WorkspaceSnapshot } from "@/lib/workspaces";

const sections = {
  schools: { title: "Schools & prompts", eyebrow: "Build the application list", description: "See every school and the prompts waiting for a response." },
  essays: { title: "Essay library", eyebrow: "Keep every draft findable", description: "Review essay status, word count, versions, and linked prompts." },
  families: { title: "Prompt families", eyebrow: "See the shape of the work", description: "Explore the editable taxonomy and its prompt and essay coverage." },
  reuse: { title: "Reuse map", eyebrow: "Connect essays to opportunities", description: "Compare transparent match scores, gaps, and institution-specific risk." },
} as const;

type SectionName = keyof typeof sections;

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return Object.keys(sections).map((section) => ({ section }));
}

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  return section in sections ? { title: sections[section as SectionName].title } : {};
}

function EmptyState({ section }: { section: SectionName }) {
  const copy = {
    schools: ["No schools yet", "Add school and prompt forms arrive in Phase 2. For now, load the fictional demo to explore the complete foundation."],
    essays: ["No essays yet", "Your personal essay library is empty. The fictional demo contains six clearly labeled examples."],
    families: ["Taxonomy ready", "The ten editable families are seeded, but no personal prompts or essays use them yet."],
    reuse: ["Nothing to match yet", "Reuse candidates appear after a workspace has both essays and prompts. Load the fictional demo to inspect three examples."],
  } as const;
  const [title, description] = copy[section];

  return (
    <div className="empty-state">
      <span className="empty-mark" aria-hidden="true">—</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <Link className="text-link" href="/">Choose a workspace <span aria-hidden="true">→</span></Link>
    </div>
  );
}

function SchoolsView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  if (snapshot.schools.length === 0) return <EmptyState section="schools" />;
  return (
    <div className="record-list">
      {snapshot.schools.map((school) => {
        const schoolPrompts = snapshot.prompts.filter((prompt) => prompt.schoolId === school.id);
        return (
          <article className="record-row" key={school.id}>
            <div>
              <span className="record-meta">
                {snapshot.workspace.kind === "demo" ? "Fictional" : "Personal"} school · {school.promptCount} prompts
              </span>
              <h2>{school.name}</h2>
              <p>{school.notes}</p>
            </div>
            <ul className="compact-list">
              {schoolPrompts.map((prompt) => (
                <li key={prompt.id}><span>{prompt.title}</span><span>{prompt.maxWordCount ?? "—"} words</span></li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
}

function EssaysView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  if (snapshot.essays.length === 0) return <EmptyState section="essays" />;
  return (
    <div className="record-grid">
      {snapshot.essays.map((essay) => (
        <article className="essay-record" key={essay.id}>
          <div className="record-meta-row">
            <span className="record-meta">{essay.designation.replace("-", " ")}</span>
            <span className={`status-pill ${essay.status}`}>{essay.status}</span>
          </div>
          <h2>{essay.title}</h2>
          <p className="essay-excerpt">{essay.currentContent}</p>
          <dl className="record-stats">
            <div><dt>Words</dt><dd>{essay.wordCount}</dd></div>
            <div><dt>Versions</dt><dd>{essay.versionCount}</dd></div>
            <div><dt>Prompts</dt><dd>{essay.linkedPromptCount}</dd></div>
          </dl>
          {essay.schoolSpecificPhrases.length > 0 ? <p className="risk-note">School-specific: {essay.schoolSpecificPhrases.join(", ")}</p> : null}
        </article>
      ))}
    </div>
  );
}

function FamiliesView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  return (
    <div className="taxonomy-table">
      {snapshot.families.map((family) => (
        <article className="taxonomy-row" key={family.id}>
          <span className="family-swatch" style={{ backgroundColor: family.color }} aria-hidden="true" />
          <span className="family-index">{String(family.sortOrder).padStart(2, "0")}</span>
          <div><h2>{family.name}</h2><p>{family.description}</p></div>
          <div className="coverage-counts">
            <span><strong>{family.promptCount}</strong> prompts</span>
            <span><strong>{family.essayCount}</strong> essays</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function ReuseView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  if (snapshot.matches.length === 0) return <EmptyState section="reuse" />;
  return (
    <div className="match-list">
      {snapshot.matches.map((match) => (
        <article className={`match-row risk-${match.schoolSpecificityRisk}`} key={match.id}>
          <div className="score-block"><strong>{match.score}</strong><span>match</span></div>
          <div>
            <span className="record-meta">{match.schoolName} · {match.recommendedAction.replaceAll("-", " ")}</span>
            <h2>{match.essayTitle} <span aria-hidden="true">→</span> {match.promptTitle}</h2>
            <p>{match.explanation}</p>
            {match.missingRequirements.length > 0 ? <p className="missing-note">Missing: {match.missingRequirements.join(", ")}</p> : null}
          </div>
          <span className="risk-label">{match.schoolSpecificityRisk} school risk</span>
        </article>
      ))}
    </div>
  );
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!(section in sections)) notFound();

  const sectionName = section as SectionName;
  const content = sections[sectionName];
  const snapshot = await getActiveWorkspaceSnapshot();
  const views = {
    schools: <SchoolsView snapshot={snapshot} />,
    essays: <EssaysView snapshot={snapshot} />,
    families: <FamiliesView snapshot={snapshot} />,
    reuse: <ReuseView snapshot={snapshot} />,
  };

  return (
    <div className="page-frame data-page">
      <header className="data-heading">
        <div><p className="eyebrow">{content.eyebrow}</p><h1>{content.title}</h1><p className="lede">{content.description}</p></div>
        <aside className={`workspace-badge ${snapshot.workspace.kind}`}>
          <span className="note-kicker">Active workspace</span>
          <strong>{snapshot.workspace.name}</strong>
          <span>{snapshot.workspace.kind === "demo" ? "Synthetic data only" : "Private personal data"}</span>
          <Link href="/">Switch workspace</Link>
        </aside>
      </header>

      <dl className="summary-strip">
        <div><dt>Schools</dt><dd>{snapshot.stats.schools}</dd></div>
        <div><dt>Prompts</dt><dd>{snapshot.stats.prompts}</dd></div>
        <div><dt>Essays</dt><dd>{snapshot.stats.essays}</dd></div>
        <div><dt>Strong matches</dt><dd>{snapshot.stats.strongMatches}</dd></div>
      </dl>
      {views[sectionName]}
    </div>
  );
}
