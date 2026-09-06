import type { PromptGroup, RawPromptRecord, SchoolSourceRecord } from "./types";

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

  errors.push(...validatePromptGroups(record));

  return errors;
}

// A group that asks for more prompts than it contains, or a prompt pointing at
// a group nobody declared, would make the required count meaningless - so both
// are load-bearing errors rather than warnings.
function validatePromptGroups(record: SchoolSourceRecord): string[] {
  const errors: string[] = [];
  const groups = record.promptGroups ?? [];
  const seenKeys = new Set<string>();

  for (const group of groups) {
    if (!group.key?.trim()) {
      errors.push("Every promptGroups entry requires a key.");
      continue;
    }
    if (seenKeys.has(group.key)) errors.push(`Duplicate promptGroups key: "${group.key}".`);
    seenKeys.add(group.key);
    if (!group.label?.trim()) errors.push(`Group "${group.key}" requires a label (it is shown to the user).`);

    const size = record.prompts.filter((prompt) => prompt.groupKey === group.key).length;
    if (size === 0) errors.push(`Group "${group.key}" is declared but no prompt carries that groupKey.`);
    if (!Number.isInteger(group.requiredCount) || group.requiredCount < 1) {
      errors.push(`Group "${group.key}" requires a requiredCount of at least 1.`);
    } else if (group.requiredCount > size && size > 0) {
      errors.push(`Group "${group.key}" asks for ${group.requiredCount} of only ${size} prompts.`);
    }
  }

  for (const prompt of record.prompts) {
    if (prompt.groupKey && !seenKeys.has(prompt.groupKey)) {
      errors.push(`[${prompt.externalRef || prompt.title}] references undeclared group "${prompt.groupKey}".`);
    }
  }

  return errors;
}

function groupFor(record: SchoolSourceRecord, prompt: RawPromptRecord): PromptGroup | null {
  return prompt.groupKey ? record.promptGroups?.find((group) => group.key === prompt.groupKey) ?? null : null;
}

/**
 * Cross-record check: several schools sharing one application must agree about
 * the question they share.
 *
 * validateRecord only ever sees a single record, but a shared application's
 * prompts are spread across one record per campus. If two of them disagree
 * about wording, limits, group membership or required count, then any view that
 * collapses them into one row has to pick a winner - and the answer would
 * depend on registry order. Failing the build is the only honest outcome.
 */
export function validateCanonicalAgreement(sources: readonly SchoolSourceRecord[]): string[] {
  const errors: string[] = [];
  const first = new Map<string, { schoolName: string; prompt: RawPromptRecord; group: PromptGroup | null }>();

  for (const record of sources) {
    if (!record.sharedApplicationKey) continue;
    for (const prompt of record.prompts) {
      const key = `${record.sharedApplicationKey}:${prompt.externalRef}`;
      const group = groupFor(record, prompt);
      const seen = first.get(key);
      if (!seen) {
        first.set(key, { schoolName: record.schoolName, prompt, group });
        continue;
      }

      const differences: string[] = [];
      const compare = (field: string, a: unknown, b: unknown) => {
        if (a !== b) differences.push(`${field} (${JSON.stringify(a)} vs ${JSON.stringify(b)})`);
      };
      compare("promptText", normalizeWhitespace(seen.prompt.promptText), normalizeWhitespace(prompt.promptText));
      compare("title", seen.prompt.title, prompt.title);
      compare("minWordCount", seen.prompt.minWordCount ?? null, prompt.minWordCount ?? null);
      compare("maxWordCount", seen.prompt.maxWordCount ?? null, prompt.maxWordCount ?? null);
      compare("minCharCount", seen.prompt.minCharCount ?? null, prompt.minCharCount ?? null);
      compare("maxCharCount", seen.prompt.maxCharCount ?? null, prompt.maxCharCount ?? null);
      compare("requirement", seen.prompt.requirement, prompt.requirement);
      compare("groupKey", seen.prompt.groupKey ?? null, prompt.groupKey ?? null);
      compare("groupLabel", seen.group?.label ?? null, group?.label ?? null);
      compare("groupRequiredCount", seen.group?.requiredCount ?? null, group?.requiredCount ?? null);

      if (differences.length > 0) {
        errors.push(
          `Shared prompt "${key}" disagrees between "${seen.schoolName}" and "${record.schoolName}": ${differences.join(", ")}.`,
        );
      }
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
//
// title, requirement, conditionalNote, groupKey and programKey are compared
// too: a prompt flipping required -> conditional used to report "unchanged"
// and never be updated, which meant a re-import could not deliver newly
// encoded group or program metadata to a workspace that already had the row.
export function promptContentChanged(
  previous: {
    title: string;
    promptText: string;
    minWordCount: number | null;
    maxWordCount: number | null;
    minCharCount: number | null;
    maxCharCount: number | null;
    requirement: string;
    conditionalNote: string | null;
    groupKey?: string | null;
    groupRequiredCount?: number | null;
    programKey?: string | null;
    supportingMaterial?: string | null;
  },
  next: RawPromptRecord,
  nextGroupRequiredCount: number | null = null,
): boolean {
  return (
    normalizeWhitespace(previous.promptText) !== normalizeWhitespace(next.promptText) ||
    normalizeWhitespace(previous.title) !== normalizeWhitespace(next.title) ||
    (previous.minWordCount ?? null) !== (next.minWordCount ?? null) ||
    (previous.maxWordCount ?? null) !== (next.maxWordCount ?? null) ||
    (previous.minCharCount ?? null) !== (next.minCharCount ?? null) ||
    (previous.maxCharCount ?? null) !== (next.maxCharCount ?? null) ||
    previous.requirement !== next.requirement ||
    // Reclassifying a row as supporting material (or back) has to reach an
    // existing workspace: it decides whether the row is scored, counted and
    // shown as an essay at all, so a re-import that skipped it would leave a
    // graded-paper requirement sitting in someone's essay list.
    (previous.supportingMaterial ?? null) !== (next.supportingMaterial ?? null) ||
    (previous.conditionalNote ?? null) !== (next.conditionalNote ?? null) ||
    (previous.groupKey ?? null) !== (next.groupKey ?? null) ||
    (previous.groupRequiredCount ?? null) !== nextGroupRequiredCount ||
    (previous.programKey ?? null) !== (next.programKey ?? null)
  );
}
