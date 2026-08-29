import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { reuseOpportunities, type ReuseMatch } from "@/lib/progress";
import { ACTION_LABELS, type RecommendedAction } from "@/lib/matching";
import { canonicalPromptGroups, summarizeWorkloadFor, workspaceWorkload, type WorkloadSummary } from "@/lib/workload";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import type { WorkspaceSnapshot } from "@/lib/workspaces";
import { assignEssayAction } from "../../assignment-actions";
import { essayMatchesFilters, promptMatchesFilters, type Filters as FilterState } from "../../filtering";
import {
  createEssayAction,
  deleteEssayAction,
  restoreEssayVersionAction,
  saveEssayVersionAction,
  updateEssayMetadataAction,
} from "../../essay-actions";
import { createPromptAction } from "../../prompt-actions";
import { CatalogueStateBadge, CatalogueStateNote } from "../../catalogue-state";
import { AddCollegeForm, ProgressLine, ProgressRing, PromptFields, PromptRow } from "../../prompt-ui";
import { SchoolMark } from "../../school-mark";
import { deleteSchoolAction, setSchoolProgramsAction, updateSchoolAction } from "../../school-actions";

// One vocabulary everywhere - nav, page title, <title>, headings and empty
// states all use these words. The route keys stay as they are: renaming
// /schools would break every ?school= link and any bookmark.
const sections = {
  schools: { title: "Your Prompts", description: "Every prompt on your list, grouped by college." },
  families: { title: "Categories", description: "The same question, asked by different schools — where one essay can do more work." },
  essays: { title: "My Essays", description: "Your reusable library: drafts, versions, and the prompts each essay answers." },
  reuse: { title: "Reuse", description: "Essays you already have that could answer prompts you have not started." },
} as const;

type SectionName = keyof typeof sections;

type Filters = FilterState;

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

const WORK_STATE_LABEL: Record<string, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  complete: "Complete",
};

/** The same link `withFilters` builds, minus one filter. */
function withoutFilter(base: string, filters: Filters, drop: keyof Filters) {
  return withFilters(base, { ...filters, [drop]: "" });
}

/**
 * The filters currently in force, each removable on its own.
 *
 * The selects already say what is selected, but only while you look at them;
 * once the page has scrolled, "why am I seeing 4 of 52 prompts" needs an
 * answer at the top of the results. These are removal links, not toggles, so
 * they carry neither aria-pressed nor aria-current - the accessible name says
 * what activating one does.
 */
function FilterChips({
  base,
  filters,
  snapshot,
  statusLabels,
}: {
  base: string;
  filters: Filters;
  snapshot: WorkspaceSnapshot;
  statusLabels: Record<string, string>;
}) {
  const chips: { key: keyof Filters; label: string; value: string }[] = [];
  const school = snapshot.schools.find((entry) => entry.id === filters.school);
  const family = snapshot.families.find((entry) => entry.id === filters.family);
  if (school) chips.push({ key: "school", label: "School", value: school.name });
  if (family) chips.push({ key: "family", label: "Category", value: family.name });
  if (filters.status) {
    chips.push({ key: "status", label: "Status", value: statusLabels[filters.status] ?? filters.status });
  }
  if (filters.q) chips.push({ key: "q", label: "Search", value: filters.q });
  if (chips.length === 0) return null;

  return (
    <div className="filter-chips">
      <span className="eyebrow-label">Showing</span>
      {chips.map((chip) => (
        <Link
          className="chip"
          key={chip.key}
          href={withoutFilter(base, filters, chip.key)}
          aria-label={`Remove ${chip.label.toLowerCase()} filter: ${chip.value}`}
        >
          <span>
            {chip.label}: <strong>{chip.value}</strong>
          </span>
          <span aria-hidden="true">✕</span>
        </Link>
      ))}
      {chips.length > 1 ? (
        <Link className="text-link" href={base}>Clear all</Link>
      ) : null}
    </div>
  );
}

/**
 * An empty screen is an invitation to act, so it says what to do rather than
 * only what is missing.
 *
 * The illustration is drawn in the palette and is plainly a drawing - it never
 * poses as a photograph - and it is decorative, so it is hidden from screen
 * readers and the sentence carries the meaning.
 */
function EmptyWorkspace({ children }: { children: ReactNode }) {
  return (
    <div className="empty-state card">
      <svg className="empty-art" viewBox="0 0 120 80" aria-hidden="true" focusable="false">
        <rect x="14" y="10" width="58" height="60" rx="6" fill="var(--surface-sunk)" />
        <rect x="48" y="18" width="58" height="60" rx="6" fill="var(--brand-soft)" stroke="var(--brand)" strokeWidth="1.5" />
        <path d="M58 34h38M58 44h38M58 54h24" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      </svg>
      <p>{children}</p>
      <Link className="text-link" href="/">Go to the Overview <span aria-hidden="true">→</span></Link>
    </div>
  );
}

