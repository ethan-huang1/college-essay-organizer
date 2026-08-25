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
