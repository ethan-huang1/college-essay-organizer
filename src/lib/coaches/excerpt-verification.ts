/**
 * Excerpt verification, shared by the excerpt-anchored coaches.
 *
 * Shorten Coach and Lengthen Coach both point at existing passages, so both
 * need the same two mechanical guarantees before anything is shown to a
 * student: the excerpt is really in the essay (the model cannot get credit
 * for text nobody wrote), and no two findings cover the same span (so
 * anything totalled across findings cannot double-count).
 *
 * Generic over the record shape rather than over a shared "recommendation"
 * type: each coach keeps its own fields and does its own post-processing on
 * top of the filtered list. Coaches whose output is not excerpt-anchored
 * simply do not call this.
 */
export function verifyAndDedupeExcerpts<T extends { excerpt: string }>(content: string, recs: T[]): T[] {
  const withRanges = recs
    .map((rec) => {
      const start = content.indexOf(rec.excerpt);
      return start === -1 ? null : { rec, start, end: start + rec.excerpt.length };
    })
    .filter((entry): entry is { rec: T; start: number; end: number } => entry !== null)
    .sort((a, b) => a.start - b.start);

  const kept: T[] = [];
  let lastEnd = -1;
  for (const { rec, start, end } of withRanges) {
    if (start >= lastEnd) {
      kept.push(rec);
      lastEnd = end;
    }
  }
  return kept;
}
