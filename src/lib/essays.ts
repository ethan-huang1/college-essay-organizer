import { and, desc, eq, inArray } from "drizzle-orm";

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

function normalizeFamilies(input: { primaryFamilyId?: string | null; secondaryFamilyIds?: string[] }) {
  const primaryFamilyId = input.primaryFamilyId || null;
  const secondaryFamilyIds = [...new Set(input.secondaryFamilyIds ?? [])]
    .filter((familyId) => familyId && familyId !== primaryFamilyId);
  return { primaryFamilyId, secondaryFamilyIds };
}

function validateFamilies(db: AppDatabase, workspaceId: string, primaryFamilyId: string | null, secondaryFamilyIds: string[]) {
  const familyIds = [primaryFamilyId, ...secondaryFamilyIds].filter((id): id is string => Boolean(id));
  if (familyIds.length === 0) return;
  const valid = db.select({ id: promptFamilies.id })
    .from(promptFamilies)
    .where(and(eq(promptFamilies.workspaceId, workspaceId), inArray(promptFamilies.id, familyIds)))
    .all();
  if (valid.length !== familyIds.length) throw new Error("Every selected family must belong to the active workspace.");
}

function replaceFamilyAssignments(
  db: Pick<AppDatabase, "delete" | "insert">,
  workspaceId: string,
  essayId: string,
  primaryFamilyId: string | null,
  secondaryFamilyIds: string[],
) {
  db.delete(essayFamilyLinks).where(eq(essayFamilyLinks.essayId, essayId)).run();
  const assignments = [
    ...(primaryFamilyId ? [{ familyId: primaryFamilyId, isPrimary: true }] : []),
    ...secondaryFamilyIds.map((familyId) => ({ familyId, isPrimary: false })),
  ];
  if (assignments.length > 0) {
    db.insert(essayFamilyLinks).values(assignments.map(({ familyId, isPrimary }) => ({
      id: crypto.randomUUID(),
      workspaceId,
      essayId,
      familyId,
      isPrimary,
      source: "manual" as const,
    }))).run();
  }
}

function validateMetadata(db: AppDatabase, workspaceId: string, input: EssayMetadataInput) {
  const targetWordCount = input.targetWordCount ?? null;
  if (targetWordCount !== null && (!Number.isInteger(targetWordCount) || targetWordCount < 0)) {
    throw new Error("Target word count must be a nonnegative integer.");
  }
  if (input.notes && input.notes.trim().length > 2000) throw new Error("Notes must be 2,000 characters or fewer.");

  const schoolSpecificPhrases = [...new Set((input.schoolSpecificPhrases ?? []).map((phrase) => phrase.trim()).filter(Boolean))].slice(0, 20);
  const families = normalizeFamilies(input);
  validateFamilies(db, workspaceId, families.primaryFamilyId, families.secondaryFamilyIds);

  return {
    ...families,
    title: cleanTitle(input.title),
    targetWordCount,
    notes: input.notes?.trim() || null,
    schoolSpecificPhrases,
  };
}

export function createEssay(db: AppDatabase, workspaceId: string, input: EssayMetadataInput & { content?: string }) {
  const validated = validateMetadata(db, workspaceId, input);
  const content = cleanContent(input.content ?? "");
  const essayId = crypto.randomUUID();

  db.transaction((tx) => {
    tx.insert(essays).values({
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
    }).run();
    tx.insert(essayVersions).values({
      id: crypto.randomUUID(),
      workspaceId,
      essayId,
      versionNumber: 1,
      content,
      wordCount: wordCount(content),
      reason: "Initial version",
    }).run();
    replaceFamilyAssignments(tx, workspaceId, essayId, validated.primaryFamilyId, validated.secondaryFamilyIds);
  });

  return essayId;
}

export function updateEssayMetadata(db: AppDatabase, workspaceId: string, essayId: string, input: EssayMetadataInput) {
  const existing = db.select({ id: essays.id }).from(essays)
    .where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId)))
    .get();
  if (!existing) throw new Error("Essay not found in the active workspace.");
  const validated = validateMetadata(db, workspaceId, input);

  db.transaction((tx) => {
    tx.update(essays).set({
      title: validated.title,
      targetWordCount: validated.targetWordCount,
      status: input.status,
      designation: input.designation,
      notes: validated.notes,
      schoolSpecificPhrases: validated.schoolSpecificPhrases,
    }).where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId))).run();
    replaceFamilyAssignments(tx, workspaceId, essayId, validated.primaryFamilyId, validated.secondaryFamilyIds);
  });
}

// Content changes are never made in place - every save creates a new
// immutable version and only then repoints the essay's currentContent.
export function saveEssayVersion(db: AppDatabase, workspaceId: string, essayId: string, input: { content: string; reason?: string }) {
  const existing = db.select({ id: essays.id }).from(essays)
    .where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId)))
    .get();
  if (!existing) throw new Error("Essay not found in the active workspace.");
  const content = cleanContent(input.content);
  const reason = input.reason?.trim() || null;

  db.transaction((tx) => {
    const last = tx.select({ versionNumber: essayVersions.versionNumber }).from(essayVersions)
      .where(eq(essayVersions.essayId, essayId))
      .orderBy(desc(essayVersions.versionNumber))
      .limit(1)
      .get();
    const nextVersion = (last?.versionNumber ?? 0) + 1;
    tx.insert(essayVersions).values({
      id: crypto.randomUUID(),
      workspaceId,
      essayId,
      versionNumber: nextVersion,
      content,
      wordCount: wordCount(content),
      reason,
    }).run();
    tx.update(essays).set({ currentContent: content, lastEditedAt: new Date() })
      .where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId))).run();
  });
}

// Restoring never deletes or rewrites history - it saves the old version's
// content as a brand new version at the top of the stack.
export function restoreEssayVersion(db: AppDatabase, workspaceId: string, essayId: string, versionId: string) {
  const version = db.select().from(essayVersions)
    .where(and(eq(essayVersions.id, versionId), eq(essayVersions.essayId, essayId), eq(essayVersions.workspaceId, workspaceId)))
    .get();
  if (!version) throw new Error("Version not found for this essay.");
  saveEssayVersion(db, workspaceId, essayId, {
    content: version.content,
    reason: `Restored from version ${version.versionNumber}`,
  });
}

export function deleteEssay(db: AppDatabase, workspaceId: string, essayId: string) {
  const result = db.delete(essays)
    .where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId)))
    .run();
  if (result.changes !== 1) throw new Error("Essay not found in the active workspace.");
}
