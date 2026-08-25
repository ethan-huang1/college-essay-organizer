// How much work a student's college list actually is.
//
// The naive answer - count the prompt rows - overstates it roughly twofold.
// Only about a third of catalogue prompts are unconditionally required; the
// rest are optional, or apply only to applicants to a particular program, or
// belong to a set the school asks you to answer some of ("respond to any 4 of
// these 8"). Seven UC campuses import 56 rows for four essays of real work.
//
// Everything here is derived from a snapshot and never persisted, so it cannot
// go stale. Like progress.ts the parameter types are structural - only the
// fields actually read - so snapshot rows satisfy them without casting and
// tests can build small literals.

import { summarizePrompts, workState, type ProgressPrompt, type PromptProgress } from "./progress";

export type WorkloadPrompt = ProgressPrompt & {
  id: string;
  schoolId: string;
  requirement: string;
  canonicalKey: string | null;
  sharedApplicationKey: string | null;
  groupKey: string | null;
  groupLabel: string | null;
  groupRequiredCount: number | null;
  programKey: string | null;
  programLabel: string | null;
};

export type WorkloadSchool = {
  id: string;
  name: string;
  selectedPrograms: string[] | null;
};

/**
 * Whether a conditional prompt applies to this student.
 *
 * The third state is the important one. A conditional prompt is unresolved
 * when its catalogue entry has no programKey yet (nobody has encoded which
 * program it belongs to) or when the student has never been asked which
 * programs they are applying to. Unresolved prompts must not vanish, must not
 * count as required, and must not be quietly treated as "whatever they did
 * before" - they are surfaced separately so the answer can be supplied.
 */
export type ConditionalState = "active" | "inactive" | "unresolved";

export function conditionalState(
  prompt: Pick<WorkloadPrompt, "requirement" | "programKey">,
  school: Pick<WorkloadSchool, "selectedPrograms"> | undefined,
): ConditionalState {
  if (prompt.requirement !== "conditional") return "active";
  if (!prompt.programKey) return "unresolved";
  const selected = school?.selectedPrograms;
  // null/undefined means never asked; [] means asked and answered "none".
  if (selected == null) return "unresolved";
  return selected.includes(prompt.programKey) ? "active" : "inactive";
}

export type CanonicalPrompt<P> = {
  /** One instance, safe to render: siblings agree by construction. */
  prompt: P;
  /** Every school asking this same question, in the order given. */
  schools: { id: string; name: string }[];
  /** Every underlying prompt row, so a caller can act on all of them. */
  instanceIds: string[];
};

/**
 * Collapses prompts that are literally the same question into one entry each.
 *
 * Rendering seven identical UC Personal Insight Question sets is not
 * informative, it is noise that also makes the list look seven times longer
 * than the work. Every aggregate collection - All Prompts, Categories, Reuse,
 * the Overview - renders these, labelled with each school that asks. A
 * school-scoped view skips this and shows that campus's own instance.
 *
 * Picking the first instance as the representative is safe for two independent
 * reasons: the catalogue fails validation if records sharing a canonicalKey
 * disagree about the question, and assignment/status writes fan out across
 * siblings so their response state is identical. Neither of those is an
 * accident of ordering.
 */
export function canonicalPromptGroups<P extends { id: string; schoolId: string; canonicalKey: string | null }>(
  prompts: readonly P[],
  schools: readonly { id: string; name: string }[],
): CanonicalPrompt<P>[] {
  const nameById = new Map(schools.map((school) => [school.id, school.name]));
  const byKey = new Map<string, CanonicalPrompt<P>>();

  for (const prompt of prompts) {
    // An un-shared prompt is its own group; keying on the id keeps it distinct
    // from every other row without a special case downstream.
    const key = prompt.canonicalKey ?? `id:${prompt.id}`;
    const existing = byKey.get(key);
    const school = { id: prompt.schoolId, name: nameById.get(prompt.schoolId) ?? "Unknown school" };
    if (!existing) {
      byKey.set(key, { prompt, schools: [school], instanceIds: [prompt.id] });
      continue;
    }
    existing.instanceIds.push(prompt.id);
    if (!existing.schools.some((candidate) => candidate.id === school.id)) existing.schools.push(school);
  }

  return [...byKey.values()];
}

export type WorkloadGroup = {
  key: string;
  label: string;
  requiredCount: number;
  /** Prompts in the set, however many the school asks you to answer. */
  size: number;
  completed: number;
  remaining: number;
  schools: { id: string; name: string }[];
};

export type UnresolvedProgram = {
  schoolId: string;
  schoolName: string;
  programKey: string;
  programLabel: string | null;
};

export type WorkloadSummary = PromptProgress & {
  /** Essays the schools actually ask for, counting a choose-N set once. */
  requiredTotal: number;
  requiredComplete: number;
  requiredRemaining: number;
  /** Answerable but not asked for. Never part of requiredTotal. */
  optionalExtra: number;
  /** Gated on a program this student did not select. */
  programSpecific: number;
  /** Conditional prompts nobody can resolve yet. Excluded from required. */
  unresolvedConditional: number;
  unresolvedPrograms: UnresolvedProgram[];
  groups: WorkloadGroup[];
};

type Scope = "aggregate" | "school";

