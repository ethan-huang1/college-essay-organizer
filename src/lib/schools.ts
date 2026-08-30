import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "./db/client";
import { schools } from "./db/schema";

export type CatalogueStatus = NonNullable<typeof schools.$inferSelect.catalogueStatus>;

export type SchoolCatalogueState =
  | "current"
  | "no-supplement"
  | "not-published"
  | "needs-review"
  | "previous-cycle-only"
  | "manual";

/**
 * Why a college looks the way it does, as one deterministic value.
 *
 * A college with no prompts is not a college with nothing to say: it may have
 * no supplement at all, may not have published this cycle's wording yet, or may
 * only ever have been entered by hand. Both inputs here are structured -
 * `catalogueStatus` written by the importer and each prompt's own
 * `verificationStatus` - so this never depends on reading `schools.notes`.
 */
export function schoolCatalogueState(
  catalogueStatus: CatalogueStatus | null,
  schoolPrompts: readonly { isCurrentCycle: boolean; verificationStatus: string }[],
): SchoolCatalogueState {
  if (schoolPrompts.length > 0) {
    // A flagged prompt outranks the rest: its wording changed under us, so
    // every count derived from it is suspect until someone looks.
    if (schoolPrompts.some((prompt) => prompt.verificationStatus === "needs-review")) return "needs-review";
    return schoolPrompts.some((prompt) => prompt.isCurrentCycle) ? "current" : "previous-cycle-only";
  }
  switch (catalogueStatus) {
    case "no-supplement":
      return "no-supplement";
    case "not-published":
      return "not-published";
    case "previous-cycle":
      return "previous-cycle-only";
    // "current" with zero prompts means the catalogue said there were prompts
    // and none survived import - treat it as unverified rather than done.
    default:
      return "manual";
  }
}

/**
 * What a college's card should actually say about its workload.
 *
 * "No required essays on file" was being shown for five unrelated situations,
 * which made a school whose supplement is genuinely optional indistinguishable
 * from one whose prompts simply failed to import. Two of those situations are
 * real workload the count deliberately excludes:
 *
 * - **Conditional and program-specific prompts.** `summarizeWorkload` leaves
 *   these out of `requiredTotal` until the student says which programs they are
 *   applying to, which is correct - guessing would inflate the count. But
 *   Amherst has three conditional prompts and Georgetown seven
 *   program-specific ones, and telling a student they have nothing to write is
 *   false. They have a question to answer first.
 * - **Optional-only prompts.** Bowdoin, Trinity, Colorado College and NYU each
 *   publish prompts that are genuinely optional. "None required" is true; "none
 *   on file" is not.
 *
 * Verification states are kept apart from all of that, because "we confirmed
 * there is no supplement" and "we could not read the prompts" are opposite
 * facts. Columbia is the case that matters here: it publishes its questions
 * only inside the Common App, so nothing could be imported and its record
 * carries no prompts at all. That is unverified data, never zero work.
 */
export type SchoolAvailability =
  | { kind: "required"; count: number }
  | { kind: "optional-only"; count: number }
  | { kind: "awaiting-programs"; count: number }
  | { kind: "no-supplement" }
  | { kind: "not-published" }
  | { kind: "previous-cycle" }
  | { kind: "unverified" };

export type AvailabilityInput = {
  catalogueState: SchoolCatalogueState;
  /** Prompt rows on file for this college, of any kind. */
  promptCount: number;
  /** From summarizeWorkload, unchanged. */
  requiredTotal: number;
  optionalExtra: number;
  programSpecific: number;
  unresolvedConditional: number;
};

