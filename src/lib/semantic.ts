/**
 * What text goes to the embedding model, for prompts and for essays.
 *
 * Kept in one small module because both sides must agree: an embedding is only
 * comparable to another produced the same way, so a change here invalidates the
 * committed prompt vectors and has to be made in both places at once.
 */

/**
 * A prompt is its question, so title and text both matter and the title often
 * carries the subject the text only implies ("Why Duke" / "What is your
 * impression of Duke...").
 *
 * Joined with a full stop rather than a space: a field boundary is a sentence
 * boundary. The same mistake in school-name detection made an essay opening
 * "Brown paper covered the table." read as a proper noun mid-sentence.
 */
export function promptEmbeddingText(title: string, promptText: string) {
  return `${title.trim()}. ${promptText.trim()}`;
}

/**
 * An essay is its content. The title is included because students title essays
 * meaningfully ("The Kitchen Table Ledger"), but the body dominates by length,
 * which is the right weighting - the title is a label, the body is the answer.
 *
 * Truncated to keep well inside the model's 256-token window. Beyond it the
 * model silently drops the tail, so a long essay would be embedded from its
 * opening alone; taking a deliberate prefix makes that explicit rather than
 * accidental. ~1200 characters is roughly 250 tokens of English prose.
 */
export function essayEmbeddingText(title: string, content: string) {
  return `${title.trim()}. ${content.trim()}`.slice(0, 1200);
}
