/**
 * Label formatting, at the presentation layer only.
 *
 * The data stays as it is written. Prompt titles, category names and the
 * catalogue's summaries are sentence case on purpose ("Diverse perspectives",
 * "Growing up and contributing to Brown") and are never re-cased here; the
 * official prompt wording is never touched at all.
 *
 * What is fixed here is everything that reads as a *sentence* but is stored as
 * a fragment - the matcher composes "may not address Why Major themes" into a
 * longer explanation, so it is written lowercase - and the bare status
 * vocabularies, which are stored as keys and were being printed raw.
 */

/**
 * Capitalises the first letter and changes nothing else, so "Why Major",
 * "PLME" and every other proper noun or acronym inside the phrase survive.
 */
export function sentenceCase(value: string): string {
  const text = value.trimStart();
  if (!text) return "";
  // Leading punctuation is skipped so a quoted phrase capitalises the word
  // inside the quotes. A leading digit is not: "248 words → cut to 150" starts
  // with a number and capitalising the word after it would be wrong.
  const characters = [...text];
  let index = 0;
  while (index < characters.length && /[\p{P}\p{S}\s]/u.test(characters[index])) index += 1;
  const first = characters[index];
  if (!first || first.toLowerCase() === first.toUpperCase()) return text;
  return characters.slice(0, index).join("") + first.toUpperCase() + characters.slice(index + 1).join("");
}

/** Joins phrases into one line, each one reading as its own sentence. */
export function sentenceList(values: readonly string[], separator = " · "): string {
  return values.map(sentenceCase).join(separator);
}

/**
 * A stored status key as a label: "not-started" -> "Not started",
 * "draft" -> "Draft". Sentence case, not title case - these are labels, not
 * headings, and the app's voice is sentence case throughout.
 */
export function statusLabel(value: string): string {
  return sentenceCase(value.replaceAll("-", " "));
}
