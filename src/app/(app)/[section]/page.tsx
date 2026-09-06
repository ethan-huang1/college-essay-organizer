import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, type ReactNode } from "react";

import { reuseOpportunities, type ReuseMatch } from "@/lib/progress";
import { ACTION_LABELS, type RecommendedAction } from "@/lib/matching";
import { canonicalPromptGroups, summarizeWorkloadFor, workspaceWorkload, type WorkloadSummary } from "@/lib/workload";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import type { WorkspaceSnapshot } from "@/lib/workspaces";
import { draftEssayForPromptAction } from "../../assignment-actions";
import { essayMatchesFilters, promptMatchesFilters, type Filters as FilterState } from "../../filtering";
import { createEssayAction } from "../../essay-actions";
import {
  displacedByReuse,
  documentName,
  ESSAY_STATUSES,
  EssayFields,
  essayRibbonEntries,
  matchAdjustments,
  ReuseHereControl,
  ReuseRibbon,
  type WorkspaceEssay,
} from "../../essay-ui";
import { sentenceCase, sentenceList, statusLabel } from "../../text";
import {
  essaySchoolGroups,
  ROW_STATES,
  ROW_STATE_LABEL,
  unattachedEssays,
  type EssayRow,
  type RowState,
} from "../../essay-dashboard";
import { createPromptAction } from "../../prompt-actions";
import { CatalogueStateBadge, CatalogueStateNote } from "../../catalogue-state";
import { LocalTime } from "../../local-time";
import { PendingButton } from "../../pending-button";
import { AddCollegeForm, limitLabel, ProgressLine, ProgressRing, PromptFields, PromptRow } from "../../prompt-ui";
import { SchoolMark } from "../../school-mark";
import { deleteSchoolAction, setSchoolProgramsAction, updateSchoolAction } from "../../school-actions";

