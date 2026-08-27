import Link from "next/link";

import { DEMO_SCHOOLS } from "@/lib/db/demo-workspace";
import { ACTION_LABELS, type RecommendedAction } from "@/lib/matching";
import { reuseOpportunities } from "@/lib/progress";
import { canonicalPromptGroups, workspaceWorkload } from "@/lib/workload";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import { assignEssayAction } from "../assignment-actions";
import { AddCollegeForm, ProgressBar, ProgressLine } from "../prompt-ui";

export const dynamic = "force-dynamic";

// Server Actions inherit their page's timeout. Everything a student does is
// well under a second, but rebuilding the example workspace imports 19 schools
// and rescores 784 matches - about 6s against Neon - so the default 10s leaves
// no headroom for a cold database wake. 60s is the Vercel Hobby ceiling.
export const maxDuration = 60;


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
        <div className="overview-empty">
          <AddCollegeForm />
          <p className="detail-note">
            Prefer to look around first? Open the <strong>Example workspace</strong> from the workspace panel in the
            sidebar: a fully populated list of {DEMO_SCHOOLS.length} colleges with real prompts and clearly labelled
            sample essays. It is kept entirely separate from your own work.
          </p>
        </div>
      </div>
    );
  }

  // Required essays, not prompt rows: a choose-4-of-8 set counts as four and a
  // question five campuses share counts once.
  const tiles: [string, number, string?][] = [
    ["Required essays", overall.requiredTotal, "this cycle"],
    ["Done", overall.requiredComplete],
    ["To go", overall.requiredRemaining],
    ["Optional", overall.optionalExtra, "not asked for"],
    ["Reusable now", overall.reusable, "an essay already fits"],
    ["Essays", snapshot.essays.length, `${overall.assigned} assigned`],
  ];

  return (
    <div className="page-frame">
      <header className="section-heading">
        <div>
          <h1>Overview</h1>
          <p className="lede">
            {snapshot.schools.length} {snapshot.schools.length === 1 ? "school" : "schools"} ·{" "}
            {overall.requiredTotal} required {overall.requiredTotal === 1 ? "essay" : "essays"} this cycle. You are
            building a reusable library, not starting over at every college.
          </p>
        </div>
        <ProgressLine className="section-progress" progress={overall} />
      </header>

      <dl className="stat-tiles">
        {tiles.map(([label, value, note]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
            {note ? <span>{note}</span> : null}
          </div>
        ))}
      </dl>

      <div className="overview-grid">
        <section className="overview-panel">
          <div className="panel-head">
            <h2>Progress by school</h2>
            <span className="panel-head-links">
              <Link className="text-link" href="/schools#add-college">Add college</Link>
              <Link className="text-link" href="/schools">All prompts <span aria-hidden="true">→</span></Link>
            </span>
          </div>
          <ul className="progress-rows">
            {bySchool.map(({ school, progress }) => (
              <li key={school.id}>
                <Link href={`/schools?school=${school.id}`}>{school.name}</Link>
                <ProgressBar progress={progress} />
                <span className="progress-count">{progress.requiredTotal > 0 ? `${progress.requiredComplete}/${progress.requiredTotal}` : "—"}</span>
                <span className="progress-reuse">{progress.reusable > 0 ? `${progress.reusable} reusable` : ""}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="overview-panel">
          <div className="panel-head">
            <h2>Progress by category</h2>
            <Link className="text-link" href="/families">Categories <span aria-hidden="true">→</span></Link>
          </div>
          <ul className="progress-rows">
            {byCategory.map(({ family, progress }) => (
              <li key={family.id}>
                <Link href={`/families?family=${family.id}`}>
                  <span className="swatch" style={{ backgroundColor: family.color }} aria-hidden="true" />
                  {family.name}
                </Link>
                <ProgressBar progress={progress} />
                <span className="progress-count">{progress.requiredTotal > 0 ? `${progress.requiredComplete}/${progress.requiredTotal}` : "—"}</span>
                <span className="progress-reuse">{progress.reusable > 0 ? `${progress.reusable} reusable` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="overview-panel">
        <div className="panel-head">
          <h2>Reuse opportunities</h2>
          <Link className="text-link" href="/reuse">All {openReuse} <span aria-hidden="true">→</span></Link>
        </div>
        {topReuse.length === 0 ? (
          <p className="detail-note">
            {snapshot.essays.length === 0
              ? "Once your library has essays, prompts they can answer show up here."
              : "No unanswered prompt matches an existing essay closely enough yet."}
          </p>
        ) : (
          <ul className="reuse-rows">
            {topReuse.map(({ match, essay }) => (
              <li key={match.id}>
                <span className="match-score">{match.score}</span>
                <span className="reuse-prompt">
                  <span className="cell-school">{sharedLabel.get(match.promptId) ?? match.schoolName}</span>
                  <span>{match.promptTitle}</span>
                </span>
                <span className="reuse-action">{essay.title}</span>
                <span className={`risk-label risk-${match.schoolSpecificityRisk}`}>{ACTION_LABELS[match.recommendedAction as RecommendedAction]}</span>
                <form action={assignEssayAction}>
                  <input name="promptId" type="hidden" value={match.promptId} />
                  <input name="essayId" type="hidden" value={essay.id} />
                  <button className="text-link" type="submit">Use here</button>
                </form>
                <span className="reuse-explanation">{match.explanation}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {overall.previousCycle > 0 || attention > 0 ? (
        <p className="overview-note">
          {overall.previousCycle > 0 ? (
            <>
              <strong>{overall.previousCycle}</strong> prompt{overall.previousCycle === 1 ? "" : "s"} came from a previous
              cycle and are excluded from the counts above until the school publishes 2026–27 wording.
            </>
          ) : null}
          {attention > 0 ? (
            <>
              {" "}
              <strong>{attention}</strong> imported prompt{attention === 1 ? "" : "s"} need a source check.
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
