import Link from "next/link";

import { DEMO_SCHOOLS } from "@/lib/db/demo-workspace";
import { ACTION_LABELS, type RecommendedAction } from "@/lib/matching";
import { reuseOpportunities } from "@/lib/progress";
import { canonicalPromptGroups, workspaceWorkload } from "@/lib/workload";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import { displacedByReuse, matchAdaptation, ReuseHereControl } from "../essay-ui";
import { availabilitySentence, schoolAvailability } from "@/lib/schools";
import { CatalogueStateBadge } from "../catalogue-state";
import { AddCollegeForm, ProgressRing } from "../prompt-ui";
import { workloadBands } from "../workload-bands";
import { SchoolMark } from "../school-mark";

export const dynamic = "force-dynamic";

// Server Actions inherit their page's timeout. Everything a student does is
// well under a second, but rebuilding the example workspace imports 19 schools
// and rescores 784 matches - about 6s against Neon - so the default 10s leaves
// no headroom for a cold database wake. 60s is the Vercel Hobby ceiling.
export const maxDuration = 60;


/** Availability kinds whose sentence is a count, so a status badge adds to it. */
const countKinds = new Set(["required", "optional-only", "awaiting-programs"]);

export default async function Overview() {
  const snapshot = await getActiveWorkspaceSnapshot();
  const overall = workspaceWorkload(snapshot);

  const bySchool = snapshot.schools
    .map((school) => ({ school, progress: workspaceWorkload(snapshot, (prompt) => prompt.schoolId === school.id) }))
    .sort((a, b) => b.progress.requiredRemaining - a.progress.requiredRemaining || a.school.name.localeCompare(b.school.name));

  const byCategory = snapshot.families
    .map((family) => ({ family, progress: workspaceWorkload(snapshot, (prompt) => prompt.primaryFamily?.id === family.id) }))
    .filter((row) => row.progress.total + row.progress.previousCycle > 0)
    .sort((a, b) => b.progress.requiredTotal - a.progress.requiredTotal || b.progress.total - a.progress.total);

  const reuse = reuseOpportunities(snapshot.essays, snapshot.matches, snapshot.prompts);
  // A prompt several schools share names all of them, so the panel does not
  // read as though one campus in particular were asking.
  const sharedLabel = new Map<string, string>();
  for (const entry of canonicalPromptGroups(snapshot.prompts, snapshot.schools)) {
    const label = entry.schools.length > 3
      ? `${entry.schools.slice(0, 3).map((school) => school.name).join(", ")} +${entry.schools.length - 3}`
      : entry.schools.map((school) => school.name).join(", ");
    for (const id of entry.instanceIds) sharedLabel.set(id, label);
  }
  // Each essay's single strongest opportunity, so the panel shows the breadth
  // of the library rather than six rows of the same essay.
  const topReuse = reuse
    .flatMap((group) => (group.open[0] ? [{ match: group.open[0], essay: group.essay }] : []))
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, 6);
  const openReuse = reuse.reduce((total, group) => total + group.open.length, 0);
  const attention = snapshot.prompts.filter((prompt) => prompt.verificationStatus === "needs-review").length;

  if (snapshot.schools.length === 0) {
    return (
      <div className="page-frame">
        <header className="section-heading">
          <div>
            <h1>Start your list</h1>
            <p className="lede">
              Add the colleges you are applying to. Verified 2026–27 prompts import and classify themselves, so you can
              see the whole workload — and where one essay can answer several prompts — from the first school on.
            </p>
          </div>
        </header>
        <div className="overview-empty card">
          <AddCollegeForm />
          <p className="empty-note">
            Prefer to look around first? Open the <strong>Example workspace</strong> from the account menu at the top
            right: a fully populated list of {DEMO_SCHOOLS.length} colleges with real prompts and clearly labelled
            sample essays. It is kept entirely separate from your own work.
          </p>
        </div>
      </div>
    );
  }

  const bands = workloadBands(snapshot, overall);
  const totalBanded = bands.reduce((sum, band) => sum + band.count, 0);

  return (
    <div className="page-frame">
      <header className="overview-head">
        <div>
          <h1>Overview</h1>
          <p className="lede">
            {overall.requiredTotal === 0
              // A school whose 2026-27 prompts are not published yet leaves a
              // real workspace with nothing required. Without this branch the
              // first thing that student read was "All 0 required essays are
              // done", which sounds like an error and is not even true.
              ? "None of your colleges list a required essay for this cycle yet. Anything below is optional, awaiting your programs, or from a previous cycle."
              : overall.requiredRemaining > 0
                ? `Of your ${overall.requiredTotal} required ${overall.requiredTotal === 1 ? "essay" : "essays"}, ${overall.requiredRemaining} remain. See which ones need a quick edit, a bigger rewrite, or a fresh start.`
                : `All ${overall.requiredTotal} required ${overall.requiredTotal === 1 ? "essay" : "essays"} are done. Anything below is optional or from a previous cycle.`}
          </p>
        </div>
        <p className="overview-total">
          <strong>{overall.requiredTotal}</strong>
          <span>required {overall.requiredTotal === 1 ? "essay" : "essays"} total</span>
        </p>
      </header>

      <section className="band-panel" aria-labelledby="status-heading">
        <div className="band-panel-head">
          <h2 id="status-heading">Application status</h2>
          <span className="muted">
            {overall.requiredTotal} required {overall.requiredTotal === 1 ? "essay" : "essays"}
          </span>
        </div>

        {/* The same five numbers as the tiles, at a glance. Decorative: every
            band is named and counted below, so nothing here is the only
            carrier of the information. */}
        {totalBanded > 0 ? (
          <div className="band-bar" aria-hidden="true">
            {bands.filter((band) => band.count > 0).map((band) => (
              <span
                className={`band-bar-part band-${band.key}`}
                key={band.key}
                style={{ flexGrow: band.count }}
              />
            ))}
          </div>
        ) : null}

        <dl className="band-grid">
          {bands.map((band) => (
            <div className={`band-tile band-${band.key}`} key={band.key}>
              <dt>
                {band.title}
                <span className="band-dot" aria-hidden="true" />
              </dt>
              <dd>{band.count}</dd>
              <span className="band-caption">{band.caption}</span>
            </div>
          ))}
        </dl>

        <p className="band-meta">
          <span><strong>{snapshot.essays.length}</strong> {snapshot.essays.length === 1 ? "essay" : "essays"} in library</span>
          <span><strong>{overall.assigned}</strong> assigned</span>
          <span><strong>{overall.optionalExtra}</strong> optional</span>
          {overall.programSpecific > 0 ? <span><strong>{overall.programSpecific}</strong> program-specific</span> : null}
          {overall.unresolvedConditional > 0 ? (
            <span className="band-meta-flag"><strong>{overall.unresolvedConditional}</strong> unresolved</span>
          ) : null}
          {overall.previousCycle > 0 ? <span><strong>{overall.previousCycle}</strong> previous cycle</span> : null}
        </p>
      </section>

      <section className="overview-section" aria-labelledby="colleges-heading">
        <div className="section-bar">
          <h2 id="colleges-heading">Your colleges</h2>
          <span className="section-bar-links">
            <Link className="text-link" href="/schools#add-college">Add college</Link>
            <Link className="text-link" href="/schools">Your Prompts <span aria-hidden="true">→</span></Link>
          </span>
        </div>
        <div className="card-grid">
          {bySchool.map(({ school, progress }) => {
            // The same five bands as the Overview, scoped to this college.
            // "Completed" is the ring rather than a tile, matching how a student
            // reads a card: how far along, then what is left and how hard.
            const availability = schoolAvailability({
              catalogueState: school.catalogueState,
              promptCount: school.promptCount,
              requiredTotal: progress.requiredTotal,
              optionalExtra: progress.optionalExtra,
              programSpecific: progress.programSpecific,
              unresolvedConditional: progress.unresolvedConditional,
            });
            const schoolBands = workloadBands(snapshot, progress);
            const remaining = schoolBands.filter((band) => band.key !== "completed");
            const reusable = remaining
              .filter((band) => band.key === "slight" || band.key === "moderate")
              .reduce((sum, band) => sum + band.count, 0);

            return (
            <article className="card school-card" key={school.id}>
              <div className="card-head">
                <SchoolMark name={school.name} />
                <div className="card-head-text">
                  <h3>
                    <Link href={`/schools?school=${school.id}`}>{school.name}</Link>
                  </h3>
                  {/* One metadata row: the workload sentence and the status
                      badge sit together, so the badge never adds a card row or
                      shifts the workload boxes below it. */}
                  <p className="card-meta card-meta-row">
                    <span>{availabilitySentence(availability)}</span>
                    {/* The badge only earns its place when the sentence is a
                        count. For the status kinds the sentence already carries
                        the state, and showing both said the same thing twice -
                        "Prompts not yet published" beside a badge reading
                        "Wording not published". */}
                    {countKinds.has(availability.kind) ? <CatalogueStateBadge school={school} /> : null}
                  </p>
                </div>
                <ProgressRing progress={progress} label={school.name} caption="Complete" />
              </div>

              {progress.requiredRemaining > 0 ? (
                <div className="school-bands">
                  <dl className="band-grid compact">
                    {remaining.map((band) => (
                      <div className={`band-tile band-${band.key}`} key={band.key}>
                        <dd>{band.count}</dd>
                        <dt>{band.title}</dt>
                      </div>
                    ))}
                  </dl>

                  <div className="band-bar thin" aria-hidden="true">
                    {remaining.filter((band) => band.count > 0).map((band) => (
                      <span
                        className={`band-bar-part band-${band.key}`}
                        key={band.key}
                        style={{ flexGrow: band.count }}
                      />
                    ))}
                  </div>

                  <p className="school-bands-note">
                    {reusable > 0
                      ? `${reusable} can reuse existing ${reusable === 1 ? "essay" : "essays"}`
                      : "None can reuse an existing essay yet"}
                  </p>
                </div>
              ) : (
                /* A college with nothing left to break down still reserves the
                   row, so its card matches the height of the ones beside it. */
                <div className="school-bands-empty">
                  <p className="school-bands-note">
                    {progress.requiredTotal > 0
                      ? "All required essays are done"
                      : "Nothing to break down yet"}
                  </p>
                </div>
              )}
            </article>
            );
          })}
        </div>
      </section>

      <div className="overview-columns">
        <section className="overview-section" aria-labelledby="categories-heading">
          <div className="section-bar">
            <h2 id="categories-heading">Progress by category</h2>
            <Link className="text-link" href="/families">Categories <span aria-hidden="true">→</span></Link>
          </div>
          <div className="card">
            <ul className="rows">
              {byCategory.map(({ family, progress }) => (
                <li key={family.id}>
                  <div className="row">
                    <span className="swatch" style={{ backgroundColor: family.color }} aria-hidden="true" />
                    <span className="row-main">
                      <Link className="row-title" href={`/families?family=${family.id}`}>{family.name}</Link>
                    </span>
                    <span className="row-side">
                      {progress.reusable > 0 ? <span>{progress.reusable} reusable</span> : null}
                      <span className="row-count">
                        {progress.requiredTotal > 0 ? `${progress.requiredComplete}/${progress.requiredTotal}` : "—"}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="overview-section" aria-labelledby="reuse-heading">
          <div className="section-bar">
            <h2 id="reuse-heading">Reuse opportunities</h2>
            <Link className="text-link" href="/reuse">All {openReuse} <span aria-hidden="true">→</span></Link>
          </div>
          <div className="card">
            {topReuse.length === 0 ? (
              <p className="empty-note">
                {snapshot.essays.length === 0
                  ? "Once your library has essays, prompts they can answer show up here."
                  : "No unanswered prompt matches an existing essay closely enough yet."}
              </p>
            ) : (
              <ul className="rows">
                {topReuse.map(({ match, essay }) => (
                  <li key={match.id}>
                    <div className="row">
                      <span className="match-score">{match.score}</span>
                      <span className="row-main">
                        <span className="row-title">{match.promptTitle}</span>
                        <span className="row-sub">
                          {sharedLabel.get(match.promptId) ?? match.schoolName} · {essay.title}
                        </span>
                      </span>
                      <span className="row-side">
                        <span className={`pill ${match.recommendedAction}`}>
                          {ACTION_LABELS[match.recommendedAction as RecommendedAction]}
                        </span>
                        {/* The length axis, separate from the band on purpose:
                            substance and editing cost are different answers. */}
                        <span className="muted">{matchAdaptation(match)}</span>
                        {/* Copies the essay into a new document for this
                            prompt, like every other "Use here" in the app. */}
                        <ReuseHereControl
                          promptId={match.promptId}
                          essayId={essay.id}
                          assignedEssayId={displacedByReuse(snapshot, match.promptId, essay.id)}
                          from="/"
                        />
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {attention > 0 ? (
        <p className="overview-note">
          <strong>{attention}</strong> imported prompt{attention === 1 ? "" : "s"} need a source check.
        </p>
      ) : null}

    </div>
  );
}
