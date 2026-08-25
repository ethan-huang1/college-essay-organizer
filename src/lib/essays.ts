import { and, desc, eq, inArray, or } from "drizzle-orm";

import type { AppDatabase } from "./db/client";
import { essayFamilyLinks, essays, essayVersions, promptFamilies } from "./db/schema";

export type EssayStatus = "idea" | "outline" | "draft" | "revising" | "ready" | "submitted";
export type EssayDesignation = "canonical" | "school-adaptation";

export type EssayMetadataInput = {
  title: string;
  targetWordCount?: number | null;
  status: EssayStatus;
  designation: EssayDesignation;
  notes?: string;
  schoolSpecificPhrases?: string[];
  primaryFamilyId?: string | null;
  secondaryFamilyIds?: string[];
};

function cleanTitle(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 160) throw new Error("Essay title must be between 2 and 160 characters.");
  return trimmed;
}

function cleanContent(value: string) {
  if (value.length > 20000) throw new Error("Essay content must be 20,000 characters or fewer.");
  return value;
}

export function wordCount(content: string) {
  return content.trim() ? content.trim().split(/\s+/).length : 0;
}

// Omitting secondaryFamilyIds is meaningfully different from passing []: the
// secondary-category picker was removed from the UI, so a metadata save carries
// no secondaries and must leave the importer's links alone rather than clear
// them. Passing [] still means "no secondaries".
function normalizeFamilies(input: { primaryFamilyId?: string | null; secondaryFamilyIds?: string[] }) {
  const primaryFamilyId = input.primaryFamilyId || null;
  const secondaryFamilyIds = input.secondaryFamilyIds
    ? [...new Set(input.secondaryFamilyIds)].filter((familyId) => familyId && familyId !== primaryFamilyId)
    : undefined;
  return { primaryFamilyId, secondaryFamilyIds };
}

async function validateFamilies(db: AppDatabase, workspaceId: string, primaryFamilyId: string | null, secondaryFamilyIds: string[] = []) {
  const familyIds = [primaryFamilyId, ...secondaryFamilyIds].filter((id): id is string => Boolean(id));
  if (familyIds.length === 0) return;
  const valid = await db.select({ id: promptFamilies.id })
    .from(promptFamilies)
    .where(and(eq(promptFamilies.workspaceId, workspaceId), inArray(promptFamilies.id, familyIds)));
  if (valid.length !== familyIds.length) throw new Error("Every selected family must belong to the active workspace.");
}

async function replaceFamilyAssignments(
  db: Pick<AppDatabase, "delete" | "insert">,
  workspaceId: string,
  essayId: string,
  primaryFamilyId: string | null,
  secondaryFamilyIds: string[] | undefined,
) {
  // With secondaries omitted only the primary is replaced. A secondary row for
  // the incoming primary still has to go, or essay_family_pair_unique rejects
  // the insert below.
  await db.delete(essayFamilyLinks).where(
    secondaryFamilyIds
      ? eq(essayFamilyLinks.essayId, essayId)
      : and(
          eq(essayFamilyLinks.essayId, essayId),
          primaryFamilyId
            ? or(eq(essayFamilyLinks.isPrimary, true), eq(essayFamilyLinks.familyId, primaryFamilyId))
            : eq(essayFamilyLinks.isPrimary, true),
        ),
  );
  const assignments = [
    ...(primaryFamilyId ? [{ familyId: primaryFamilyId, isPrimary: true }] : []),
    ...(secondaryFamilyIds ?? []).map((familyId) => ({ familyId, isPrimary: false })),
  ];
  if (assignments.length > 0) {
    await db.insert(essayFamilyLinks).values(assignments.map(({ familyId, isPrimary }) => ({
      id: crypto.randomUUID(),
      workspaceId,
      essayId,
      familyId,
      isPrimary,
      source: "manual" as const,
    })));
  }
}

async function validateMetadata(db: AppDatabase, workspaceId: string, input: EssayMetadataInput) {
  const targetWordCount = input.targetWordCount ?? null;
  if (targetWordCount !== null && (!Number.isInteger(targetWordCount) || targetWordCount < 0)) {
    throw new Error("Target word count must be a nonnegative integer.");
  }
  if (input.notes && input.notes.trim().length > 2000) throw new Error("Notes must be 2,000 characters or fewer.");

  const schoolSpecificPhrases = [...new Set((input.schoolSpecificPhrases ?? []).map((phrase) => phrase.trim()).filter(Boolean))].slice(0, 20);
  const families = normalizeFamilies(input);
  await validateFamilies(db, workspaceId, families.primaryFamilyId, families.secondaryFamilyIds);

  return {
    ...families,
    title: cleanTitle(input.title),
    targetWordCount,
    notes: input.notes?.trim() || null,
    schoolSpecificPhrases,
  };
}

