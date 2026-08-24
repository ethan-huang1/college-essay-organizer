import type { RawPromptRecord, SchoolSourceRecord } from "./types";

export function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

// Validates one school's source record against the pipeline's invariants.
// Used both at registry-load time (so a malformed data file fails loudly,
// not silently) and directly in tests. Returns every problem found rather
// than throwing on the first, so a bad data file's issues are all visible
// at once.
export function validateRecord(record: SchoolSourceRecord): string[] {
  const errors: string[] = [];

  if (!record.schoolName.trim()) errors.push("schoolName is required.");
  if (!record.cycleLabel.trim()) errors.push("cycleLabel is required.");
  if (!record.note.trim()) errors.push("note is required (shown to the user - explain the verification status).");

  const requiresPrompts = record.verificationStatus === "officially-verified"
    || record.verificationStatus === "common-app-verified"
    || record.verificationStatus === "previous-cycle";
  const forbidsPrompts = record.verificationStatus === "no-supplement-confirmed" || record.verificationStatus === "needs-review";

  // Every outcome - including needs-review - must cite what was actually
  // checked, even if it confirmed nothing. "I looked and found nothing
  // worth citing" is not a valid coverage record.
  if (!record.sourceUrl) {
    errors.push(`${record.verificationStatus} requires a sourceUrl (cite what was checked, even for needs-review).`);
  }
  if (requiresPrompts && record.prompts.length === 0) {
    errors.push(`${record.verificationStatus} with zero prompts is contradictory - it must carry the prompt text it claims to have confirmed.`);
  }
  if (forbidsPrompts && record.prompts.length > 0) {
    errors.push(`${record.verificationStatus} must not carry prompts - there is nothing confirmed to import.`);
  }
  if (record.verificationStatus === "previous-cycle" && record.cycleLabel === "2026–27") {
    errors.push("previous-cycle records must set cycleLabel to the actual (older) cycle they represent, not the current one - e.g. \"2025–26\".");
  }

  const seenRefs = new Set<string>();
  for (const prompt of record.prompts) {
    errors.push(...validatePromptRecord(prompt).map((error) => `[${prompt.externalRef || prompt.title || "untitled"}] ${error}`));
    if (prompt.externalRef) {
      if (seenRefs.has(prompt.externalRef)) errors.push(`Duplicate externalRef within this school: "${prompt.externalRef}".`);
      seenRefs.add(prompt.externalRef);
    }
  }

  return errors;
}

export function validatePromptRecord(prompt: RawPromptRecord): string[] {
  const errors: string[] = [];
  if (!prompt.externalRef?.trim()) errors.push("externalRef is required.");
  if (!prompt.title?.trim()) errors.push("title is required.");
  if (!prompt.promptText?.trim()) errors.push("promptText is required.");
  if (prompt.minWordCount != null && prompt.maxWordCount != null && prompt.minWordCount > prompt.maxWordCount) {
    errors.push("minWordCount exceeds maxWordCount.");
  }
  if (prompt.minCharCount != null && prompt.maxCharCount != null && prompt.minCharCount > prompt.maxCharCount) {
    errors.push("minCharCount exceeds maxCharCount.");
  }
  if (prompt.requirement === "conditional" && !prompt.conditionalNote?.trim()) {
    errors.push("conditional prompts require a conditionalNote explaining when they apply.");
  }
  return errors;
}

// True when two versions of "the same" prompt (matched by externalRef)
// actually differ in anything the app tracks - the signal the import
// pipeline uses to flag needs-review instead of silently overwriting.
export function promptContentChanged(
  previous: { promptText: string; minWordCount: number | null; maxWordCount: number | null; minCharCount: number | null; maxCharCount: number | null },
  next: RawPromptRecord,
): boolean {
  return (
    normalizeWhitespace(previous.promptText) !== normalizeWhitespace(next.promptText) ||
    (previous.minWordCount ?? null) !== (next.minWordCount ?? null) ||
    (previous.maxWordCount ?? null) !== (next.maxWordCount ?? null) ||
    (previous.minCharCount ?? null) !== (next.minCharCount ?? null) ||
    (previous.maxCharCount ?? null) !== (next.maxCharCount ?? null)
  );
}