/* ------------------------------------------------------------------ prompts */

function PromptFilterBar({ snapshot, filters }: { snapshot: WorkspaceSnapshot; filters: Filters }) {
  return (
    <div className="filter-toolbar">
      <form className="filter-controls" action="/schools">
        <label className="field-label">
          <span>School</span>
          <select className="select" name="school" defaultValue={filters.school}>
            <option value="">All schools</option>
            {[...snapshot.schools].sort((a, b) => a.name.localeCompare(b.name)).map((school) => (
              <option key={school.id} value={school.id}>{school.name}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          <span>Category</span>
          <select className="select" name="family" defaultValue={filters.family}>
            <option value="">All categories</option>
            {snapshot.families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}
          </select>
        </label>
        <label className="field-label">
          <span>Status</span>
          <select className="select" name="status" defaultValue={filters.status}>
            <option value="">Any status</option>
            <option value="not-started">Not started</option>
            <option value="in-progress">In progress</option>
            <option value="complete">Complete</option>
          </select>
        </label>
        <label className="field-label filter-search">
          <span>Search</span>
          <input className="input" name="q" defaultValue={filters.q} placeholder="Prompt or school" />
        </label>
        <button className="btn" type="submit">Filter</button>
      </form>
      <FilterChips base="/schools" filters={filters} snapshot={snapshot} statusLabels={WORK_STATE_LABEL} />
    </div>
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

type SnapshotPrompt = WorkspaceSnapshot["prompts"][number];

// "UC Berkeley, UCLA, Davis +2" - one shared question names every school that
// asks it, so collapsing the duplicates loses nothing.
function schoolLabel(schools: readonly { name: string }[]) {
  const shown = schools.slice(0, 3).map((school) => school.name).join(", ");
  return schools.length > 3 ? `${shown} +${schools.length - 3}` : shown;
}

/**
 * Render-ready rows for any aggregate prompt collection.
 *
 * Every collection that spans schools goes through this, so a question several
 * schools ask identically appears once rather than once per school. A
 * school-scoped view deliberately skips it and renders that campus's own rows.
 */
function canonicalRows(snapshot: WorkspaceSnapshot, prompts: readonly SnapshotPrompt[]) {
  return canonicalPromptGroups(prompts, snapshot.schools).map((entry) => ({
    prompt: entry.prompt,
    schoolLabel: schoolLabel(entry.schools),
    sharedAcross: entry.schools.length,
  }));
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
  const progress = workspaceWorkload(snapshot, (prompt) => prompt.schoolId === school.id);
  return (
    <div className="card-head">
      <SchoolMark name={school.name} />
      <div className="card-head-text">
        {focused ? null : (
          <h2>
            <Link href={`/schools?school=${school.id}`}>{school.name}</Link>
          </h2>
        )}
        <p className="card-meta">
          {progress.requiredTotal > 0
            ? `${progress.requiredTotal} required · ${progress.requiredComplete} done · ${progress.requiredRemaining} to go`
            : "No required essays on file"}
          {progress.reusable > 0 ? ` · ${progress.reusable} reusable` : ""}
        </p>
        <CatalogueStateBadge school={school} />
        {school.notes ? <p className="card-meta">{school.notes}</p> : null}
      </div>
      <div className="school-group-actions">
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
        <ProgressRing progress={progress} label={school.name} />
      </div>
    </div>
  );
}

/**
 * Asks which programs the student is applying to, when that is the only thing
 * standing between a conditional prompt and a real count.
 *
 * Submitting with nothing checked is a valid answer, so the button says so:
 * "none of these" settles the prompts at zero rather than leaving them
 * unresolved forever.
 */
function UnresolvedProgramsPanel({ programs }: { programs: WorkloadSummary["unresolvedPrograms"] }) {
  if (programs.length === 0) return null;
  const bySchool = new Map<string, { schoolName: string; programs: WorkloadSummary["unresolvedPrograms"] }>();
  for (const program of programs) {
    const entry = bySchool.get(program.schoolId) ?? { schoolName: program.schoolName, programs: [] };
    entry.programs.push(program);
    bySchool.set(program.schoolId, entry);
  }

  return (
    <>
      {[...bySchool].map(([schoolId, { schoolName, programs: schoolPrograms }]) => (
        <form action={setSchoolProgramsAction} className="program-panel" key={schoolId}>
          <input name="schoolId" type="hidden" value={schoolId} />
          <p className="program-panel-title">Which {schoolName} programs are you applying to?</p>
          <p className="detail-note">
            {schoolPrograms.length} of its prompts are required only for particular programs. Until you say, they are
            left out of your required count rather than guessed at.
          </p>
          <div className="program-options">
            {schoolPrograms.map((program) => (
              <label key={program.programKey}>
                <input type="checkbox" name="programKey" value={program.programKey} />
                <span>{program.programLabel ?? program.programKey}</span>
              </label>
            ))}
          </div>
          <button type="submit">Save (leave all unchecked for none)</button>
        </form>
      ))}
    </>
  );
}

function PromptsView({ snapshot, filters }: { snapshot: WorkspaceSnapshot; filters: Filters }) {
  const names = schoolNames(snapshot);
  const visible = snapshot.prompts.filter((prompt) => promptMatchesFilters(prompt, filters, names));

  // A college the student chose is always worth showing: a school with no
  // prompts has a reason, and hiding it made "no supplemental essay" look
  // identical to "we never looked". Only an active prompt filter may hide one,
  // because only then is "nothing matches" actually true.
  const promptFilterActive = Boolean(filters.family || filters.status || filters.q);

  // A question several schools ask identically belongs to no one school
  // section: repeating it under each would show the eight UC Personal Insight
  // Questions seven times over. It gets its own section instead, naming every
  // school that asks. Drilling into a single school still shows that campus's
  // own rows.
  const shared = filters.school
    ? []
    : canonicalPromptGroups(visible, snapshot.schools).filter((entry) => entry.schools.length > 1);
  const sharedInstanceIds = new Set(shared.flatMap((entry) => entry.instanceIds));
  const sharedCountBySchool = new Map<string, number>();
  for (const entry of shared) {
    for (const school of entry.schools) {
      sharedCountBySchool.set(school.id, (sharedCountBySchool.get(school.id) ?? 0) + 1);
    }
  }

  const schools = [...snapshot.schools]
    .filter((school) => !filters.school || school.id === filters.school)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((school) => ({
      school,
      prompts: visible.filter((prompt) => prompt.schoolId === school.id && !sharedInstanceIds.has(prompt.id)),
      sharedCount: sharedCountBySchool.get(school.id) ?? 0,
    }))
    .filter((group) => group.prompts.length > 0 || group.sharedCount > 0 || !promptFilterActive || Boolean(filters.school));

  return (
    <>
      <AddPanel snapshot={snapshot} />
      {snapshot.prompts.length > 0 ? <PromptFilterBar snapshot={snapshot} filters={filters} /> : null}
      <UnresolvedProgramsPanel programs={workspaceWorkload(snapshot).unresolvedPrograms} />

      {snapshot.schools.length === 0 ? (
        <EmptyWorkspace>No colleges yet. Add one above — its verified 2026–27 prompts import and classify themselves.</EmptyWorkspace>
      ) : schools.length === 0 ? (
        <p className="empty-note">No prompts match this filter.</p>
      ) : (
        <div className="school-groups">
          {shared.length > 0 ? (
            <section className="card school-group">
              <div className="card-head">
                <div className="card-head-text">
                  <h2>Shared prompts</h2>
                  <p className="card-meta">
                    One set of questions, asked identically by {schoolLabel(shared[0].schools)}. Answer each once.
                  </p>
                </div>
                <div className="school-group-actions">
                  <ProgressRing
                    progress={summarizeWorkloadFor(snapshot, shared.map((entry) => entry.prompt))}
                    label="Shared prompts"
                  />
                </div>
              </div>
              <ul className="rows card-body">
                {shared.map((entry) => (
                  <li key={entry.prompt.id}>
                    <PromptRow
                      snapshot={snapshot}
                      prompt={entry.prompt}
                      schoolName={schoolLabel(entry.schools)}
                      editing={filters.edit === entry.prompt.id}
                      editHref={`${withFilters("/schools", filters, { edit: entry.prompt.id })}#prompt-${entry.prompt.id}`}
                      cancelHref={`${withFilters("/schools", filters)}#prompt-${entry.prompt.id}`}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {schools.map(({ school, prompts, sharedCount }) => (
            <section className="card school-group" key={school.id}>
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
                sharedCount > 0
                  ? (
                    <p className="empty-note">
                      All {sharedCount} of its prompts are shared with your other campuses — see Shared prompts above.
                    </p>
                  )
                  : promptFilterActive && school.promptCount > 0
                    ? <p className="empty-note">No prompts match this filter for {school.name}.</p>
                    : <CatalogueStateNote school={school} />
              ) : (
                <ul className="rows card-body">
                  {prompts.map((prompt) => (
                    <li key={prompt.id}>
                      <PromptRow
                        snapshot={snapshot}
                        prompt={prompt}
                        schoolName={school.name}
                        showSchool={false}
                        editing={filters.edit === prompt.id}
                        editHref={`${withFilters("/schools", filters, { edit: prompt.id })}#prompt-${prompt.id}`}
                        cancelHref={`${withFilters("/schools", filters)}#prompt-${prompt.id}`}
                      />
                    </li>
                  ))}
                </ul>
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
  const unclassifiedRows = canonicalRows(snapshot, unclassified);

  // Other sorts last wherever categories are listed: it is a real seventh
  // category, not a to-do list, so it neither leads the page nor gets styled as
  // a problem. Whether a classification needs a human look is a separate
  // question, answered by classificationConfidence.
  const byCount = (a: { family: { slug: string }; prompts: unknown[] }, b: typeof a) => {
    if (a.family.slug === "other") return 1;
    if (b.family.slug === "other") return -1;
    return b.prompts.length - a.prompts.length;
  };
  const used = groups.filter((group) => group.prompts.length > 0).sort(byCount);
  const unused = groups.filter((group) => group.prompts.length === 0).sort(byCount);

  if (snapshot.prompts.length === 0) {
    return <EmptyWorkspace>Categories fill in as soon as you add a college — every imported prompt is classified automatically.</EmptyWorkspace>;
  }

  return (
    <>
      {focused ? <p className="filter-note"><Link className="text-link" href="/families">← All categories</Link></p> : null}

      <div className="category-list">
        {used.map(({ family, prompts }) => {
          const progress = summarizeWorkloadFor(snapshot, prompts);
          const rows = canonicalRows(snapshot, prompts);
          const schoolsAsking = [...new Set(prompts.map((prompt) => names.get(prompt.schoolId) ?? ""))];
          return (
            <details className="card category-group" key={family.id} open>
              <summary>
                <span className="swatch large" style={{ backgroundColor: family.color }} aria-hidden="true" />
                <span className="category-heading">
                  <span className="category-name">{family.name}</span>
                  <span className="category-schools">
                    {schoolsAsking.length} {schoolsAsking.length === 1 ? "school" : "schools"} · {schoolsAsking.slice(0, 4).join(", ")}
                    {schoolsAsking.length > 4 ? ` +${schoolsAsking.length - 4} more` : ""}
                  </span>
                </span>
                <span className="category-count"><strong>{rows.length}</strong> prompts</span>
                <ProgressRing progress={progress} label={family.name} />
              </summary>
              <div className="category-body">
                <p className="category-description">{family.description}</p>
                <ul className="rows">
                  {rows.map(({ prompt, schoolLabel: label }) => (
                    <li key={prompt.id}>
                      <PromptRow
                        snapshot={snapshot}
                        prompt={prompt}
                        schoolName={label}
                        editing={filters.edit === prompt.id}
                        editHref={`${withFilters("/families", filters, { edit: prompt.id })}#prompt-${prompt.id}`}
                        cancelHref={`${withFilters("/families", filters)}#prompt-${prompt.id}`}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          );
        })}

        {unclassifiedRows.length > 0 ? (
          <details className="card category-group">
            <summary>
              <span className="swatch large muted-swatch" aria-hidden="true" />
              <span className="category-heading">
                <span className="category-name">Unclassified</span>
                <span className="category-schools">Prompts with no primary category yet</span>
              </span>
              <span className="category-count"><strong>{unclassifiedRows.length}</strong> prompts</span>
              <ProgressRing progress={summarizeWorkloadFor(snapshot, unclassified)} label="Unclassified" />
            </summary>
            <div className="category-body">
              <ul className="rows">
                {unclassifiedRows.map(({ prompt, schoolLabel: label }) => (
                  <li key={prompt.id}>
                    <PromptRow
                      snapshot={snapshot}
                      prompt={prompt}
                      schoolName={label}
                      editing={filters.edit === prompt.id}
                      editHref={`${withFilters("/families", filters, { edit: prompt.id })}#prompt-${prompt.id}`}
                      cancelHref={`${withFilters("/families", filters)}#prompt-${prompt.id}`}
                    />
                  </li>
                ))}
              </ul>
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
      <OriginPromptFields snapshot={snapshot} essay={essay} />
      <label className="field-wide">Notes<input name="notes" maxLength={2000} defaultValue={essay?.notes ?? ""} placeholder="Context, ideas, or reminders" /></label>
    </div>
  );
}

/**
 * Which prompt this essay was originally written for.
 *
 * Two ways in, because both are common: pick one from the college list, or paste
 * the prompt for something not in it - a college not added yet, a scholarship, a
 * class assignment. Selecting a prompt wins over pasted text, so a student who
 * does both does not leave two answers behind.
 *
 * This is what tells the matcher what the essay *does*, which is otherwise
 * guessed from the finished essay. Leaving it blank is fine and is what every
 * essay written before this existed will carry: matching then treats the function
 * as unknown and scores it neutral rather than as a mismatch.
 */
function OriginPromptFields({ snapshot, essay }: { snapshot: WorkspaceSnapshot; essay?: WorkspaceEssay }) {
  const schoolName = new Map(snapshot.schools.map((school) => [school.id, school.name]));
  const bySchool = new Map<string, { id: string; title: string }[]>();
  for (const prompt of snapshot.prompts) {
    const name = schoolName.get(prompt.schoolId) ?? "Unknown college";
    bySchool.set(name, [...(bySchool.get(name) ?? []), { id: prompt.id, title: prompt.title }]);
  }
  return (
    <>
      <label className="field-wide">Originally written for <span>the prompt this essay answers — used to judge reuse</span>
        <select name="originPromptId" defaultValue={essay?.originPromptId ?? ""}>
          <option value="">Not from a prompt in my list</option>
          {[...bySchool].sort(([a], [b]) => a.localeCompare(b)).map(([school, prompts]) => (
            <optgroup key={school} label={school}>
              {prompts.map((prompt) => <option key={prompt.id} value={prompt.id}>{prompt.title}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label>Or paste its title<input name="originPromptTitle" maxLength={200} defaultValue={essay?.originPromptTitle ?? ""} placeholder="Common App personal essay" /></label>
      <label className="field-wide">Or paste the original prompt <span>for a college, scholarship, or class not in your list</span>
        <textarea name="originPromptText" rows={2} maxLength={4000} defaultValue={essay?.originPromptText ?? ""} placeholder="Describe a topic, idea, or concept you find captivating…" />
      </label>
    </>
  );
}

/**
 * What this essay was written for, for display above the editor.
 *
 * Mirrors the precedence the matcher already uses - a prompt chosen from the
 * college list wins over pasted text - so the editor shows the same origin the
 * score was derived from. Read-only: nothing here decides anything.
 */
function essayOrigin(snapshot: WorkspaceSnapshot, essay: WorkspaceEssay) {
  const linked = essay.originPromptId
    ? snapshot.prompts.find((prompt) => prompt.id === essay.originPromptId)
    : undefined;
  if (linked) return { title: linked.title, text: linked.promptText };
  if (essay.originPromptTitle || essay.originPromptText) {
    return { title: essay.originPromptTitle || "Pasted prompt", text: essay.originPromptText };
  }
  return null;
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

/**
 * Where one essay can actually go.
 *
 * This is the product's whole argument on one line - an essay is not a
 * one-shot answer, it is a piece of writing several colleges will take - so it
 * is the one place the design spends any boldness.
 *
 * The mark keeps each college's own colour and the reuse band is a ring around
 * it. Tinting the mark itself by band, as first drafted, would have thrown away
 * the college identity that makes the row readable at a glance; two channels
 * carry more than one recoloured channel. Neither is load-bearing on its own:
 * every entry is a link whose accessible name states the college and the band
 * in words.
 */
function ReuseRibbon({
  essay,
  matches,
}: {
  essay: WorkspaceEssay;
  matches: readonly { schoolName: string; action: string; label: string }[];
}) {
  const seen = new Set<string>();
  const entries: { schoolName: string; action: string; label: string }[] = [];
  for (const entry of matches) {
    if (seen.has(entry.schoolName)) continue;
    seen.add(entry.schoolName);
    entries.push(entry);
  }
  if (entries.length === 0) return null;

  const shown = entries.slice(0, 9);
  const rest = entries.length - shown.length;

  return (
    <div className="ribbon-block">
      <p className="detail-label">Where this essay can go</p>
      <ul className="ribbon">
        {shown.map((entry) => (
          <li key={entry.schoolName}>
            <Link
              className={`ribbon-mark ${entry.action}`}
              href={entry.action === "assigned" ? `/essays#essay-${essay.id}` : "/reuse"}
              aria-label={`${entry.schoolName} — ${entry.label}`}
              title={`${entry.schoolName} — ${entry.label}`}
            >
              <SchoolMark name={entry.schoolName} small />
            </Link>
          </li>
        ))}
        {rest > 0 ? <li className="ribbon-more">+{rest}</li> : null}
      </ul>
    </div>
  );
}

function EssaysView({ snapshot, filters }: { snapshot: WorkspaceSnapshot; filters: Filters }) {
  const groups = reuseOpportunities(snapshot.essays, snapshot.matches, snapshot.prompts);
  const openByEssay = new Map(groups.map((group) => [group.essay.id, group.open.length]));

  // The ribbon's entries, in the order a student cares about: already
  // answering, then ready to reuse, then reusable after adapting.
  const ribbonByEssay = new Map(
    groups.map((group) => [
      group.essay.id,
      [
        ...group.inUse.map((match) => ({ schoolName: match.schoolName, action: "assigned", label: "already answering a prompt here" })),
        ...group.open.map((match) => ({
          schoolName: match.schoolName,
          action: match.recommendedAction,
          label: ACTION_LABELS[match.recommendedAction as RecommendedAction],
        })),
        ...group.withEdits.map((match) => ({
          schoolName: match.schoolName,
          action: match.recommendedAction,
          label: `${ACTION_LABELS[match.recommendedAction as RecommendedAction]}, after adapting school-specific material`,
        })),
      ],
    ]),
  );

  const filteredEssays = snapshot.essays.filter((essay) => essayMatchesFilters(essay, filters));

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

      <div className="filter-toolbar">
        <form className="filter-controls" action="/essays">
          <label className="field-label">
            <span>Status</span>
            <select className="select" name="status" defaultValue={filters.status}>
              <option value="">Any status</option>
              {ESSAY_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="field-label">
            <span>Category</span>
            <select className="select" name="family" defaultValue={filters.family}>
              <option value="">All categories</option>
              {snapshot.families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}
            </select>
          </label>
          <label className="field-label filter-search">
            <span>Search</span>
            <input className="input" name="q" defaultValue={filters.q} placeholder="Title or content" />
          </label>
          <button className="btn" type="submit">Filter</button>
        </form>
        <FilterChips base="/essays" filters={filters} snapshot={snapshot} statusLabels={{}} />
      </div>

      {snapshot.essays.length === 0 ? (
        <EmptyWorkspace>No essays yet. Open a prompt and choose “Start a new essay for this prompt”, or add one here.</EmptyWorkspace>
      ) : filteredEssays.length === 0 ? (
        <p className="empty-note">No essays match this filter.</p>
      ) : (
        <div className="card-grid wide">
          {filteredEssays.map((essay) => {
            const origin = essayOrigin(snapshot, essay);
            return (
            <article className="card essay-card" id={`essay-${essay.id}`} key={essay.id}>
              <div className="card-head">
                <div className="card-head-text">
                  <h2>{essay.title}</h2>
                  <p className="card-meta">
                    {essay.wordCount}{essay.targetWordCount ? ` / ${essay.targetWordCount}` : ""} words · v{essay.versionCount}
                    {" · "}
                    {essay.linkedPromptCount > 0
                      ? `answering ${essay.linkedPromptCount} ${essay.linkedPromptCount === 1 ? "prompt" : "prompts"}`
                      : "not assigned yet"}
                    {openByEssay.get(essay.id) ? <> · <Link className="text-link" href="/reuse">{openByEssay.get(essay.id)} more possible</Link></> : null}
                  </p>
                </div>
                <span className={`pill ${essay.status}`}>{essay.status}</span>
              </div>

              <div className="essay-card-body">
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

                <ReuseRibbon essay={essay} matches={ribbonByEssay.get(essay.id) ?? []} />

                {essay.schoolSpecificPhrases.length > 0 ? (
                  <p className="risk-note">School-specific: {essay.schoolSpecificPhrases.join(", ")}</p>
                ) : null}
              </div>

              <div className="record-actions">
                <details>
                  <summary>Write</summary>
                  <div className="essay-editor">
                    {origin ? (
                      <aside className="editor-prompt">
                        <p className="detail-label">Written for</p>
                        <p className="editor-prompt-title">{origin.title}</p>
                        {origin.text ? <p className="editor-prompt-text">{origin.text}</p> : null}
                      </aside>
                    ) : null}
                    <form action={saveEssayVersionAction} className="prompt-form editor-form">
                      <input name="essayId" type="hidden" value={essay.id} />
                      <label className="field-wide">Content <span>saving creates a new version; the essay is never edited in place</span>
                        <textarea name="content" maxLength={20000} defaultValue={essay.currentContent} />
                      </label>
                      <p className="editor-count">
                        {essay.wordCount} {essay.wordCount === 1 ? "word" : "words"} saved
                        {essay.targetWordCount ? ` · target ${essay.targetWordCount}` : ""}
                      </p>
                      <label className="field-wide field-secondary">Reason for this version <span>optional</span><input name="reason" maxLength={200} placeholder="Tightened the opening paragraph" /></label>
                      <button type="submit">Save as new version</button>
                    </form>
                  </div>
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
            );
          })}
        </div>
      )}
    </>
  );
}

/* --------------------------------------------------------------------- reuse */

/**
 * Collapses reuse suggestions that point at the same shared question.
 *
 * A reuse row is an essay/prompt pair, so five campuses asking one Personal
 * Insight Question produce five identical "you could reuse this here" rows.
 * "Use here" on the surviving row assigns through the canonical fan-out, which
 * satisfies every campus at once - so showing one row is not a simplification,
 * it is what actually happens.
 */
function canonicalMatches(snapshot: WorkspaceSnapshot, matches: readonly ReuseMatch[]) {
  const keyByPromptId = new Map<string, string>();
  const labelByKey = new Map<string, string>();
  for (const entry of canonicalPromptGroups(snapshot.prompts, snapshot.schools)) {
    const key = entry.prompt.canonicalKey ?? `id:${entry.prompt.id}`;
    labelByKey.set(key, schoolLabel(entry.schools));
    for (const id of entry.instanceIds) keyByPromptId.set(id, key);
  }

  const seen = new Set<string>();
  const rows: { match: ReuseMatch; schoolLabel: string }[] = [];
  for (const match of matches) {
    const key = keyByPromptId.get(match.promptId) ?? `id:${match.promptId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ match, schoolLabel: labelByKey.get(key) ?? match.schoolName });
  }
  return rows;
}

/**
 * Turns a match into the concrete edits reusing it would take.
 *
 * "Needs minor adaptation" does not tell a student what to do; "248 words ->
 * cut to 150" and "mentions Stanford - replace school-specific language" do.
 * All of it is derived from numbers already in the snapshot, so nothing can go
 * stale against an edited essay.
 */
function matchAdjustments(match: ReuseMatch): string[] {
  const notes: string[] = [];
  const max = match.promptMaxWordCount;
  if (max !== null && match.essayWordCount > 0) {
    if (match.essayWordCount > max) {
      notes.push(`${match.essayWordCount} words → cut to ${max}`);
    } else if (match.essayWordCount / max < 0.6) {
      notes.push(`${match.essayWordCount} of ${max} words → needs substantial expansion`);
    }
  }
  if (match.schoolSpecificityRisk === "high") notes.push("names another school → replace school-specific language");
  else if (match.schoolSpecificityRisk === "medium") notes.push("check for another school's language before reusing");
  for (const gap of match.missingRequirements) notes.push(gap);
  return notes;
}

function MatchRow({
  match,
  schoolLabel: label,
  essayId,
}: {
  match: ReuseMatch;
  schoolLabel: string;
  essayId: string;
}) {
  const adjustments = matchAdjustments(match);
  return (
    <li>
      <div className="row match-row">
        <span className="match-score">{match.score}</span>
        <span className="row-main">
          <span className="row-title">{match.promptTitle}</span>
          <span className="row-sub">{label}</span>
        </span>
        <span className="row-side">
          <span className={`pill ${match.recommendedAction}`}>
            {ACTION_LABELS[match.recommendedAction as RecommendedAction]}
          </span>
          {match.schoolSpecificityRisk === "low" ? null : (
            <span className={`pill risk-${match.schoolSpecificityRisk}`}>{match.schoolSpecificityRisk} risk</span>
          )}
          <form action={assignEssayAction}>
            <input name="promptId" type="hidden" value={match.promptId} />
            <input name="essayId" type="hidden" value={essayId} />
            <button className="text-link" type="submit">Use here</button>
          </form>
        </span>
      </div>
      {/* Named edits rather than a verdict: "248 words -> cut to 150" tells a
          student what to do in a way "needs minor adaptation" never did. */}
      <p className="match-adjustments">
        {adjustments.length > 0 ? adjustments.join(" · ") : match.explanation}
      </p>
    </li>
  );
}

function ReuseView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const groups = reuseOpportunities(snapshot.essays, snapshot.matches, snapshot.prompts)
    .map((group) => ({
      ...group,
      open: canonicalMatches(snapshot, group.open),
      inUse: canonicalMatches(snapshot, group.inUse),
      withEdits: canonicalMatches(snapshot, group.withEdits),
      possible: canonicalMatches(snapshot, group.possible),
    }));
  const openTotal = groups.reduce((total, group) => total + group.open.length, 0);
  const withEditsTotal = groups.reduce((total, group) => total + group.withEdits.length, 0);
  const answerable = new Set(groups.flatMap((group) => [...group.open, ...group.withEdits].map((row) => row.match.promptId)));
  const needsNew = canonicalPromptGroups(
    snapshot.prompts.filter((prompt) => prompt.isCurrentCycle && !prompt.assignedEssay && !answerable.has(prompt.id)),
    snapshot.schools,
  ).length;

  if (groups.length === 0) {
    return (
      <EmptyWorkspace>
        {snapshot.essays.length === 0
          ? "Reuse appears once your library has essays. Open a prompt and start one, or add an essay from My Essays."
          : "None of your essays match an unanswered prompt closely enough to reuse yet. Classify prompts or essays to improve the match."}
      </EmptyWorkspace>
    );
  }

  return (
    <>
      <p className="reuse-lede card">
        <strong>{openTotal + withEditsTotal}</strong> unanswered {openTotal + withEditsTotal === 1 ? "prompt" : "prompts"} can
        be served by an essay you already have
        {withEditsTotal > 0 ? <> — {openTotal} ready as-is, {withEditsTotal} after adapting school-specific material</> : null}.
        {needsNew > 0 ? <> {needsNew} still need something new.</> : null}
      </p>

      <div className="reuse-list">
        {groups.map(({ essay, inUse, open, withEdits, possible }) => (
          <article className="card reuse-group" key={essay.id}>
            <div className="card-head">
              <div className="card-head-text">
                <h2><Link href={`/essays#essay-${essay.id}`}>{essay.title}</Link></h2>
                <p className="card-meta">{essay.wordCount} words · {essay.status}</p>
              </div>
              <p className="reuse-tally">
                <span><strong>{inUse.length}</strong> in use</span>
                <span><strong>{open.length}</strong> open</span>
              </p>
            </div>

            {open.length > 0 ? (
              <ul className="rows reuse-rows card-body">
                {open.map(({ match, schoolLabel: label }) => (
                  <MatchRow key={match.id} match={match} schoolLabel={label} essayId={essay.id} />
                ))}
              </ul>
            ) : possible.length === 0 ? (
              <p className="detail-note">No further prompts match this essay closely enough to reuse yet.</p>
            ) : null}

            {/* Saying "nothing matches closely enough" while a dozen weaker but
                real candidates existed read as an empty page. They are offered
                as weaker options instead, behind disclosure so they do not
                compete with the strong ones. */}
            {possible.length > 0 ? (
              <details className="reuse-weaker">
                <summary>{possible.length} weaker {possible.length === 1 ? "option" : "options"} — would need real rewriting</summary>
                <ul className="rows reuse-rows">
                  {possible.map(({ match, schoolLabel: label }) => (
                    <MatchRow key={match.id} match={match} schoolLabel={label} essayId={essay.id} />
                  ))}
                </ul>
              </details>
            ) : null}

            {inUse.length > 0 ? (
              <p className="reuse-inuse">
                <span className="detail-label">Already answering</span>
                {inUse.map(({ match, schoolLabel: label }) => <span key={match.id}>{label} · {match.promptTitle}</span>)}
              </p>
            ) : null}

            {/* Previously "Do not reuse here — write those fresh", which turned a
                strong essay into a non-recommendation because it mentioned a
                school. Content fit and adaptation are separate: these are real
                recommendations that need school-specific editing first. */}
            {withEdits.length > 0 ? (
              <div className="reuse-with-edits">
                <p className="detail-label">Reusable here, after adapting school-specific material</p>
                <ul className="rows reuse-rows">
                  {withEdits.map(({ match, schoolLabel: label }) => (
                    <MatchRow key={match.id} match={match} schoolLabel={label} essayId={essay.id} />
                  ))}
                </ul>
                <p className="reuse-with-edits-why">
                  The underlying story fits these prompts. Before submitting, change the institution-specific
                  material: the school&apos;s name, and any programme, course, professor, club, tradition or visit that
                  belongs to a different campus. Anything you claim to have done or attended needs your own words —
                  check each replacement genuinely exists at the target school and genuinely interests you.
                </p>
              </div>
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
          progress={workspaceWorkload(snapshot, filters.school ? (prompt) => prompt.schoolId === filters.school : undefined)}
        />
      </header>
      {views[sectionName]}
    </div>
  );
}