export async function createEssay(db: AppDatabase, workspaceId: string, input: EssayMetadataInput & { content?: string }) {
  const validated = await validateMetadata(db, workspaceId, input);
  const content = cleanContent(input.content ?? "");
  const essayId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(essays).values({
      id: essayId,
      workspaceId,
      title: validated.title,
      currentContent: content,
      targetWordCount: validated.targetWordCount,
      status: input.status,
      designation: input.designation,
      notes: validated.notes,
      schoolSpecificPhrases: validated.schoolSpecificPhrases,
      lastEditedAt: new Date(),
    });
    await tx.insert(essayVersions).values({
      id: crypto.randomUUID(),
      workspaceId,
      essayId,
      versionNumber: 1,
      content,
      wordCount: wordCount(content),
      reason: "Initial version",
    });
    await replaceFamilyAssignments(tx, workspaceId, essayId, validated.primaryFamilyId, validated.secondaryFamilyIds);
  });

  return essayId;
}

export async function updateEssayMetadata(db: AppDatabase, workspaceId: string, essayId: string, input: EssayMetadataInput) {
  const existing = await db.select({ id: essays.id }).from(essays)
    .where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId)))
    .then((rows) => rows[0]);
  if (!existing) throw new Error("Essay not found in the active workspace.");
  const validated = await validateMetadata(db, workspaceId, input);

  await db.transaction(async (tx) => {
    await tx.update(essays).set({
      title: validated.title,
      targetWordCount: validated.targetWordCount,
      status: input.status,
      designation: input.designation,
      notes: validated.notes,
      schoolSpecificPhrases: validated.schoolSpecificPhrases,
    }).where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId)));
    await replaceFamilyAssignments(tx, workspaceId, essayId, validated.primaryFamilyId, validated.secondaryFamilyIds);
  });
}

// Content changes are never made in place - every save creates a new
// immutable version and only then repoints the essay's currentContent.
export async function saveEssayVersion(db: AppDatabase, workspaceId: string, essayId: string, input: { content: string; reason?: string }) {
  const existing = await db.select({ id: essays.id }).from(essays)
    .where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId)))
    .then((rows) => rows[0]);
  if (!existing) throw new Error("Essay not found in the active workspace.");
  const content = cleanContent(input.content);
  const reason = input.reason?.trim() || null;

  await db.transaction(async (tx) => {
    const last = await tx.select({ versionNumber: essayVersions.versionNumber }).from(essayVersions)
      .where(eq(essayVersions.essayId, essayId))
      .orderBy(desc(essayVersions.versionNumber))
      .limit(1)
      .then((rows) => rows[0]);
    const nextVersion = (last?.versionNumber ?? 0) + 1;
    await tx.insert(essayVersions).values({
      id: crypto.randomUUID(),
      workspaceId,
      essayId,
      versionNumber: nextVersion,
      content,
      wordCount: wordCount(content),
      reason,
    });
    await tx.update(essays).set({ currentContent: content, lastEditedAt: new Date() })
      .where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId)));
  });
}

// Restoring never deletes or rewrites history - it saves the old version's
// content as a brand new version at the top of the stack.
export async function restoreEssayVersion(db: AppDatabase, workspaceId: string, essayId: string, versionId: string) {
  const version = await db.select().from(essayVersions)
    .where(and(eq(essayVersions.id, versionId), eq(essayVersions.essayId, essayId), eq(essayVersions.workspaceId, workspaceId)))
    .then((rows) => rows[0]);
  if (!version) throw new Error("Version not found for this essay.");
  await saveEssayVersion(db, workspaceId, essayId, {
    content: version.content,
    reason: `Restored from version ${version.versionNumber}`,
  });
}

export async function deleteEssay(db: AppDatabase, workspaceId: string, essayId: string) {
  const removed = await db.delete(essays)
    .where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId)))
    .returning({ id: essays.id });
  if (removed.length !== 1) throw new Error("Essay not found in the active workspace.");
}
