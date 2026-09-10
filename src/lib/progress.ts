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
const REUSABLE_ACTIONS = new Set(["reusable-slight-edits", "reusable-edits"]);

// The four user-facing reuse bands. Content fit decides the band; editing cost
// - school-specific material, word count, a function mismatch - can only lower
// it. "Adapt this" is a recommendation, not a refusal: a strong Stanford fit
// essay is a real starting point for Duke.
//
// There is no "ready to reuse" band. Essentially every reused essay needs some
// tailoring, so the top band is "slight edits" and READY_ACTION names it.
const READY_ACTION = "reusable-slight-edits";
const WITH_EDITS_ACTIONS = new Set(["reusable-edits", "reusable-significant-edits"]);

export type ProgressPrompt = {
  status: string;
  isCurrentCycle: boolean;
  /** Non-null for a requirement that is not a student-written essay - a graded
   * paper, a portfolio, a recording. Optional so callers that only ever hold
   * essay prompts need not carry it. */
  supportingMaterial?: string | null;
  assignedEssay: { id: string; title: string } | null;
  suggestedMatches: readonly { essayId: string; essayTitle: string; score: number; recommendedAction: string }[];
};

/**
 * Whether a prompt is work the student actually writes.
 *
 * Some catalogue rows are requirements but not essays: Princeton asks for a
 * graded paper, Tufts for a portfolio piece. The matcher has always skipped
 * them (reuse.ts), but every counter used to include them, so a graded-paper
 * upload was rendered as a required essay - and at Amherst, marking one
 * complete satisfied a choose-one group, so the school read "1 of 1 required
 * essay done" with no supplement written.
 *
 * This is the single definition of that question. Every surface that counts,
 * groups or lists essay work calls it, so they cannot drift apart again.
 */
export function isCountableEssayPrompt(prompt: { supportingMaterial?: string | null }) {
  return (prompt.supportingMaterial ?? null) === null;
}

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
  const current = prompts.filter((prompt) => prompt.isCurrentCycle && isCountableEssayPrompt(prompt));
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
  /** True when school-specific material must change before submitting. */
  adaptationRequired?: boolean;
  missingRequirements: readonly string[];
  matchedThemes: readonly string[];
  wordCountDifference: number;
  promptMaxWordCount: number | null;
  essayWordCount: number;
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
  prompts: readonly { id: string; isCurrentCycle: boolean; assignedEssay: { id: string } | null }[],
) {
  // Current-cycle prompts only, matching summarizePrompts. Without this a
  // previous-cycle prompt could be offered as live reuse work while being
  // excluded from every count - which is why the tallies never reconciled.
  const assignedEssayIdByPrompt = new Map(
    prompts.filter((prompt) => prompt.isCurrentCycle).map((prompt) => [prompt.id, prompt.assignedEssay?.id ?? null]),
  );
  return essays
    .map((essay) => {
      const own = matches
        .filter((match) => match.essayId === essay.id && assignedEssayIdByPrompt.has(match.promptId))
        .sort((a, b) => b.score - a.score);
      const unanswered = (match: ReuseMatch) => assignedEssayIdByPrompt.get(match.promptId) === null;
      return {
        essay,
        // Not filtered by match strength: an essay assigned to a prompt is
        // answering it whatever the matcher thinks of the pairing.
        inUse: own.filter((match) => assignedEssayIdByPrompt.get(match.promptId) === essay.id),
        // Ready: strong content fit AND nothing school-specific to change.
        open: own.filter((match) => unanswered(match) && match.recommendedAction === READY_ACTION),
        // Reusable with edits: the content answers the prompt, but institution-
        // specific material has to be adapted first. This replaced a "do not
        // reuse here" bucket that told students to write a fresh essay when they
        // already had a strong one.
        withEdits: own.filter((match) => unanswered(match) && WITH_EDITS_ACTIONS.has(match.recommendedAction)),
        // Everything else that shares a theme. The page used to say "no
        // further prompts match this essay closely enough" whenever `open` was
        // empty, which read as "nothing here" even with a dozen weaker but
        // real candidates - so they are offered as weaker options rather than
        // silently dropped. Deliberately not part of `reusable`, so the
        // "reusable now" count does not inflate.
        // Weaker options: the content does not really answer the prompt, but it
        // shares a theme, so it is worth offering rather than hiding.
        possible: own.filter(
          (match) =>
            unanswered(match)
            && match.recommendedAction !== READY_ACTION
            && !WITH_EDITS_ACTIONS.has(match.recommendedAction)
            && match.matchedThemes.length > 0,
        ),
      };
    })
    .filter((group) => group.inUse.length + group.open.length + group.withEdits.length + group.possible.length > 0)
    .sort((a, b) =>
      b.open.length + b.withEdits.length + b.inUse.length - (a.open.length + a.withEdits.length + a.inUse.length));
}
