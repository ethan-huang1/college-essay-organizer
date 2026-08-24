import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TOP_UNIVERSITIES } from "@/lib/top-universities";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import type { WorkspaceSnapshot } from "@/lib/workspaces";
import { addCollegeAction } from "../college-actions";
import {
  createEssayAction,
  deleteEssayAction,
  restoreEssayVersionAction,
  saveEssayVersionAction,
  updateEssayMetadataAction,
} from "../essay-actions";
import { createPromptAction, deletePromptAction, updatePromptAction } from "../prompt-actions";
import { deleteSchoolAction, updateSchoolAction } from "../school-actions";

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

function AddCollegeForm() {
  return (
    <form action={addCollegeAction} className="crud-form">
      <div>
        <label htmlFor="college-name">Add a college</label>
        <input
          id="college-name"
          name="collegeName"
          required
          minLength={2}
          maxLength={120}
          list="top-universities"
          placeholder="Search the top 100, or type any school"
        />
        <datalist id="top-universities">
          {TOP_UNIVERSITIES.map((name) => <option key={name} value={name} />)}
        </datalist>
      </div>
      <button type="submit">Add college</button>
      <p className="classification-help field-wide">
        Choosing a school we have verified 2026–27 prompts for imports and classifies them automatically. Any other
        name (from the list or typed manually) still adds the school — you can add its prompts yourself below.
      </p>
    </form>
  );
}

function VerificationBadge({ status, sourceUrl }: { status: WorkspaceSnapshot["prompts"][number]["verificationStatus"]; sourceUrl: string | null }) {
  const label = {
    "verified-2026-27": "Verified 2026–27",
    "likely-current-unverified": "Likely current · unverified",
    "previous-cycle": "Previous cycle",
    manual: "Manually entered",
  }[status];
  const tone = status === "verified-2026-27" ? "verified" : status === "manual" ? "manual" : "unverified";
  return sourceUrl ? (
    <a className={`verification-badge ${tone}`} href={sourceUrl} target="_blank" rel="noreferrer">{label}</a>
  ) : (
    <span className={`verification-badge ${tone}`}>{label}</span>
  );
}

