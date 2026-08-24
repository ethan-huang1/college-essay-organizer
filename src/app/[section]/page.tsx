import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import type { WorkspaceSnapshot } from "@/lib/workspaces";
import { createPromptAction, deletePromptAction, updatePromptAction } from "../prompt-actions";
import { createSchoolAction, deleteSchoolAction, updateSchoolAction } from "../school-actions";

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

type WorkspacePrompt = WorkspaceSnapshot["prompts"][number];

function PromptFields({ snapshot, prompt }: { snapshot: WorkspaceSnapshot; prompt?: WorkspacePrompt }) {
  const secondaryIds = new Set(prompt?.secondaryFamilies.map((family) => family.id));
  const deadline = prompt?.deadline ? prompt.deadline.toISOString().slice(0, 10) : "";
  return (
    <div className="prompt-fields">
      <label>School<select name="schoolId" required defaultValue={prompt?.schoolId ?? snapshot.schools[0]?.id}>
        {snapshot.schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
      </select></label>
      <label>Title<input name="title" required minLength={2} maxLength={160} defaultValue={prompt?.title} placeholder="Community contribution" /></label>
      <label className="field-wide">Full prompt<textarea name="promptText" required minLength={10} maxLength={5000} defaultValue={prompt?.promptText} placeholder="Paste the complete prompt text" /></label>
      <label>Minimum words<input name="minWordCount" type="number" min={0} step={1} defaultValue={prompt?.minWordCount ?? ""} /></label>
      <label>Maximum words<input name="maxWordCount" type="number" min={0} step={1} defaultValue={prompt?.maxWordCount ?? ""} /></label>
      <label>Requirement<select name="requirement" defaultValue={prompt?.requirement ?? "required"}><option value="required">Required</option><option value="optional">Optional</option></select></label>
      <label>Status<select name="status" defaultValue={prompt?.status ?? "not-started"}><option value="not-started">Not started</option><option value="in-progress">In progress</option><option value="complete">Complete</option><option value="submitted">Submitted</option></select></label>
      <label>Deadline<input name="deadline" type="date" defaultValue={deadline} /></label>
      <label>Primary family<select name="primaryFamilyId" defaultValue={prompt?.primaryFamily?.id ?? ""}><option value="">No primary family</option>{snapshot.families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}</select></label>
      <fieldset className="family-picker field-wide">
        <legend>Secondary families <span>choose any that also apply</span></legend>
        <div>{snapshot.families.map((family) => (
          <label key={family.id}><input type="checkbox" name="secondaryFamilyIds" value={family.id} defaultChecked={secondaryIds.has(family.id)} /><span>{family.name}</span></label>
        ))}</div>
      </fieldset>
      <label className="field-wide">Notes<input name="notes" maxLength={2000} defaultValue={prompt?.notes ?? ""} placeholder="Requirements, ideas, or context" /></label>
    </div>
  );
}

function SchoolsView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  return (
    <>
      <form action={createSchoolAction} className="crud-form">
        <div><label htmlFor="school-name">School name</label><input id="school-name" name="name" required minLength={2} maxLength={120} placeholder="Add a college or university" /></div>
        <div><label htmlFor="school-notes">Notes <span>optional</span></label><input id="school-notes" name="notes" maxLength={500} placeholder="Deadline, portal, or context" /></div>
        <button type="submit">Add school</button>
      </form>

      {snapshot.schools.length > 0 ? (
        <details className="prompt-create-panel">
          <summary>Add a prompt</summary>
          <form action={createPromptAction} className="prompt-form">
            <PromptFields snapshot={snapshot} />
            <p className="classification-help">Families selected here are saved as a transparent manual classification.</p>
            <button type="submit">Add prompt</button>
          </form>
        </details>
      ) : null}

      {snapshot.schools.length === 0 ? <EmptyState section="schools" /> : (
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
                  <details className="record-actions">
                    <summary>Edit or remove</summary>
                    <form action={updateSchoolAction} className="inline-edit-form">
                      <input name="schoolId" type="hidden" value={school.id} />
                      <label>School name<input name="name" required minLength={2} maxLength={120} defaultValue={school.name} /></label>
                      <label>Notes<input name="notes" maxLength={500} defaultValue={school.notes ?? ""} /></label>
                      <button type="submit">Save changes</button>
                    </form>
                    <form action={deleteSchoolAction} className="delete-form">
                      <input name="schoolId" type="hidden" value={school.id} />
                      <span>Deleting also removes this school&apos;s prompts.</span>
                      <button type="submit">Delete school</button>
                    </form>
                  </details>
                </div>
                <div className="prompt-list">
                  {schoolPrompts.map((prompt) => (
                    <article className="prompt-record" key={prompt.id}>
                      <div className="prompt-record-heading">
                        <div><span className="record-meta">{prompt.requirement} · {prompt.status.replace("-", " ")}</span><h3>{prompt.title}</h3></div>
                        <span>{prompt.maxWordCount ?? "—"} words</span>
                      </div>
                      <p>{prompt.promptText}</p>
                      <div className="family-chips">
                        {prompt.primaryFamily ? <span className="primary-chip">Primary · {prompt.primaryFamily.name}</span> : <span>Unclassified</span>}
                        {prompt.secondaryFamilies.map((family) => <span key={family.id}>{family.name}</span>)}
                      </div>
                      <span className="classification-source">{prompt.classificationSource === "manual" ? "Manual override" : `Deterministic suggestion · ${prompt.classificationConfidence}% confidence`}</span>
                      <details className="prompt-actions">
                        <summary>Edit classification or prompt</summary>
                        <form action={updatePromptAction} className="prompt-form">
                          <input name="promptId" type="hidden" value={prompt.id} />
                          <PromptFields snapshot={snapshot} prompt={prompt} />
                          <p className="classification-help">Saving replaces the family assignment and marks it as a manual override.</p>
                          <button type="submit">Save prompt</button>
                        </form>
                        <form action={deletePromptAction} className="delete-form">
                          <input name="promptId" type="hidden" value={prompt.id} />
                          <span>Deleting also removes this prompt&apos;s family links, matches, and response assignment.</span>
                          <button type="submit">Delete prompt</button>
                        </form>
                      </details>
                    </article>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
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