/**
 * The one place required workload is counted.
 *
 * Every count site in the app reads this rather than counting rows, so the
 * sidebar, the school headers and the overview cannot disagree with each
 * other. `scope: "aggregate"` collapses shared prompts across schools;
 * `scope: "school"` keeps a single campus's own instances.
 */
export function summarizeWorkload(
  prompts: readonly WorkloadPrompt[],
  options: { schools: readonly WorkloadSchool[]; scope: Scope },
): WorkloadSummary {
  const { schools, scope } = options;
  const schoolById = new Map(schools.map((school) => [school.id, school]));
  const base = summarizePrompts(prompts);

  const current = prompts.filter((prompt) => prompt.isCurrentCycle);
  // Collapsing to one instance per question loses which schools asked it, so
  // keep that alongside - a group spanning seven campuses has to be able to say
  // so, not just name whichever instance happened to survive.
  const schoolsByPromptId = new Map<string, { id: string; name: string }[]>();
  let scoped = current;
  if (scope === "aggregate") {
    const entries = canonicalPromptGroups(current, schools);
    for (const entry of entries) schoolsByPromptId.set(entry.prompt.id, entry.schools);
    scoped = entries.map((entry) => entry.prompt);
  }

  const unresolvedPrograms = new Map<string, UnresolvedProgram>();
  let unresolvedConditional = 0;
  let programSpecific = 0;
  const countable: WorkloadPrompt[] = [];

  for (const prompt of scoped) {
    switch (conditionalState(prompt, schoolById.get(prompt.schoolId))) {
      case "unresolved":
        unresolvedConditional += 1;
        if (prompt.programKey) {
          const key = `${prompt.schoolId}:${prompt.programKey}`;
          if (!unresolvedPrograms.has(key)) {
            unresolvedPrograms.set(key, {
              schoolId: prompt.schoolId,
              schoolName: schoolById.get(prompt.schoolId)?.name ?? "Unknown school",
              programKey: prompt.programKey,
              programLabel: prompt.programLabel,
            });
          }
        }
        break;
      case "inactive":
        programSpecific += 1;
        break;
      default:
        countable.push(prompt);
    }
  }

  // A shared application's group spans every campus that asks it, so the group
  // identity is the application rather than the school. Otherwise seven UC
  // campuses would form seven groups of eight and require 28 essays.
  const groups = new Map<string, WorkloadGroup>();
  let requiredTotal = 0;
  let requiredComplete = 0;
  let optionalExtra = 0;

  for (const prompt of countable) {
    const done = workState(prompt) === "complete" || Boolean(prompt.assignedEssay);

    if (!prompt.groupKey) {
      if (prompt.requirement === "optional") optionalExtra += 1;
      else {
        requiredTotal += 1;
        if (done) requiredComplete += 1;
      }
      continue;
    }

    const key = `${prompt.sharedApplicationKey ?? prompt.schoolId}:${prompt.groupKey}`;
    const asking = schoolsByPromptId.get(prompt.id)
      ?? (schoolById.has(prompt.schoolId) ? [{ id: prompt.schoolId, name: schoolById.get(prompt.schoolId)!.name }] : []);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: prompt.groupLabel ?? prompt.groupKey,
        requiredCount: prompt.groupRequiredCount ?? 1,
        size: 0,
        completed: 0,
        remaining: 0,
        schools: [],
      };
      groups.set(key, group);
    }
    group.size += 1;
    if (done) group.completed += 1;
    for (const school of asking) {
      if (!group.schools.some((candidate) => candidate.id === school.id)) group.schools.push(school);
    }
  }

  for (const group of groups.values()) {
    // Answering a fifth of four asked-for prompts is generous, not progress:
    // clamping is what lets a finished set read as 100% instead of 125%.
    group.completed = Math.min(group.requiredCount, group.completed);
    group.remaining = Math.max(0, group.requiredCount - group.completed);
    requiredTotal += group.requiredCount;
    requiredComplete += group.completed;
  }

  return {
    ...base,
    requiredTotal,
    requiredComplete,
    requiredRemaining: Math.max(0, requiredTotal - requiredComplete),
    optionalExtra,
    programSpecific,
    unresolvedConditional,
    unresolvedPrograms: [...unresolvedPrograms.values()],
    groups: [...groups.values()],
  };
}

/**
 * Convenience wrapper for the app's count sites: every one of them has a
 * snapshot in hand and wants the aggregate view.
 *
 * Routing them all through here is what keeps the sidebar, the school headers
 * and the overview from disagreeing with each other - which they did when each
 * counted prompt rows itself. Scoping to a single school needs no special case:
 * a canonicalKey appears at most once per school, so collapsing is a no-op
 * there.
 */
export function workspaceWorkload<P extends WorkloadPrompt>(
  snapshot: { prompts: readonly P[]; schools: readonly WorkloadSchool[] },
  filter?: (prompt: P) => boolean,
): WorkloadSummary {
  return summarizeWorkload(filter ? snapshot.prompts.filter(filter) : snapshot.prompts, {
    schools: snapshot.schools,
    scope: "aggregate",
  });
}

/** Workload for an arbitrary subset of prompts, e.g. one category's. */
export function summarizeWorkloadFor(
  snapshot: { schools: readonly WorkloadSchool[] },
  prompts: readonly WorkloadPrompt[],
): WorkloadSummary {
  return summarizeWorkload(prompts, { schools: snapshot.schools, scope: "aggregate" });
}
