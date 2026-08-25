import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { reuseOpportunities, summarizePrompts, workState } from "@/lib/progress";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import type { WorkspaceSnapshot } from "@/lib/workspaces";
import { assignEssayAction } from "../../assignment-actions";
import {
  createEssayAction,
  deleteEssayAction,
  restoreEssayVersionAction,
  saveEssayVersionAction,
  updateEssayMetadataAction,
} from "../../essay-actions";
import { createPromptAction } from "../../prompt-actions";
import { AddCollegeForm, ProgressBar, ProgressLine, PromptFields, PromptRow, PromptTableHead } from "../../prompt-ui";
import { deleteSchoolAction, updateSchoolAction } from "../../school-actions";

const sections = {
  schools: { title: "All prompts", description: "Every prompt on your list, grouped by school." },
  families: { title: "Essay categories", description: "The same question, asked by different schools — where one essay can do more work." },
  essays: { title: "My essays", description: "Your reusable library: drafts, versions, and the prompts each essay answers." },
  reuse: { title: "Reuse opportunities", description: "Essays you already have that could answer prompts you have not started." },
} as const;

type SectionName = keyof typeof sections;

type Filters = { school: string; family: string; status: string; q: string; edit: string; remove: string };

// Keeps the current filters in the "edit this prompt" and "remove this school"
// links, so opening (or cancelling) either never throws away the view the
// student was in.
function withFilters(base: string, filters: Filters, extra: { edit?: string; remove?: string } = {}) {
  const params = new URLSearchParams();
  const entries: [string, string][] = [
    ["school", filters.school],
    ["family", filters.family],
    ["status", filters.status],
    ["q", filters.q],
    ["edit", extra.edit ?? ""],
    ["remove", extra.remove ?? ""],
  ];
  for (const [key, value] of entries) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export const dynamic = "force-dynamic";

// Server Actions inherit their page's timeout. Everything a student does is
// well under a second, but rebuilding the example workspace imports 19 schools
// and rescores 784 matches - about 6s against Neon - so the default 10s leaves
// no headroom for a cold database wake. 60s is the Vercel Hobby ceiling.
export const maxDuration = 60;


export function generateStaticParams() {
  return Object.keys(sections).map((section) => ({ section }));
}

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  return section in sections ? { title: sections[section as SectionName].title } : {};
}

function schoolNames(snapshot: WorkspaceSnapshot) {
  return new Map(snapshot.schools.map((school) => [school.id, school.name]));
}

function EmptyWorkspace({ children }: { children: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-mark" aria-hidden="true">—</span>
      <p>{children}</p>
      <Link className="text-link" href="/">Go to the overview <span aria-hidden="true">→</span></Link>
    </div>
  );
}

/* ------------------------------------------------------------------ prompts */

