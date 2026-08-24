import { and, eq, inArray } from "drizzle-orm";

import type { AppDatabase } from "./db/client";
import { promptFamilies, promptFamilyLinks, prompts, schools } from "./db/schema";

export type PromptInput = {
  schoolId: string;
  title: string;
  promptText: string;
  minWordCount?: number | null;
  maxWordCount?: number | null;
  requirement: "required" | "optional";
  status: "not-started" | "in-progress" | "complete" | "submitted";
  deadline?: Date | null;
  notes?: string;
  primaryFamilyId?: string | null;
  secondaryFamilyIds?: string[];
};

function cleanText(value: string, field: string, min: number, max: number, collapseWhitespace = false) {
  const trimmed = value.trim();
  const cleaned = collapseWhitespace ? trimmed.replace(/\s+/g, " ") : trimmed;
  if (cleaned.length < min || cleaned.length > max) throw new Error(`${field} must be between ${min} and ${max} characters.`);
  return cleaned;
}

function normalizeFamilies(input: PromptInput) {
  const primaryFamilyId = input.primaryFamilyId || null;
  const secondaryFamilyIds = [...new Set(input.secondaryFamilyIds ?? [])]
    .filter((familyId) => familyId && familyId !== primaryFamilyId);
  return { primaryFamilyId, secondaryFamilyIds };
}

function validateInput(db: AppDatabase, workspaceId: string, input: PromptInput) {
  const school = db.select({ id: schools.id })
    .from(schools)
    .where(and(eq(schools.id, input.schoolId), eq(schools.workspaceId, workspaceId)))
    .get();
  if (!school) throw new Error("School not found in the active workspace.");

  const minWordCount = input.minWordCount ?? null;
  const maxWordCount = input.maxWordCount ?? null;
  if (minWordCount !== null && (!Number.isInteger(minWordCount) || minWordCount < 0)) throw new Error("Minimum word count must be a nonnegative integer.");
  if (maxWordCount !== null && (!Number.isInteger(maxWordCount) || maxWordCount < 0)) throw new Error("Maximum word count must be a nonnegative integer.");
  if (minWordCount !== null && maxWordCount !== null && minWordCount > maxWordCount) throw new Error("Minimum word count cannot exceed maximum word count.");
  if (input.deadline && Number.isNaN(input.deadline.getTime())) throw new Error("Deadline must be a valid date.");
  if (input.notes && input.notes.trim().length > 2000) throw new Error("Notes must be 2,000 characters or fewer.");

  const families = normalizeFamilies(input);
  const familyIds = [families.primaryFamilyId, ...families.secondaryFamilyIds].filter((id): id is string => Boolean(id));
  if (familyIds.length > 0) {
    const validFamilies = db.select({ id: promptFamilies.id })
      .from(promptFamilies)
      .where(and(eq(promptFamilies.workspaceId, workspaceId), inArray(promptFamilies.id, familyIds)))
      .all();
    if (validFamilies.length !== familyIds.length) throw new Error("Every selected family must belong to the active workspace.");
  }

  return {
    ...families,
    title: cleanText(input.title, "Prompt title", 2, 160, true),
    promptText: cleanText(input.promptText, "Prompt text", 10, 5000),
    minWordCount,
    maxWordCount,
    notes: input.notes?.trim() || null,
  };
}

function replaceFamilyAssignments(
  db: Pick<AppDatabase, "delete" | "insert">,
  workspaceId: string,
  promptId: string,
  primaryFamilyId: string | null,
  secondaryFamilyIds: string[],
) {
  db.delete(promptFamilyLinks).where(eq(promptFamilyLinks.promptId, promptId)).run();
  const assignments = [
    ...(primaryFamilyId ? [{ familyId: primaryFamilyId, isPrimary: true }] : []),
    ...secondaryFamilyIds.map((familyId) => ({ familyId, isPrimary: false })),
  ];
  if (assignments.length > 0) {
    db.insert(promptFamilyLinks).values(assignments.map(({ familyId, isPrimary }) => ({
      id: crypto.randomUUID(),
      workspaceId,
      promptId,
      familyId,
      isPrimary,
      source: "manual" as const,
    }))).run();
  }
}

export function createPrompt(db: AppDatabase, workspaceId: string, input: PromptInput) {
  const validated = validateInput(db, workspaceId, input);
  const promptId = crypto.randomUUID();
  db.transaction((tx) => {
    tx.insert(prompts).values({
      id: promptId,
      workspaceId,
      schoolId: input.schoolId,
      title: validated.title,
      promptText: validated.promptText,
      minWordCount: validated.minWordCount,
      maxWordCount: validated.maxWordCount,
      requirement: input.requirement,
      status: input.status,
      deadline: input.deadline ?? null,
      notes: validated.notes,
      classificationSource: "manual",
      classificationConfidence: 0,
    }).run();
    replaceFamilyAssignments(tx, workspaceId, promptId, validated.primaryFamilyId, validated.secondaryFamilyIds);
  });
  return promptId;
}

export function updatePrompt(db: AppDatabase, workspaceId: string, promptId: string, input: PromptInput) {
  const existing = db.select({ id: prompts.id }).from(prompts)
    .where(and(eq(prompts.id, promptId), eq(prompts.workspaceId, workspaceId)))
    .get();
  if (!existing) throw new Error("Prompt not found in the active workspace.");
  const validated = validateInput(db, workspaceId, input);

  db.transaction((tx) => {
    tx.update(prompts).set({
      schoolId: input.schoolId,
      title: validated.title,
      promptText: validated.promptText,
      minWordCount: validated.minWordCount,
      maxWordCount: validated.maxWordCount,
      requirement: input.requirement,
      status: input.status,
      deadline: input.deadline ?? null,
      notes: validated.notes,
      classificationSource: "manual",
      classificationConfidence: 0,
      updatedAt: new Date(),
    }).where(and(eq(prompts.id, promptId), eq(prompts.workspaceId, workspaceId))).run();
    replaceFamilyAssignments(tx, workspaceId, promptId, validated.primaryFamilyId, validated.secondaryFamilyIds);
  });
}

export function deletePrompt(db: AppDatabase, workspaceId: string, promptId: string) {
  const result = db.delete(prompts)
    .where(and(eq(prompts.id, promptId), eq(prompts.workspaceId, workspaceId)))
    .run();
  if (result.changes !== 1) throw new Error("Prompt not found in the active workspace.");
}
