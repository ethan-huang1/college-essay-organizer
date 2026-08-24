// Derived, read-only views over an existing workspace snapshot: how much of
// the application workload is done, and where one essay can serve more than
// one prompt. Nothing here is persisted - these are the numbers the UI needs
// and they are always recomputed from the snapshot, so they cannot go stale.
//
// The parameter types are deliberately structural (only the fields actually
// read) so the snapshot rows satisfy them without any casting and the tests
// can build small literals.

const DONE_STATUSES = new Set(["complete", "submitted"]);

// An essay is worth offering for an unanswered prompt when the deterministic
// matcher already judged it reusable or nearly so - see matching.ts. Anything
// weaker is a "write something new" case and is not counted as reuse.
const REUSABLE_ACTIONS = new Set(["ready-to-reuse", "minor-adaptation"]);

export type ProgressPrompt = {
  status: string;
  isCurrentCycle: boolean;
  assignedEssay: { id: string; title: string } | null;
  suggestedMatches: readonly { essayId: string; essayTitle: string; score: number; recommendedAction: string }[];
};

export type WorkState = "complete" | "in-progress" | "not-started";

export function workState(prompt: { status: string }): WorkState {
  if (DONE_STATUSES.has(prompt.status)) return "complete";
  return prompt.status === "in-progress" ? "in-progress" : "not-started";
}

/** The strongest existing essay that could answer a still-unanswered prompt. */
export function reuseCandidate(prompt: ProgressPrompt) {
  if (prompt.assignedEssay) return null;
  return prompt.suggestedMatches.find((match) => REUSABLE_ACTIONS.has(match.recommendedAction)) ?? null;
}

export type PromptProgress = {
  total: number;
  complete: number;
  inProgress: number;
  notStarted: number;
  assigned: number;
  reusable: number;
  remaining: number;
  previousCycle: number;
};

// Completion counts cover current-cycle prompts only - a previous-cycle prompt
// stays visible and usable for planning but must never make this cycle's
// workload look bigger or more finished than it is (see workspaces.ts).
export function summarizePrompts(prompts: readonly ProgressPrompt[]): PromptProgress {
  const current = prompts.filter((prompt) => prompt.isCurrentCycle);
  const complete = current.filter((prompt) => workState(prompt) === "complete").length;
  return {
    total: current.length,
    complete,
    inProgress: current.filter((prompt) => workState(prompt) === "in-progress").length,
    notStarted: current.filter((prompt) => workState(prompt) === "not-started").length,
    assigned: current.filter((prompt) => prompt.assignedEssay).length,
    reusable: current.filter((prompt) => reuseCandidate(prompt)).length,
    remaining: current.length - complete,
    previousCycle: prompts.length - current.length,
  };
}

export type ReuseMatch = {
  id: string;
  essayId: string;
  promptId: string;
  score: number;
  recommendedAction: string;
  explanation: string;
  promptTitle: string;
  schoolName: string;
  schoolSpecificityRisk: string;
  missingRequirements: readonly string[];
};

/**
 * Groups the deterministic matches into "this one essay is already answering
 * these prompts, could also answer these others, and must not be reused for
 * these" - the reuse story the product is built around. Prompts that already
 * have a different essay assigned are left out: they are not an opportunity,
 * they are settled work.
 *
 * The third bucket matters as much as the second: MVP_SPEC section 4 requires
 * institution-specific reuse risk to stay visible, so an essay naming one
 * school has to be shown as unsafe for another school's "why us" prompt
 * rather than quietly omitted for scoring below the reuse threshold.
 */
export function reuseOpportunities(
  essays: readonly { id: string; title: string; wordCount: number; status: string }[],
  matches: readonly ReuseMatch[],
  prompts: readonly { id: string; assignedEssay: { id: string } | null }[],
) {
  const assignedEssayIdByPrompt = new Map(prompts.map((prompt) => [prompt.id, prompt.assignedEssay?.id ?? null]));
  return essays
    .map((essay) => {
      const own = matches
        .filter((match) => match.essayId === essay.id && assignedEssayIdByPrompt.has(match.promptId))
        .sort((a, b) => b.score - a.score);
      const reusable = own.filter((match) => REUSABLE_ACTIONS.has(match.recommendedAction));
      return {
        essay,
        // Not filtered by match strength: an essay assigned to a prompt is
        // answering it whatever the matcher thinks of the pairing.
        inUse: own.filter((match) => assignedEssayIdByPrompt.get(match.promptId) === essay.id),
        open: reusable.filter((match) => assignedEssayIdByPrompt.get(match.promptId) === null),
        risky: own.filter(
          (match) => match.schoolSpecificityRisk === "high" && assignedEssayIdByPrompt.get(match.promptId) === null,
        ),
      };
    })
    .filter((group) => group.inUse.length + group.open.length + group.risky.length > 0)
    .sort((a, b) => b.open.length + b.inUse.length - (a.open.length + a.inUse.length));
}