// One vocabulary everywhere - nav, page title, <title>, headings and empty
// states all use these words. The route keys stay as they are: renaming
// /schools would break every ?school= link and any bookmark.
const sections = {
  schools: { title: "Your Prompts", description: "Every prompt on your list, grouped by college." },
  families: { title: "Categories", description: "The same question, asked by different schools — where one essay can do more work." },
  essays: { title: "My Essays", description: "Where each college's writing has got to — finished, in progress, and not yet started." },
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
    .map((school) => {
      const own = visible.filter((prompt) => prompt.schoolId === school.id && !sharedInstanceIds.has(prompt.id));
      return {
        school,
        // Split rather than filtered. A graded paper and a portfolio caption
        // are real requirements with real deadlines, so removing them would
        // lose work a student has to do - but they are not essays, so listing
        // them among the essay prompts makes "2 of 5 done" mean nothing.
        prompts: own.filter((prompt) => !prompt.supportingMaterial),
        supporting: own.filter((prompt) => Boolean(prompt.supportingMaterial)),
        sharedCount: sharedCountBySchool.get(school.id) ?? 0,
      };
    })
    .filter((group) => group.prompts.length > 0 || group.supporting.length > 0 || group.sharedCount > 0 || !promptFilterActive || Boolean(filters.school));

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
          {schools.map(({ school, prompts, supporting, sharedCount }) => (
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
              {supporting.length > 0 ? (
                <div className="supporting-group">
                  <h3 className="supporting-heading">Supporting material</h3>
                  <p className="detail-note">
                    Required, but not essays — {school.name} wants documents or portfolio notes here.
                    These are not counted toward your essay totals and no essay is suggested for them.
                  </p>
                  <ul className="rows">
                    {supporting.map((prompt) => (
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
                </div>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/* --------------------------------------------------------------- categories */

/**
 * Prompts within a category, grouped by word-count target so prompts of a
 * similar length sit together instead of one undifferentiated list. Shortest
 * first; prompts sharing a word count keep whatever order canonicalRows gave
 * them. Prompts with no word limit fall into a group of their own, last.
 */
function groupRowsByWordCount<T extends { prompt: { maxWordCount: number | null } }>(rows: readonly T[]) {
  const NO_LIMIT = Number.POSITIVE_INFINITY;
  const buckets = new Map<number, T[]>();
  for (const row of rows) {
    const key = row.prompt.maxWordCount ?? NO_LIMIT;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([wordCount, groupRows]) => ({
      label: wordCount === NO_LIMIT ? "Other / no word limit" : `${wordCount} words`,
      rows: groupRows,
    }));
}

/** The rows list shared by every category section - grouped by word count. */
function CategoryPromptRows({
  snapshot,
  rows,
  filters,
}: {
  snapshot: WorkspaceSnapshot;
  rows: ReturnType<typeof canonicalRows>;
  filters: Filters;
}) {
  const groups = groupRowsByWordCount(rows);
  return (
    <ul className="rows">
      {groups.map((group) => (
        <Fragment key={group.label}>
          {/* A single word-count value in the category isn't worth a heading -
              that's segmentation with nothing to distinguish. */}
          {groups.length > 1 ? <li className="row-group-heading">{group.label}</li> : null}
          {group.rows.map(({ prompt, schoolLabel: label }) => (
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
        </Fragment>
      ))}
    </ul>
  );
}

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
                <CategoryPromptRows snapshot={snapshot} rows={rows} filters={filters} />
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
              <CategoryPromptRows snapshot={snapshot} rows={unclassifiedRows} filters={filters} />
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

/**
 * Add an essay, with nothing hidden.
 *
 * Opened by a link rather than a disclosure - the state lives in the URL, so it
 * is linkable, the back button closes it, and a prompt can hand it everything it
 * knows through ?promptId=. Every field a student cares about is visible at
 * once; only designation and school-specific phrases, which are modelling
 * fields with sensible defaults, sit behind Advanced settings.
 *
 * Starting from a prompt row does not come through here at all: that path knows
 * the school, prompt, word target and category already, so it creates the
 * document and opens it.
 */
function AddEssayPanel({ snapshot, promptId, cancelHref }: { snapshot: WorkspaceSnapshot; promptId: string; cancelHref: string }) {
  const prompt = promptId ? snapshot.prompts.find((candidate) => candidate.id === promptId) : undefined;
  const school = prompt ? snapshot.schools.find((candidate) => candidate.id === prompt.schoolId) : undefined;
  const defaults = prompt
    ? {
        title: `${school?.name ?? "Draft"} — ${prompt.title}`.slice(0, 160),
        targetWordCount: prompt.maxWordCount,
        originPromptId: prompt.id,
        primaryFamilyId: prompt.primaryFamily?.id ?? undefined,
      }
    : undefined;

  return (
    <section className="add-essay-panel" id="add-essay" aria-labelledby="add-essay-heading">
      <div className="add-essay-head">
        <h2 id="add-essay-heading">Add an essay</h2>
        <Link className="text-link" href={cancelHref}>Cancel</Link>
      </div>
      {prompt ? (
        <p className="detail-note">
          Prefilled from {school?.name ?? "this college"} · {prompt.title} — {limitLabel(prompt)}.
        </p>
      ) : null}
      <form action={createEssayAction} className="prompt-form">
        <EssayFields snapshot={snapshot} defaults={defaults} advanced />
        <label className="field-wide">Starting content <span>optional — paste a draft you already have</span>
          <textarea name="content" maxLength={20000} placeholder="Draft the first version here, or leave it empty and write in the editor" />
        </label>
        <button type="submit">Add essay and open editor</button>
      </form>
    </section>
  );
}

/**
 * Which dashboard rows a filter leaves.
 *
 * The toolbar's vocabulary is the essay's, not the prompt's, so a status filter
 * asks about the document answering a prompt - a row with no document cannot
 * match one. Search and category are asked of both, because either is a
 * reasonable way to look for the same piece of work.
 */
function rowMatchesFilters(
  row: { prompt: SnapshotPrompt; essay: WorkspaceEssay | null },
  filters: Filters,
  schoolName: string,
): boolean {
  if (filters.status && row.essay?.status !== filters.status) return false;
  if (filters.family) {
    const inPrompt = row.prompt.primaryFamily?.id === filters.family
      || row.prompt.secondaryFamilies.some((family) => family.id === filters.family);
    const inEssay = row.essay?.primaryFamily?.id === filters.family
      || Boolean(row.essay?.secondaryFamilies.some((family) => family.id === filters.family));
    if (!inPrompt && !inEssay) return false;
  }
  const query = filters.q.trim().toLowerCase();
  if (query) {
    const haystack = `${row.prompt.title} ${row.prompt.promptText} ${schoolName} ${row.essay?.title ?? ""}`.toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}

function EssayStatusRows({ rows, state }: { rows: EssayRow<SnapshotPrompt, WorkspaceEssay>[]; state: RowState }) {
  if (rows.length === 0) return null;
  return (
    <div className="status-group">
      <p className="status-group-label">
        <span className={`work-dot ${state}`} aria-hidden="true" />
        {ROW_STATE_LABEL[state]} <span className="status-group-count">{rows.length}</span>
      </p>
      <ul className="rows">
        {rows.map((row) => (
          <li key={row.prompt.id}>
            <div className="row essay-row">
              <span className="row-main">
                <span className="row-title">{row.prompt.title}</span>
                <span className="row-sub">
                  {limitLabel(row.prompt)}
                  {row.prompt.requirement === "required" ? "" : ` · ${statusLabel(row.prompt.requirement)}`}
                  {row.schools.length > 1 ? ` · shared with ${row.schools.length - 1} more` : ""}
                </span>
              </span>
              <span className="row-side">
                {row.essay ? (
                  <Link className="document-link" href={`/editor/${row.essay.id}`}>
                    {documentName(row.essay)}
                    <span className="document-link-meta">
                      {row.essay.wordCount}{row.essay.targetWordCount ? `/${row.essay.targetWordCount}` : ""} words
                      {" · "}
                      {/* When it was last written in, rather than a version
                          number nobody counts. */}
                      <LocalTime iso={row.essay.lastEditedAt.toISOString()} withDate />
                    </span>
                  </Link>
                ) : (
                  // Everything this document needs is already known, so there is
                  // no form to fill in: create it and open it. The label follows
                  // the row - "Start Writing" on a prompt marked complete with
                  // no document attached would be describing the wrong thing.
                  <form action={draftEssayForPromptAction}>
                    <input name="promptId" type="hidden" value={row.prompt.id} />
                    <PendingButton className="btn start-writing" pendingLabel="Opening…">
                      {state === "not-started" ? "Start Writing" : "Add essay"}
                    </PendingButton>
                  </form>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EssayLibraryCard({
  essay,
  openCount,
  ribbon,
}: {
  essay: WorkspaceEssay;
  openCount: number;
  ribbon: readonly { schoolName: string; action: string; label: string }[];
}) {
  return (
    <article className="card essay-card" id={`essay-${essay.id}`}>
      <div className="card-head">
        <div className="card-head-text">
          <h3><Link href={`/editor/${essay.id}`}>{documentName(essay)}</Link></h3>
          <p className="card-meta">
            {essay.wordCount}{essay.targetWordCount ? ` / ${essay.targetWordCount}` : ""} words · v{essay.versionCount}
            {" · "}
            {essay.linkedPromptCount > 0
              ? `answering ${essay.linkedPromptCount} ${essay.linkedPromptCount === 1 ? "prompt" : "prompts"}`
              : "not assigned yet"}
            {openCount ? <> · <Link className="text-link" href="/reuse">{openCount} more possible</Link></> : null}
          </p>
        </div>
        <span className={`pill ${essay.status}`}>{statusLabel(essay.status)}</span>
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

        <ReuseRibbon essay={essay} matches={ribbon} />

        {essay.schoolSpecificPhrases.length > 0 ? (
          <p className="risk-note">School-specific: {essay.schoolSpecificPhrases.join(", ")}</p>
        ) : null}
      </div>

      <div className="record-actions">
        <Link className="record-open" href={`/editor/${essay.id}`}>
          Open in Essay Editor <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

/**
 * My Essays: how far each college's writing has got.
 *
 * It used to be a library - one card per essay, with the writing surface folded
 * into it - which answered "what have I written" and never "what is left". The
 * writing moved to the Essay Editor, so this page is free to answer the question
 * a student actually opens it with: per school, what is finished, what is
 * started, and what has not been begun.
 *
 * Counting stays where it belongs: essaySchoolGroups routes every number through
 * workspaceWorkload, so these headers cannot drift from the Overview's.
 */
function EssaysView({
  snapshot,
  filters,
  addOpen,
  promptId,
}: {
  snapshot: WorkspaceSnapshot;
  filters: Filters;
  addOpen: boolean;
  promptId: string;
}) {
  const { openByEssay, ribbonByEssay } = essayRibbonEntries(snapshot);
  const filterActive = Boolean(filters.status || filters.family || filters.q);

  const groups = essaySchoolGroups(snapshot)
    .map((group) => {
      const rows = group.rows.filter((row) => rowMatchesFilters(row, filters, group.school.name));
      return {
        ...group,
        rows,
        byState: {
          "not-started": rows.filter((row) => row.state === "not-started"),
          "in-progress": rows.filter((row) => row.state === "in-progress"),
          complete: rows.filter((row) => row.state === "complete"),
        },
      };
    })
    // A college with nothing matching is only hidden when a filter is what
    // emptied it; otherwise it stays, because "no supplemental essay" and "we
    // never looked" are different facts and CatalogueStateNote says which.
    .filter((group) => group.rows.length > 0 || !filterActive);

  const library = unattachedEssays(snapshot).filter((essay) => essayMatchesFilters(essay, filters));
  const addHref = withFilters("/essays", filters);

  return (
    <>
      <div className="add-panel-row">
        {addOpen ? (
          <AddEssayPanel snapshot={snapshot} promptId={promptId} cancelHref={addHref} />
        ) : (
          <Link className="btn add-essay-open" href={`${addHref}${addHref.includes("?") ? "&" : "?"}new=1#add-essay`}>
            Add essay
          </Link>
        )}
      </div>

      <div className="filter-toolbar">
        <form className="filter-controls" action="/essays">
          <label className="field-label">
            <span>Status</span>
            <select className="select" name="status" defaultValue={filters.status}>
              <option value="">Any status</option>
              {ESSAY_STATUSES.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
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

      {snapshot.schools.length === 0 && snapshot.essays.length === 0 ? (
        <EmptyWorkspace>
          No essays yet. Add a college and its prompts import — then “Start Writing” on any prompt creates the document
          for you.
        </EmptyWorkspace>
      ) : groups.length === 0 && library.length === 0 ? (
        <p className="empty-note">Nothing matches this filter.</p>
      ) : (
        <div className="school-groups">
          {groups.map((group) => (
            <section className="card school-group" key={group.school.id}>
              <div className="card-head">
                <SchoolMark name={group.school.name} />
                <div className="card-head-text">
                  <h2><Link href={`/schools?school=${group.school.id}`}>{group.school.name}</Link></h2>
                  <p className="card-meta">
                    {/* "answered" rather than "done": summarizeWorkload counts a
                        prompt with an essay attached as answered, which is
                        deliberately not the same claim as the Completed group
                        below. Same numbers as everywhere else - the word is
                        what stops the two readings looking contradictory. */}
                    {group.progress.requiredTotal > 0
                      ? `${group.progress.requiredTotal} required · ${group.progress.requiredComplete} answered · ${group.progress.requiredRemaining} to go`
                      : "No required essays on file"}
                  </p>
                  <CatalogueStateBadge school={group.school} />
                </div>
                <div className="school-group-actions">
                  <ProgressRing progress={group.progress} label={group.school.name} />
                </div>
              </div>

              {group.rows.length === 0 ? (
                <CatalogueStateNote school={group.school} />
              ) : (
                <div className="card-body status-groups">
                  {ROW_STATES.map((state) => (
                    <EssayStatusRows key={state} rows={group.byState[state]} state={state} />
                  ))}
                </div>
              )}
            </section>
          ))}

          {library.length > 0 ? (
            <section className="library-section">
              <div className="library-head">
                <h2>Reusable library</h2>
                <p className="detail-note">
                  Documents that answer no prompt on your list yet — a Common App essay, a scholarship piece, anything
                  written before its college was added.
                </p>
              </div>
              <div className="card-grid wide">
                {library.map((essay) => (
                  <EssayLibraryCard
                    key={essay.id}
                    essay={essay}
                    openCount={openByEssay.get(essay.id) ?? 0}
                    ribbon={ribbonByEssay.get(essay.id) ?? []}
                  />
                ))}
              </div>
            </section>
          ) : null}
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

function MatchRow({
  snapshot,
  match,
  schoolLabel: label,
  essayId,
}: {
  snapshot: WorkspaceSnapshot;
  match: ReuseMatch;
  schoolLabel: string;
  essayId: string;
}) {
  const adjustments = matchAdjustments(match);
  const displaced = displacedByReuse(snapshot, match.promptId, essayId);
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
            <span className={`pill risk-${match.schoolSpecificityRisk}`}>{statusLabel(`${match.schoolSpecificityRisk} risk`)}</span>
          )}
          {/* Copies the essay into a new document for this prompt rather than
              attaching one essay to a second college's question. */}
          <ReuseHereControl
            promptId={match.promptId}
            essayId={essayId}
            assignedEssayId={displaced}
            from="/reuse"
          />
        </span>
      </div>
      {/* Named edits rather than a verdict: "248 words -> cut to 150" tells a
          student what to do in a way "needs minor adaptation" never did. */}
      <p className="match-adjustments">
        {adjustments.length > 0 ? sentenceList(adjustments) : sentenceCase(match.explanation)}
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
                <h2><Link href={`/editor/${essay.id}`}>{essay.title}</Link></h2>
                <p className="card-meta">{essay.wordCount} words · {statusLabel(essay.status)}</p>
              </div>
              <p className="reuse-tally">
                <span><strong>{inUse.length}</strong> in use</span>
                <span><strong>{open.length}</strong> open</span>
              </p>
            </div>

            {open.length > 0 ? (
              <ul className="rows reuse-rows card-body">
                {open.map(({ match, schoolLabel: label }) => (
                  <MatchRow key={match.id} snapshot={snapshot} match={match} schoolLabel={label} essayId={essay.id} />
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
                    <MatchRow key={match.id} snapshot={snapshot} match={match} schoolLabel={label} essayId={essay.id} />
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
                    <MatchRow key={match.id} snapshot={snapshot} match={match} schoolLabel={label} essayId={essay.id} />
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
  searchParams: Promise<{
    school?: string;
    status?: string;
    family?: string;
    q?: string;
    edit?: string;
    remove?: string;
    /** Add Essay's open state, and what it was launched from. Not filters. */
    new?: string;
    promptId?: string;
  }>;
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
    essays: (
      <EssaysView
        snapshot={snapshot}
        filters={filters}
        addOpen={Boolean(raw.new) || Boolean(raw.promptId)}
        promptId={raw.promptId ?? ""}
      />
    ),
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