function SchoolsView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  return (
    <>
      <AddCollegeForm />

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
                      <div className="verification-row"><VerificationBadge status={prompt.verificationStatus} sourceUrl={prompt.sourceUrl} /></div>
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

type WorkspaceEssay = WorkspaceSnapshot["essays"][number];

const ESSAY_STATUSES = ["idea", "outline", "draft", "revising", "ready", "submitted"] as const;

function EssayFields({ snapshot, essay }: { snapshot: WorkspaceSnapshot; essay?: WorkspaceEssay }) {
  const secondaryIds = new Set(essay?.secondaryFamilies.map((family) => family.id));
  return (
    <div className="prompt-fields">
      <label>Title<input name="title" required minLength={2} maxLength={160} defaultValue={essay?.title} placeholder="Why Computer Science" /></label>
      <label>Target words<input name="targetWordCount" type="number" min={0} step={1} defaultValue={essay?.targetWordCount ?? ""} /></label>
      <label>Status<select name="status" defaultValue={essay?.status ?? "idea"}>
        {ESSAY_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
      </select></label>
      <label>Designation<select name="designation" defaultValue={essay?.designation ?? "canonical"}>
        <option value="canonical">Canonical (reusable original)</option>
        <option value="school-adaptation">School-specific adaptation</option>
      </select></label>
      <label>Primary family<select name="primaryFamilyId" defaultValue={essay?.primaryFamily?.id ?? ""}><option value="">No primary family</option>{snapshot.families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}</select></label>
      <fieldset className="family-picker field-wide">
        <legend>Secondary families <span>choose any that also apply</span></legend>
        <div>{snapshot.families.map((family) => (
          <label key={family.id}><input type="checkbox" name="secondaryFamilyIds" value={family.id} defaultChecked={secondaryIds.has(family.id)} /><span>{family.name}</span></label>
        ))}</div>
      </fieldset>
      <label className="field-wide">School-specific phrases <span>comma-separated, e.g. school names to flag</span>
        <input name="schoolSpecificPhrases" defaultValue={essay?.schoolSpecificPhrases.join(", ") ?? ""} placeholder="Stanford, the Farm" />
      </label>
      <label className="field-wide">Notes<input name="notes" maxLength={2000} defaultValue={essay?.notes ?? ""} placeholder="Context, ideas, or reminders" /></label>
    </div>
  );
}

function EssayFilterForm({ snapshot, status, familyId, query }: { snapshot: WorkspaceSnapshot; status: string; familyId: string; query: string }) {
  return (
    <form className="crud-form essay-filter-form" action="/essays">
      <div><label htmlFor="essay-q">Search</label><input id="essay-q" name="q" defaultValue={query} placeholder="Title or content" /></div>
      <div><label htmlFor="essay-status">Status</label>
        <select id="essay-status" name="status" defaultValue={status}>
          <option value="">Any status</option>
          {ESSAY_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      <div><label htmlFor="essay-family">Family</label>
        <select id="essay-family" name="family" defaultValue={familyId}>
          <option value="">Any family</option>
          {snapshot.families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}
        </select>
      </div>
      <button type="submit">Filter</button>
      {(status || familyId || query) ? <Link className="text-link" href="/essays">Clear</Link> : null}
    </form>
  );
}

function EssayVersionHistory({ essay }: { essay: WorkspaceEssay }) {
  return (
    <div className="version-list">
      {essay.versions.map((version, index) => {
        const previous = essay.versions[index + 1];
        const delta = previous ? version.wordCount - previous.wordCount : version.wordCount;
        return (
          <details className="version-row" key={version.id}>
            <summary>
              <span>Version {version.versionNumber}</span>
              <span>{version.wordCount} words {previous ? `(${delta >= 0 ? "+" : ""}${delta})` : ""}</span>
              <span>{version.reason ?? "No reason given"}</span>
            </summary>
            <p className="version-content">{version.content || "(empty)"}</p>
            {index !== 0 ? (
              <form action={restoreEssayVersionAction} className="inline-edit-form">
                <input name="essayId" type="hidden" value={essay.id} />
                <input name="versionId" type="hidden" value={version.id} />
                <button type="submit">Restore this version (adds a new version, keeps history)</button>
              </form>
            ) : <span className="record-meta">Current version</span>}
          </details>
        );
      })}
    </div>
  );
}

function EssaysView({ snapshot, status, familyId, query }: { snapshot: WorkspaceSnapshot; status: string; familyId: string; query: string }) {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredEssays = snapshot.essays.filter((essay) => {
    if (status && essay.status !== status) return false;
    if (familyId && essay.primaryFamily?.id !== familyId && !essay.secondaryFamilies.some((family) => family.id === familyId)) return false;
    if (normalizedQuery && !essay.title.toLowerCase().includes(normalizedQuery) && !essay.currentContent.toLowerCase().includes(normalizedQuery)) return false;
    return true;
  });

  return (
    <>
      <details className="prompt-create-panel">
        <summary>Add an essay</summary>
        <form action={createEssayAction} className="prompt-form">
          <EssayFields snapshot={snapshot} />
          <label className="field-wide">Starting content<textarea name="content" maxLength={20000} placeholder="Draft the first version here, or leave blank and write later" /></label>
          <button type="submit">Add essay</button>
        </form>
      </details>

      <EssayFilterForm snapshot={snapshot} status={status} familyId={familyId} query={query} />

      {snapshot.essays.length === 0 ? <EmptyState section="essays" /> : filteredEssays.length === 0 ? (
        <p className="empty-note">No essays match this filter.</p>
      ) : (
        <div className="record-grid">
          {filteredEssays.map((essay) => (
            <article className="essay-record" key={essay.id}>
              <div className="record-meta-row">
                <span className="record-meta">{essay.designation.replace("-", " ")}</span>
                <span className={`status-pill ${essay.status}`}>{essay.status}</span>
              </div>
              <h2>{essay.title}</h2>
              <p className="essay-excerpt">{essay.currentContent || "No content yet."}</p>
              <div className="family-chips">
                {essay.primaryFamily ? <span className="primary-chip">Primary · {essay.primaryFamily.name}</span> : <span>Unclassified</span>}
                {essay.secondaryFamilies.map((family) => <span key={family.id}>{family.name}</span>)}
              </div>
              {essay.linkedPrompts.length > 0 ? (
                <p className="linked-prompts-note">Used for: {essay.linkedPrompts.map((link) => `${link.schoolName} · ${link.title}`).join("; ")}</p>
              ) : null}
              {essay.schoolSpecificPhrases.length > 0 ? <p className="risk-note">School-specific: {essay.schoolSpecificPhrases.join(", ")}</p> : null}
              <dl className="record-stats">
                <div><dt>Words</dt><dd>{essay.wordCount}{essay.targetWordCount ? ` / ${essay.targetWordCount}` : ""}</dd></div>
                <div><dt>Versions</dt><dd>{essay.versionCount}</dd></div>
                <div><dt>Prompts</dt><dd>{essay.linkedPromptCount}</dd></div>
              </dl>
              <details className="record-actions">
                <summary>Edit, write, or remove</summary>
                <form action={updateEssayMetadataAction} className="prompt-form">
                  <input name="essayId" type="hidden" value={essay.id} />
                  <EssayFields snapshot={snapshot} essay={essay} />
                  <button type="submit">Save essay details</button>
                </form>
                <form action={saveEssayVersionAction} className="prompt-form">
                  <input name="essayId" type="hidden" value={essay.id} />
                  <label className="field-wide">New content <span>saving creates a new version; the essay is never edited in place</span>
                    <textarea name="content" maxLength={20000} defaultValue={essay.currentContent} />
                  </label>
                  <label className="field-wide">Reason for this version<input name="reason" maxLength={200} placeholder="Tightened the opening paragraph" /></label>
                  <button type="submit">Save as new version</button>
                </form>
                <EssayVersionHistory essay={essay} />
                <form action={deleteEssayAction} className="delete-form">
                  <input name="essayId" type="hidden" value={essay.id} />
                  <span>Deleting removes every version and match for this essay.</span>
                  <button type="submit">Delete essay</button>
                </form>
              </details>
            </article>
          ))}
        </div>
      )}
    </>
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

export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ status?: string; family?: string; q?: string }>;
}) {
  const { section } = await params;
  if (!(section in sections)) notFound();

  const sectionName = section as SectionName;
  const content = sections[sectionName];
  const snapshot = await getActiveWorkspaceSnapshot();
  const filters = await searchParams;
  const views = {
    schools: <SchoolsView snapshot={snapshot} />,
    essays: <EssaysView snapshot={snapshot} status={filters.status ?? ""} familyId={filters.family ?? ""} query={filters.q ?? ""} />,
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
