/**
 * A word-level diff for the "View Changes" preview toggle. No diff library is
 * installed in this repo, and the alternative - reviewing a shortened essay
 * as two opaque blobs of text - isn't reliable enough for the student to
 * trust what actually changed, so this earns its own small implementation.
 */

export type DiffToken = { text: string; type: "same" | "removed" | "added" };

function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

/** Classic LCS diff, backtracked into an edit script. */
function lcsDiff(a: string[], b: string[]): DiffToken[] {
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      tokens.push({ text: a[i], type: "same" });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      tokens.push({ text: a[i], type: "removed" });
      i++;
    } else {
      tokens.push({ text: b[j], type: "added" });
      j++;
    }
  }
  while (i < n) tokens.push({ text: a[i++], type: "removed" });
  while (j < m) tokens.push({ text: b[j++], type: "added" });
  return tokens;
}

/**
 * Diffs two texts word-by-word. Trims the shared prefix/suffix before running
 * the O(n*m) LCS table, so only the part that actually changed pays that
 * cost - shortening usually keeps most of the essay's opening and closing
 * untouched.
 * ponytail: still O(n*m) on the changed middle section; fine for essay-length
 * text (low thousands of words), swap for a Myers diff if that ever grows.
 */
export function diffWords(before: string, after: string): DiffToken[] {
  const a = tokenize(before);
  const b = tokenize(after);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;

  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const prefix: DiffToken[] = a.slice(0, start).map((text) => ({ text, type: "same" }));
  const suffix: DiffToken[] = a.slice(endA).map((text) => ({ text, type: "same" }));
  const middle = lcsDiff(a.slice(start, endA), b.slice(start, endB));

  return [...prefix, ...middle, ...suffix];
}
