/**
 * Word-limit guidance, live.
 *
 * Autosave deliberately does not rerun matching - rescoring runs real
 * embeddings - so the matcher's adaptation notes in the editor are labelled
 * with the version they were computed from. Length is the one piece of guidance
 * that can be kept honest on every keystroke, because it is arithmetic over the
 * text in the box, so it lives here: no server-only imports, callable from the
 * client editor and from a server render alike.
 *
 * The thresholds are deliberately the same as matchAdjustments in essay-ui.tsx
 * (over the maximum; under 60% of it), so the live line and the per-prompt line
 * can never contradict each other.
 */

export type WordLimits = {
  /** The essay's own target, which the student may set to anything. */
  target?: number | null;
  /** The origin prompt's stated maximum and minimum, when it has them. */
  promptMax?: number | null;
  promptMin?: number | null;
};

/** The number the editor measures against: the student's target if set, else the prompt's cap. */
export function effectiveLimit(limits: WordLimits): number | null {
  return limits.target ?? limits.promptMax ?? null;
}

export function wordLimitNotes(count: number, limits: WordLimits): string[] {
  const notes: string[] = [];
  const limit = effectiveLimit(limits);
  if (limit && limit > 0 && count > 0) {
    if (count > limit) notes.push(`${count - limit} over the ${limit}-word limit — cut ${count - limit}`);
    else if (count / limit < 0.6) notes.push(`${count} of ${limit} words — needs substantial expansion`);
  }
  const min = limits.promptMin ?? null;
  if (min && count > 0 && count < min) notes.push(`under this prompt's ${min}-word minimum`);
  return notes;
}

/** Whether reusing an essay for a prompt should offer AI shortening first. */
export function needsShortenOffer(essayWordCount: number, promptMaxWordCount: number | null): boolean {
  return promptMaxWordCount != null && essayWordCount > promptMaxWordCount;
}