function PromptFilterBar({ snapshot, filters }: { snapshot: WorkspaceSnapshot; filters: Filters }) {
  const active = filters.school || filters.family || filters.status || filters.q;
  return (
    <form className="filter-bar" action="/schools">
      <label>
        <span>School</span>
        <select name="school" defaultValue={filters.school}>
          <option value="">All schools</option>
          {[...snapshot.schools].sort((a, b) => a.name.localeCompare(b.name)).map((school) => (
            <option key={school.id} value={school.id}>{school.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Category</span>
        <select name="family" defaultValue={filters.family}>
          <option value="">All categories</option>
          {snapshot.families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}
        </select>
      </label>
      <label>
        <span>Status</span>
        <select name="status" defaultValue={filters.status}>
          <option value="">Any status</option>
          <option value="not-started">Not started</option>
          <option value="in-progress">In progress</option>
          <option value="complete">Complete</option>
        </select>
      </label>
      <label className="filter-search">
        <span>Search</span>
        <input name="q" defaultValue={filters.q} placeholder="Prompt or school" />
      </label>
      <button type="submit">Filter</button>
      {active ? <Link className="text-link" href="/schools">Clear</Link> : null}
    </form>
  );
}

// Adding a college is the primary action on this page and the entry point to
// the whole product, so it stays open; adding a prompt by hand is the rare
// fallback and stays behind disclosure.
function AddPanel({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  return (
    <>
      <section className="add-college-panel" id="add-college" aria-labelledby="add-college-heading">
        <h2 id="add-college-heading">Add a college</h2>
        <AddCollegeForm />
      </section>
      {snapshot.schools.length > 0 ? (
        <div className="add-panel-row">
          <details className="add-panel">
            <summary>Add a prompt by hand</summary>
            <form action={createPromptAction} className="prompt-form">
              <PromptFields snapshot={snapshot} />
              <p className="classification-help">Categories chosen here are saved as your manual classification.</p>
              <button type="submit">Add prompt</button>
            </form>
          </details>
        </div>
      ) : null}
    </>
  );
}

// Removing a college is irreversible and takes its prompts with it, so it is a
// two-step flow rather than a single button: the link states intent via
// ?remove=<schoolId>, and the confirmation panel spells out exactly what goes
// and what survives before anything is deleted.
function RemoveConfirmation({ school, cancelHref }: { school: WorkspaceSnapshot["schools"][number]; cancelHref: string }) {
  return (
    <div className="remove-confirm" id={`remove-${school.id}`} role="alert">
      <p className="remove-confirm-title">Remove {school.name} from your list?</p>
      <p className="detail-note">
        This deletes {school.promptCount === 0 ? "this college" : `its ${school.promptCount} ${school.promptCount === 1 ? "prompt" : "prompts"}`}
        {school.promptCount === 0 ? "" : ", their category assignments, and any essay assigned to answer them"}. Your
        essays themselves stay in your library, and you can add this college again at any time.
      </p>
      <div className="remove-confirm-actions">
        <form action={deleteSchoolAction}>
          <input name="schoolId" type="hidden" value={school.id} />
          <button type="submit">Yes, remove {school.name}</button>
        </form>
        <Link className="text-link" href={cancelHref}>Keep this college</Link>
      </div>
    </div>
  );
}

type SchoolWithState = WorkspaceSnapshot["schools"][number];

// One line per state, each of which means something different to a student
// deciding what to work on. "No supplemental essay" is finished work; "wording
// not published" is a reason to check back; "needs review" is a reason to look
// now. Collapsing them into one blank cell was the original bug.
const CATALOGUE_STATE_COPY: Record<SchoolWithState["catalogueState"], { badge: string; note: string } | null> = {
  current: null,
  "no-supplement": {
    badge: "✓ No supplemental essay",
    note: "This college asks for no supplemental essay this cycle. Nothing to write here — that is the finished state, not a gap.",
  },
  "not-published": {
    badge: "⏳ Wording not published",
    note: "This college has not published its 2026–27 wording yet. Its prompts will import once they are official; add any you already know by hand.",
  },
  "needs-review": {
    badge: "⚠ Needs review",
    note: "At least one prompt changed since it was imported. Check the wording before relying on the word limits.",
  },
  "previous-cycle-only": {
    badge: "2025–26 only",
    note: "Only last cycle's prompts are on file. They are useful for planning, but none of them count toward this cycle's work.",
  },
  manual: {
    badge: "Not yet verified",
    note: "No verified prompts on file for this college yet. Add prompts by hand, or check back once the catalogue covers it.",
  },
};

function CatalogueStateBadge({ school }: { school: SchoolWithState }) {
  const copy = CATALOGUE_STATE_COPY[school.catalogueState];
  return copy ? <span className={`catalogue-badge ${school.catalogueState}`}>{copy.badge}</span> : null;
}

function CatalogueStateNote({ school }: { school: SchoolWithState }) {
  const copy = CATALOGUE_STATE_COPY[school.catalogueState];
  return <p className={`catalogue-note ${school.catalogueState}`}>{copy?.note ?? "No prompts on file for this college yet."}</p>;
}

function SchoolHeader({
  snapshot,
  school,
  focused,
  removeHref,
}: {
  snapshot: WorkspaceSnapshot;
  school: WorkspaceSnapshot["schools"][number];
  focused: boolean;
  removeHref: string;
}) {
  const progress = summarizePrompts(snapshot.prompts.filter((prompt) => prompt.schoolId === school.id));
  return (
    <div className={`school-header${focused ? " focused" : ""}`}>
      <div>
        {focused ? null : (
          <>
            <h2><Link href={`/schools?school=${school.id}`}>{school.name}</Link></h2>
            {school.promptCount > 0 ? <ProgressLine progress={progress} /> : null}
          </>
        )}
        <CatalogueStateBadge school={school} />
        {school.notes ? <p className="detail-note">{school.notes}</p> : null}
      </div>
      <div className="school-header-side">
        <ProgressBar progress={progress} />
        <details className="school-edit">
          <summary>Edit details</summary>
          <form action={updateSchoolAction} className="inline-edit-form">
            <input name="schoolId" type="hidden" value={school.id} />
            <label>School name<input name="name" required minLength={2} maxLength={120} defaultValue={school.name} /></label>
            <label>Notes<input name="notes" maxLength={500} defaultValue={school.notes ?? ""} /></label>
            <button type="submit">Save changes</button>
          </form>
        </details>
        <Link className="school-remove" href={removeHref}>Remove</Link>
      </div>
    </div>
  );
}

function PromptsView({ snapshot, filters }: { snapshot: WorkspaceSnapshot; filters: Filters }) {
  const names = schoolNames(snapshot);
  const query = filters.q.trim().toLowerCase();
  const visible = snapshot.prompts.filter((prompt) => {
    if (filters.school && prompt.schoolId !== filters.school) return false;
    if (filters.family && prompt.primaryFamily?.id !== filters.family && !prompt.secondaryFamilies.some((family) => family.id === filters.family)) return false;
    if (filters.status && workState(prompt) !== filters.status) return false;
    if (query) {
      const haystack = `${prompt.title} ${prompt.promptText} ${names.get(prompt.schoolId) ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  // A college the student chose is always worth showing: a school with no
  // prompts has a reason, and hiding it made "no supplemental essay" look
  // identical to "we never looked". Only an active prompt filter may hide one,
  // because only then is "nothing matches" actually true.
  const promptFilterActive = Boolean(filters.family || filters.status || filters.q);
  const schools = [...snapshot.schools]
    .filter((school) => !filters.school || school.id === filters.school)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((school) => ({ school, prompts: visible.filter((prompt) => prompt.schoolId === school.id) }))
    .filter((group) => group.prompts.length > 0 || !promptFilterActive || Boolean(filters.school));

  return (
    <>
      <AddPanel snapshot={snapshot} />
      {snapshot.prompts.length > 0 ? <PromptFilterBar snapshot={snapshot} filters={filters} /> : null}

      {snapshot.schools.length === 0 ? (
        <EmptyWorkspace>No colleges yet. Add one above — its verified 2026–27 prompts import and classify themselves.</EmptyWorkspace>
      ) : schools.length === 0 ? (
        <p className="empty-note">No prompts match this filter.</p>
      ) : (
        <div className="school-sections">
          {schools.map(({ school, prompts }) => (
            <section key={school.id}>
              <SchoolHeader
                snapshot={snapshot}
                school={school}
                focused={Boolean(filters.school)}
                removeHref={`${withFilters("/schools", filters, { remove: school.id })}#remove-${school.id}`}
              />
              {filters.remove === school.id ? (
                <RemoveConfirmation school={school} cancelHref={withFilters("/schools", filters)} />
              ) : null}
              {prompts.length === 0 ? (
                promptFilterActive && school.promptCount > 0
                  ? <p className="empty-note">No prompts match this filter for {school.name}.</p>
                  : <CatalogueStateNote school={school} />
              ) : (
                <div className="prompt-table">
                  <PromptTableHead showSchool={false} />
                  {prompts.map((prompt) => (
                    <PromptRow
                      key={prompt.id}
                      snapshot={snapshot}
                      prompt={prompt}
                      schoolName={school.name}
                      showSchool={false}
                      editing={filters.edit === prompt.id}
                      editHref={`${withFilters("/schools", filters, { edit: prompt.id })}#prompt-${prompt.id}`}
                      cancelHref={`${withFilters("/schools", filters)}#prompt-${prompt.id}`}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/* --------------------------------------------------------------- categories */

function CategoriesView({ snapshot, filters }: { snapshot: WorkspaceSnapshot; filters: Filters }) {
  const names = schoolNames(snapshot);
  const focused = filters.family;
  const groups = snapshot.families
    .filter((family) => !focused || family.id === focused)
    .map((family) => ({
      family,
      prompts: snapshot.prompts.filter((prompt) => prompt.primaryFamily?.id === family.id),
    }));
  const unclassified = focused ? [] : snapshot.prompts.filter((prompt) => !prompt.primaryFamily);

  const used = groups.filter((group) => group.prompts.length > 0);
  const unused = groups.filter((group) => group.prompts.length === 0);

  if (snapshot.prompts.length === 0) {
    return <EmptyWorkspace>Categories fill in as soon as you add a college — every imported prompt is classified automatically.</EmptyWorkspace>;
  }

  return (
    <>
      {focused ? <p className="filter-note"><Link className="text-link" href="/families">← All categories</Link></p> : null}

      <div className="category-list">
        {used.map(({ family, prompts }) => {
          const progress = summarizePrompts(prompts);
          const schoolsAsking = [...new Set(prompts.map((prompt) => names.get(prompt.schoolId) ?? ""))];
          return (
            <details className="category-group" key={family.id} open>
              <summary>
                <span className="swatch large" style={{ backgroundColor: family.color }} aria-hidden="true" />
                <span className="category-heading">
                  <span className="category-name">{family.name}</span>
                  <span className="category-schools">
                    {schoolsAsking.length} {schoolsAsking.length === 1 ? "school" : "schools"} · {schoolsAsking.slice(0, 4).join(", ")}
                    {schoolsAsking.length > 4 ? ` +${schoolsAsking.length - 4} more` : ""}
                  </span>
                </span>
                <span className="category-count"><strong>{prompts.length}</strong> prompts</span>
                <ProgressBar progress={progress} />
              </summary>
              <div className="category-body">
                <p className="category-description">{family.description}</p>
                <div className="prompt-table">
                  <PromptTableHead />
                  {prompts.map((prompt) => (
                    <PromptRow
                      key={prompt.id}
                      snapshot={snapshot}
                      prompt={prompt}
                      schoolName={names.get(prompt.schoolId) ?? "Unknown school"}
                      editing={filters.edit === prompt.id}
                      editHref={`${withFilters("/families", filters, { edit: prompt.id })}#prompt-${prompt.id}`}
                      cancelHref={`${withFilters("/families", filters)}#prompt-${prompt.id}`}
                    />
                  ))}
                </div>
              </div>
            </details>
          );
        })}

        {unclassified.length > 0 ? (
          <details className="category-group">
            <summary>
              <span className="swatch large muted-swatch" aria-hidden="true" />
              <span className="category-heading">
                <span className="category-name">Unclassified</span>
                <span className="category-schools">Prompts with no primary category yet</span>
              </span>
              <span className="category-count"><strong>{unclassified.length}</strong> prompts</span>
              <ProgressBar progress={summarizePrompts(unclassified)} />
            </summary>
            <div className="category-body">
              <div className="prompt-table">
                <PromptTableHead />
                {unclassified.map((prompt) => (
                  <PromptRow
                    key={prompt.id}
                    snapshot={snapshot}
                    prompt={prompt}
                    schoolName={names.get(prompt.schoolId) ?? "Unknown school"}
                    editing={filters.edit === prompt.id}
                    editHref={`${withFilters("/families", filters, { edit: prompt.id })}#prompt-${prompt.id}`}
                    cancelHref={`${withFilters("/families", filters)}#prompt-${prompt.id}`}
                  />
                ))}
              </div>
            </div>
          </details>
        ) : null}
      </div>

      {unused.length > 0 ? (
        <p className="unused-categories">
          <span className="detail-label">No prompts yet</span>
          {unused.map(({ family }) => <span key={family.id}>{family.name}</span>)}
        </p>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------- essays */

type WorkspaceEssay = WorkspaceSnapshot["essays"][number];

const ESSAY_STATUSES = ["idea", "outline", "draft", "revising", "ready", "submitted"] as const;

function EssayFields({ snapshot, essay, omitTitle }: { snapshot: WorkspaceSnapshot; essay?: WorkspaceEssay; omitTitle?: boolean }) {
  return (
    <div className="prompt-fields">
      {omitTitle ? null : <label>Title<input name="title" required minLength={2} maxLength={160} defaultValue={essay?.title} placeholder="Why Computer Science" /></label>}
      <label>Target words<input name="targetWordCount" type="number" min={0} step={1} defaultValue={essay?.targetWordCount ?? ""} /></label>
      <label>Status<select name="status" defaultValue={essay?.status ?? "idea"}>
        {ESSAY_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
      </select></label>
      <label>Designation<select name="designation" defaultValue={essay?.designation ?? "canonical"}>
        <option value="canonical">Canonical (reusable original)</option>
        <option value="school-adaptation">School-specific adaptation</option>
      </select></label>
      <label>Primary category<select name="primaryFamilyId" defaultValue={essay?.primaryFamily?.id ?? ""}><option value="">No primary category</option>{snapshot.families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}</select></label>
      <label className="field-wide">School-specific phrases <span>comma-separated, e.g. school names to flag</span>
        <input name="schoolSpecificPhrases" defaultValue={essay?.schoolSpecificPhrases.join(", ") ?? ""} placeholder="Stanford, the Farm" />
      </label>
      <label className="field-wide">Notes<input name="notes" maxLength={2000} defaultValue={essay?.notes ?? ""} placeholder="Context, ideas, or reminders" /></label>
    </div>
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

function EssaysView({ snapshot, filters }: { snapshot: WorkspaceSnapshot; filters: Filters }) {
  const query = filters.q.trim().toLowerCase();
  const openByEssay = new Map(
    reuseOpportunities(snapshot.essays, snapshot.matches, snapshot.prompts).map((group) => [group.essay.id, group.open.length]),
  );
  const filteredEssays = snapshot.essays.filter((essay) => {
    if (filters.status && essay.status !== filters.status) return false;
    if (filters.family && essay.primaryFamily?.id !== filters.family && !essay.secondaryFamilies.some((family) => family.id === filters.family)) return false;
    if (query && !essay.title.toLowerCase().includes(query) && !essay.currentContent.toLowerCase().includes(query)) return false;
    return true;
  });

  return (
    <>
      <div className="add-panel-row">
        <details className="add-panel">
          <summary>Add an essay</summary>
          <form action={createEssayAction} className="prompt-form">
            <label className="field-wide">Title<input name="title" required minLength={2} maxLength={160} placeholder="Why Computer Science" /></label>
            <label className="field-wide">Starting content<textarea name="content" maxLength={20000} placeholder="Draft the first version here, or paste one you already have" /></label>
            <details className="field-group">
              <summary>Details (optional)</summary>
              <EssayFields snapshot={snapshot} omitTitle />
            </details>
            <button type="submit">Add essay</button>
          </form>
        </details>
      </div>

      <form className="filter-bar" action="/essays">
        <label>
          <span>Status</span>
          <select name="status" defaultValue={filters.status}>
            <option value="">Any status</option>
            {ESSAY_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Category</span>
          <select name="family" defaultValue={filters.family}>
            <option value="">All categories</option>
            {snapshot.families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}
          </select>
        </label>
        <label className="filter-search">
          <span>Search</span>
          <input name="q" defaultValue={filters.q} placeholder="Title or content" />
        </label>
        <button type="submit">Filter</button>
        {filters.status || filters.family || filters.q ? <Link className="text-link" href="/essays">Clear</Link> : null}
      </form>

      {snapshot.essays.length === 0 ? (
        <EmptyWorkspace>No essays yet. Open a prompt and choose “Start a new essay for this prompt”, or add one here.</EmptyWorkspace>
      ) : filteredEssays.length === 0 ? (
        <p className="empty-note">No essays match this filter.</p>
      ) : (
        <div className="record-grid">
          {filteredEssays.map((essay) => (
            <article className="essay-record" id={`essay-${essay.id}`} key={essay.id}>
              <div className="record-meta-row">
                <span className={`status-pill ${essay.status}`}>{essay.status}</span>
                <span className="record-meta">
                  {essay.wordCount}{essay.targetWordCount ? ` / ${essay.targetWordCount}` : ""} words · v{essay.versionCount}
                </span>
              </div>
              <h2>{essay.title}</h2>
              <div className="family-chips">
                {essay.primaryFamily ? (
                  <span className="primary-chip">
                    <span className="swatch" style={{ backgroundColor: essay.primaryFamily.color }} aria-hidden="true" />
                    {essay.primaryFamily.name}
                  </span>
                ) : <span>Unclassified</span>}
                {essay.secondaryFamilies.map((family) => <span key={family.id}>{family.name}</span>)}
              </div>
              <p className="essay-excerpt">{essay.currentContent || "No content yet."}</p>
              <p className="essay-usage">
                {essay.linkedPromptCount > 0
                  ? `Answering ${essay.linkedPromptCount} ${essay.linkedPromptCount === 1 ? "prompt" : "prompts"}`
                  : "Not assigned to a prompt yet"}
                {openByEssay.get(essay.id) ? <> · <Link className="text-link" href="/reuse">{openByEssay.get(essay.id)} more possible</Link></> : null}
              </p>
              {essay.linkedPrompts.length > 0 ? (
                <ul className="linked-prompt-list">
                  {essay.linkedPrompts.map((link) => <li key={link.id}>{link.schoolName} · {link.title}</li>)}
                </ul>
              ) : null}
              {essay.schoolSpecificPhrases.length > 0 ? <p className="risk-note">School-specific: {essay.schoolSpecificPhrases.join(", ")}</p> : null}
              <div className="record-actions">
                <details>
                  <summary>Write</summary>
                  <form action={saveEssayVersionAction} className="prompt-form">
                    <input name="essayId" type="hidden" value={essay.id} />
                    <label className="field-wide">Content <span>saving creates a new version; the essay is never edited in place</span>
                      <textarea name="content" maxLength={20000} defaultValue={essay.currentContent} />
                    </label>
                    <label className="field-wide field-secondary">Reason for this version <span>optional</span><input name="reason" maxLength={200} placeholder="Tightened the opening paragraph" /></label>
                    <button type="submit">Save as new version</button>
                  </form>
                </details>
                <details>
                  <summary>Details &amp; history</summary>
                  <form action={updateEssayMetadataAction} className="prompt-form">
                    <input name="essayId" type="hidden" value={essay.id} />
                    <EssayFields snapshot={snapshot} essay={essay} />
                    <button type="submit">Save essay details</button>
                  </form>
                  <EssayVersionHistory essay={essay} />
                  <form action={deleteEssayAction} className="delete-form">
                    <input name="essayId" type="hidden" value={essay.id} />
                    <span>Deleting removes every version and match for this essay.</span>
                    <button type="submit">Delete essay</button>
                  </form>
                </details>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

/* --------------------------------------------------------------------- reuse */

function ReuseView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const groups = reuseOpportunities(snapshot.essays, snapshot.matches, snapshot.prompts);
  const openTotal = groups.reduce((total, group) => total + group.open.length, 0);
  const riskyTotal = groups.reduce((total, group) => total + group.risky.length, 0);
  const needsNew = snapshot.prompts.filter(
    (prompt) => prompt.isCurrentCycle && !prompt.assignedEssay && !groups.some((group) => group.open.some((match) => match.promptId === prompt.id)),
  ).length;

  if (groups.length === 0) {
    return (
      <EmptyWorkspace>
        {snapshot.essays.length === 0
          ? "Reuse appears once your library has essays. Open a prompt and start one, or add an essay from My essays."
          : "None of your essays match an unanswered prompt closely enough to reuse yet. Classify prompts or essays to improve the match."}
      </EmptyWorkspace>
    );
  }

  return (
    <>
      <p className="reuse-lede">
        <strong>{openTotal}</strong> unanswered {openTotal === 1 ? "prompt" : "prompts"} can likely be served by an essay you already have.
        {needsNew > 0 ? <> {needsNew} still need something new.</> : null}
        {riskyTotal > 0 ? <> {riskyTotal} would be unsafe to reuse as-is.</> : null}
      </p>

      <div className="reuse-list">
        {groups.map(({ essay, inUse, open, risky }) => (
          <article className="reuse-group" key={essay.id}>
            <div className="reuse-group-head">
              <div>
                <h2><Link href={`/essays#essay-${essay.id}`}>{essay.title}</Link></h2>
                <p className="reuse-group-meta">{essay.wordCount} words · {essay.status}</p>
              </div>
              <p className="reuse-tally">
                <span><strong>{inUse.length}</strong> in use</span>
                <span><strong>{open.length}</strong> open</span>
              </p>
            </div>

            {open.length > 0 ? (
              <ul className="reuse-rows">
                {open.map((match) => (
                  <li key={match.id}>
                    <span className="match-score">{match.score}</span>
                    <span className="reuse-prompt">
                      <span className="cell-school">{match.schoolName}</span>
                      <span>{match.promptTitle}</span>
                    </span>
                    <span className="reuse-action">{match.recommendedAction.replaceAll("-", " ")}</span>
                    <span className={`risk-label risk-${match.schoolSpecificityRisk}`}>{match.schoolSpecificityRisk} risk</span>
                    <form action={assignEssayAction}>
                      <input name="promptId" type="hidden" value={match.promptId} />
                      <input name="essayId" type="hidden" value={essay.id} />
                      <button className="text-link" type="submit">Use here</button>
                    </form>
                    <span className="reuse-explanation">{match.explanation}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="detail-note">No further prompts match this essay closely enough to reuse yet.</p>
            )}

            {inUse.length > 0 ? (
              <p className="reuse-inuse">
                <span className="detail-label">Already answering</span>
                {inUse.map((match) => <span key={match.id}>{match.schoolName} · {match.promptTitle}</span>)}
              </p>
            ) : null}

            {risky.length > 0 ? (
              <p className="reuse-risky">
                <span className="detail-label">Do not reuse here</span>
                {risky.map((match) => (
                  <span key={match.id}>{match.schoolName} · {match.promptTitle}</span>
                ))}
                <span className="reuse-risky-why">
                  This essay names a different institution, so reusing it for another school&apos;s fit prompt reads as a
                  copy-paste. Write those fresh.
                </span>
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------- page */

export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ school?: string; status?: string; family?: string; q?: string; edit?: string; remove?: string }>;
}) {
  const { section } = await params;
  if (!(section in sections)) notFound();

  const sectionName = section as SectionName;
  const content = sections[sectionName];
  const snapshot = await getActiveWorkspaceSnapshot();
  const raw = await searchParams;
  const filters: Filters = {
    school: raw.school ?? "",
    family: raw.family ?? "",
    status: raw.status ?? "",
    q: raw.q ?? "",
    edit: raw.edit ?? "",
    remove: raw.remove ?? "",
  };
  const focusedSchool = snapshot.schools.find((school) => school.id === filters.school);
  const focusedFamily = snapshot.families.find((family) => family.id === filters.family);

  const heading = sectionName === "schools" && focusedSchool
    ? focusedSchool.name
    : sectionName === "families" && focusedFamily
      ? focusedFamily.name
      : content.title;

  const views = {
    schools: <PromptsView snapshot={snapshot} filters={filters} />,
    families: <CategoriesView snapshot={snapshot} filters={filters} />,
    essays: <EssaysView snapshot={snapshot} filters={filters} />,
    reuse: <ReuseView snapshot={snapshot} />,
  };

  return (
    <div className="page-frame">
      <header className="section-heading">
        <div>
          <h1>{heading}</h1>
          <p className="lede">
            {focusedSchool
              ? "Every prompt this school asks, and the essays that can answer them."
              : focusedFamily
                ? focusedFamily.description
                : content.description}
          </p>
        </div>
        <ProgressLine
          className="section-progress"
          progress={summarizePrompts(
            filters.school ? snapshot.prompts.filter((prompt) => prompt.schoolId === filters.school) : snapshot.prompts,
          )}
        />
      </header>
      {views[sectionName]}
    </div>
  );
}
