/**
 * Word-count grouping for the Categories view.
 *
 * Pure, and deliberately in its own module rather than inline in
 * [section]/page.tsx: the comparator carries a sentinel (+Infinity for "no
 * stated limit") whose ordering is easy to break silently, and vitest only
 * collects `src/**\/*.test.ts`, so nothing in a .tsx file can be tested at all.
 */

/** Prompts with no stated maximum sort into their own group, always last. */
const NO_LIMIT = Number.POSITIVE_INFINITY;

export type WordCountGroup<T> = { label: string; rows: T[] };

/**
 * Groups prompts by word-count target so prompts of a similar length sit
 * together instead of forming one undifferentiated list.
 *
 * Longest first, so the essays that carry the most work lead. Prompts sharing a
 * word count keep the order they arrived in, which is the caller's ranking.
 */
export function groupRowsByWordCount<T extends { prompt: { maxWordCount: number | null } }>(
  rows: readonly T[],
): WordCountGroup<T>[] {
  const buckets = new Map<number, T[]>();
  for (const row of rows) {
    const key = row.prompt.maxWordCount ?? NO_LIMIT;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  return [...buckets.entries()]
    // Descending, except NO_LIMIT stays last rather than sorting to the front
    // as +Infinity otherwise would: "no stated limit" is not the biggest essay,
    // it is the unknown one, and it reads as a footnote to the real groups.
    .sort(([a], [b]) => {
      if (a === NO_LIMIT) return 1;
      if (b === NO_LIMIT) return -1;
      return b - a;
    })
    .map(([wordCount, groupRows]) => ({
      label: wordCount === NO_LIMIT ? "Other / no word limit" : `${wordCount} words`,
      rows: groupRows,
    }));
}
