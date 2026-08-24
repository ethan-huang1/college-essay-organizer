import Link from "next/link";

import { reuseOpportunities, summarizePrompts } from "@/lib/progress";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import { assignEssayAction } from "./assignment-actions";
import { AddCollegeForm, ProgressBar, ProgressLine } from "./prompt-ui";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const snapshot = await getActiveWorkspaceSnapshot();
  const overall = summarizePrompts(snapshot.prompts);

  const bySchool = snapshot.schools
    .map((school) => ({ school, progress: summarizePrompts(snapshot.prompts.filter((prompt) => prompt.schoolId === school.id)) }))
    .sort((a, b) => b.progress.remaining - a.progress.remaining || a.school.name.localeCompare(b.school.name));

  const byCategory = snapshot.families
    .map((family) => ({ family, progress: summarizePrompts(snapshot.prompts.filter((prompt) => prompt.primaryFamily?.id === family.id)) }))
    .filter((row) => row.progress.total + row.progress.previousCycle > 0)
    .sort((a, b) => b.progress.total - a.progress.total);

  const reuse = reuseOpportunities(snapshot.essays, snapshot.matches, snapshot.prompts);
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
            Prefer to look around first? Load the fictional demo from the workspace panel in the sidebar — it contains
            clearly labeled synthetic schools, essays, and reuse examples, and never touches your personal work.
          </p>
        </div>
      </div>
    );
  }

  const tiles: [string, number, string?][] = [
    ["Prompts", overall.total, "current cycle"],
    ["Complete", overall.complete],
    ["In progress", overall.inProgress],
    ["Not started", overall.notStarted],
    ["Reusable now", overall.reusable, "an essay already fits"],
    ["Essays", snapshot.essays.length, `${overall.assigned} assigned`],
  ];

  return (
    <div className="page-frame">
      <header className="section-heading">
        <div>
          <h1>Overview</h1>
          <p className="lede">
            {snapshot.schools.length} {snapshot.schools.length === 1 ? "school" : "schools"} · {overall.total} prompts
            this cycle. You are building a reusable library, not starting over at every college.
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
            <Link className="text-link" href="/schools">All prompts <span aria-hidden="true">→</span></Link>
          </div>
          <ul className="progress-rows">
            {bySchool.map(({ school, progress }) => (
              <li key={school.id}>
                <Link href={`/schools?school=${school.id}`}>{school.name}</Link>
                <ProgressBar progress={progress} />
                <span className="progress-count">{progress.total > 0 ? `${progress.complete}/${progress.total}` : "—"}</span>
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
                <span className="progress-count">{progress.total > 0 ? `${progress.complete}/${progress.total}` : "—"}</span>
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
                  <span className="cell-school">{match.schoolName}</span>
                  <span>{match.promptTitle}</span>
                </span>
                <span className="reuse-action">{essay.title}</span>
                <span className={`risk-label risk-${match.schoolSpecificityRisk}`}>{match.recommendedAction.replaceAll("-", " ")}</span>
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