export function schoolAvailability(input: AvailabilityInput): SchoolAvailability {
  // Real, countable work always wins: a college with required essays is
  // described by that, whatever else is also true of its catalogue entry.
  if (input.requiredTotal > 0) return { kind: "required", count: input.requiredTotal };

  // A verified absence of a supplement is a finished state and the only case
  // that may say so.
  if (input.catalogueState === "no-supplement") return { kind: "no-supplement" };

  // Work that exists but is gated on a question only the student can answer.
  const gated = input.unresolvedConditional + input.programSpecific;
  if (gated > 0) return { kind: "awaiting-programs", count: gated };

  if (input.optionalExtra > 0) return { kind: "optional-only", count: input.optionalExtra };

  // No countable work left, so the reason has to come from the catalogue.
  switch (input.catalogueState) {
    case "not-published":
      return { kind: "not-published" };
    case "previous-cycle-only":
      return { kind: "previous-cycle" };
    case "needs-review":
    case "manual":
      return { kind: "unverified" };
    default:
      // catalogueState "current" with nothing countable means the catalogue
      // claimed prompts and none survived import. That is a failed import, not
      // a school with no work.
      return input.promptCount > 0 ? { kind: "unverified" } : { kind: "unverified" };
  }
}

/** One sentence per state, worded for a student rather than for the importer. */
export function availabilitySentence(availability: SchoolAvailability): string {
  switch (availability.kind) {
    case "required":
      return `${availability.count} required ${availability.count === 1 ? "essay" : "essays"}`;
    case "optional-only":
      return `${availability.count} optional, none required`;
    case "awaiting-programs":
      return `${availability.count} depend on your programs`;
    case "no-supplement":
      return "No supplemental essay required";
    case "not-published":
      return "Prompts not yet published";
    case "previous-cycle":
      return "Current prompts not yet verified";
    case "unverified":
      return "Prompt information not yet verified";
  }
}

function cleanName(name: string) {
  const value = name.trim().replace(/\s+/g, " ");
  if (value.length < 2 || value.length > 120) throw new Error("School name must be between 2 and 120 characters.");
  return value;
}

export async function createSchool(db: AppDatabase, workspaceId: string, input: { name: string; notes?: string }) {
  const id = crypto.randomUUID();
  await db.insert(schools).values({
    id,
    workspaceId,
    name: cleanName(input.name),
    notes: input.notes?.trim() || null,
  });
  return db.select().from(schools).where(and(eq(schools.id, id), eq(schools.workspaceId, workspaceId))).then((rows) => rows[0]);
}

export async function updateSchool(db: AppDatabase, workspaceId: string, schoolId: string, input: { name: string; notes?: string }) {
  const updated = await db.update(schools)
    .set({ name: cleanName(input.name), notes: input.notes?.trim() || null, updatedAt: new Date() })
    .where(and(eq(schools.id, schoolId), eq(schools.workspaceId, workspaceId)))
    .returning({ id: schools.id });
  if (updated.length !== 1) throw new Error("School not found in the active workspace.");
}

export async function deleteSchool(db: AppDatabase, workspaceId: string, schoolId: string) {
  const removed = await db.delete(schools)
    .where(and(eq(schools.id, schoolId), eq(schools.workspaceId, workspaceId)))
    .returning({ id: schools.id });
  if (removed.length !== 1) throw new Error("School not found in the active workspace.");
}

/**
 * Records which programs a student is applying to at one school.
 *
 * An empty array is a real answer ("none of them") and is stored as such: it is
 * what turns program-gated prompts from unresolved into settled at zero, which
 * `null` deliberately does not do.
 */
export async function setSchoolPrograms(
  db: AppDatabase,
  workspaceId: string,
  schoolId: string,
  programKeys: readonly string[],
) {
  const cleaned = [...new Set(programKeys.map((key) => key.trim()).filter(Boolean))].sort();
  const updated = await db.update(schools)
    .set({ selectedPrograms: cleaned, updatedAt: new Date() })
    .where(and(eq(schools.id, schoolId), eq(schools.workspaceId, workspaceId)))
    .returning({ id: schools.id });
  if (updated.length !== 1) throw new Error("School not found in the active workspace.");
}
