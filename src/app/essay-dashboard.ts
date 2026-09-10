/**
 * My Essays as a per-school progress dashboard, lifted out of the view so it
 * can be tested.
 *
 * The page's question changed: it used to be "what is in my library", it is now
 * "where is each college's writing up to". That is a derivation over prompts and
 * essays with several ways to get it subtly wrong - an essay attached by origin
 * but not yet assigned, a question five campuses share, a school whose prompts
 * are all optional - so it lives here rather than inline.
 *
 * Two rules it does not get to reinvent: shared questions collapse through
 * canonicalPromptGroups, and every count comes from workspaceWorkload. Counting
 * prompt rows here is exactly how the old sidebar, headers and Overview ended up
 * disagreeing with each other.
 */

import { isCountableEssayPrompt, workState } from "@/lib/progress";
import {
  canonicalPromptGroups,
  workspaceWorkload,
  type WorkloadPrompt,
  type WorkloadSchool,
  type WorkloadSummary,
} from "@/lib/workload";

export type DashboardPrompt = WorkloadPrompt & {
  title: string;
  maxWordCount: number | null;
};

export type DashboardEssay = {
  id: string;
  title: string;
  originPromptId: string | null;
  linkedPrompts: readonly { id: string }[];
};

export type RowState = "complete" | "in-progress" | "not-started";

export const ROW_STATES: readonly RowState[] = ["not-started", "in-progress", "complete"];

export const ROW_STATE_LABEL: Record<RowState, string> = {
  complete: "Completed",
  "in-progress": "In progress",
  "not-started": "Not started",
};

export type EssayRow<P, E> = {
  prompt: P;
  /** Every underlying prompt row, so acting on one acts on all its siblings. */
  instanceIds: string[];
  /** Every school asking this same question. */
  schools: { id: string; name: string }[];
  /** The document answering it, whether assigned or merely started from it. */
  essay: E | null;
  state: RowState;
};

/**
 * The document answering a prompt.
 *
 * An assignment is the strong signal, but an essay started from a prompt and
 * not yet assigned is still that prompt's draft - "Start Writing" assigns, and
 * a student who later unassigns has not thrown the draft away. Falling back to
 * the origin is what stops such a prompt from reading as "not started" while a
 * half-written document for it exists.
 */
function documentFor<E extends DashboardEssay>(
  essays: readonly E[],
  promptIds: readonly string[],
  assignedEssayId: string | null,
): E | null {
  if (assignedEssayId) {
    const assigned = essays.find((essay) => essay.id === assignedEssayId);
    if (assigned) return assigned;
  }
  return essays.find((essay) => essay.originPromptId && promptIds.includes(essay.originPromptId)) ?? null;
}

function rowState(prompt: { status: string }, essay: unknown): RowState {
  const state = workState(prompt);
  if (state === "complete") return "complete";
  // A document that exists is work in progress whatever the prompt's own
  // status column says - the column is a manual field a student may never touch.
  return essay || state === "in-progress" ? "in-progress" : "not-started";
}

export type SchoolGroup<S, P, E> = {
  school: S;
  progress: WorkloadSummary;
  rows: EssayRow<P, E>[];
  byState: Record<RowState, EssayRow<P, E>[]>;
};

export function essaySchoolGroups<
  S extends WorkloadSchool,
  P extends DashboardPrompt,
  E extends DashboardEssay,
>(snapshot: {
  schools: readonly S[];
  prompts: readonly P[];
  essays: readonly E[];
}): SchoolGroup<S, P, E>[] {
  return [...snapshot.schools]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((school) => {
      const schoolPrompts = snapshot.prompts.filter(
        (prompt) => prompt.schoolId === school.id && isCountableEssayPrompt(prompt),
      );
      const rows = canonicalPromptGroups(schoolPrompts, snapshot.schools).map((group) => {
        const essay = documentFor(snapshot.essays, group.instanceIds, group.prompt.assignedEssay?.id ?? null);
        return {
          prompt: group.prompt,
          instanceIds: group.instanceIds,
          schools: group.schools,
          essay,
          state: rowState(group.prompt, essay),
        };
      });
      return {
        school,
        // The single counting authority, scoped to this school - the same call
        // the prompt page's header makes, so the two can never disagree.
        progress: workspaceWorkload(snapshot, (prompt) => prompt.schoolId === school.id),
        rows,
        byState: {
          "not-started": rows.filter((row) => row.state === "not-started"),
          "in-progress": rows.filter((row) => row.state === "in-progress"),
          complete: rows.filter((row) => row.state === "complete"),
        },
      };
    });
}

/**
 * Documents that belong to no college on the list: a Common App personal essay,
 * a scholarship piece, anything written before its school was added. They are
 * the reusable core of the library, so they get their own section rather than
 * being dropped for having no school.
 */
export function unattachedEssays<P extends { id: string }, E extends DashboardEssay>(snapshot: {
  prompts: readonly P[];
  essays: readonly E[];
}): E[] {
  const promptIds = new Set(snapshot.prompts.map((prompt) => prompt.id));
  return snapshot.essays.filter(
    (essay) =>
      essay.linkedPrompts.length === 0 && !(essay.originPromptId && promptIds.has(essay.originPromptId)),
  );
}
