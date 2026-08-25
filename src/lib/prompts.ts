import { and, eq, inArray, or } from "drizzle-orm";

import { canonicalSiblingIds } from "./canonical";
import type { AppDatabase } from "./db/client";
import { promptFamilies, promptFamilyLinks, prompts, schools } from "./db/schema";

export type PromptInput = {
  schoolId: string;
  title: string;
  promptText: string;
  minWordCount?: number | null;
  maxWordCount?: number | null;
  minCharCount?: number | null;
  maxCharCount?: number | null;
  requirement: "required" | "optional" | "conditional";
  conditionalNote?: string;
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

// Omitting secondaryFamilyIds is meaningfully different from passing []: the
// secondary-category picker was removed from the UI, so a prompt save carries
// no secondaries and must leave the importer's links alone rather than clear
// them. Passing [] still means "no secondaries".
function normalizeFamilies(input: PromptInput) {
  const primaryFamilyId = input.primaryFamilyId || null;
  const secondaryFamilyIds = input.secondaryFamilyIds
    ? [...new Set(input.secondaryFamilyIds)].filter((familyId) => familyId && familyId !== primaryFamilyId)
    : undefined;
  return { primaryFamilyId, secondaryFamilyIds };
}

async function validateInput(db: AppDatabase, workspaceId: string, input: PromptInput) {
  const school = await db.select({ id: schools.id })
    .from(schools)
    .where(and(eq(schools.id, input.schoolId), eq(schools.workspaceId, workspaceId)))
    .then((rows) => rows[0]);
  if (!school) throw new Error("School not found in the active workspace.");

  const minWordCount = input.minWordCount ?? null;
  const maxWordCount = input.maxWordCount ?? null;
  if (minWordCount !== null && (!Number.isInteger(minWordCount) || minWordCount < 0)) throw new Error("Minimum word count must be a nonnegative integer.");
  if (maxWordCount !== null && (!Number.isInteger(maxWordCount) || maxWordCount < 0)) throw new Error("Maximum word count must be a nonnegative integer.");
  if (minWordCount !== null && maxWordCount !== null && minWordCount > maxWordCount) throw new Error("Minimum word count cannot exceed maximum word count.");

  const minCharCount = input.minCharCount ?? null;
  const maxCharCount = input.maxCharCount ?? null;
  if (minCharCount !== null && (!Number.isInteger(minCharCount) || minCharCount < 0)) throw new Error("Minimum character count must be a nonnegative integer.");
  if (maxCharCount !== null && (!Number.isInteger(maxCharCount) || maxCharCount < 0)) throw new Error("Maximum character count must be a nonnegative integer.");
  if (minCharCount !== null && maxCharCount !== null && minCharCount > maxCharCount) throw new Error("Minimum character count cannot exceed maximum character count.");

  if (input.requirement === "conditional" && !input.conditionalNote?.trim()) throw new Error("Conditional prompts need a note explaining when they apply.");
  if (input.deadline && Number.isNaN(input.deadline.getTime())) throw new Error("Deadline must be a valid date.");
  if (input.notes && input.notes.trim().length > 2000) throw new Error("Notes must be 2,000 characters or fewer.");

  const families = normalizeFamilies(input);
  const familyIds = [families.primaryFamilyId, ...(families.secondaryFamilyIds ?? [])].filter((id): id is string => Boolean(id));
  if (familyIds.length > 0) {
    const validFamilies = await db.select({ id: promptFamilies.id })
      .from(promptFamilies)
      .where(and(eq(promptFamilies.workspaceId, workspaceId), inArray(promptFamilies.id, familyIds)));
    if (validFamilies.length !== familyIds.length) throw new Error("Every selected family must belong to the active workspace.");
  }

  return {
    ...families,
    title: cleanText(input.title, "Prompt title", 2, 160, true),
    promptText: cleanText(input.promptText, "Prompt text", 10, 5000),
    minWordCount,
    maxWordCount,
    minCharCount,
    maxCharCount,
    conditionalNote: input.requirement === "conditional" ? (input.conditionalNote?.trim() || null) : null,
    notes: input.notes?.trim() || null,
  };
}

async function replaceFamilyAssignments(
  db: Pick<AppDatabase, "delete" | "insert">,
  workspaceId: string,
  promptId: string,
  primaryFamilyId: string | null,
  secondaryFamilyIds: string[] | undefined,
) {
  // With secondaries omitted only the primary is replaced. A secondary row for
  // the incoming primary still has to go, or prompt_family_pair_unique rejects
  // the insert below.
  await db.delete(promptFamilyLinks).where(
    secondaryFamilyIds
      ? eq(promptFamilyLinks.promptId, promptId)
      : and(
          eq(promptFamilyLinks.promptId, promptId),
          primaryFamilyId
            ? or(eq(promptFamilyLinks.isPrimary, true), eq(promptFamilyLinks.familyId, primaryFamilyId))
            : eq(promptFamilyLinks.isPrimary, true),
        ),
  );
  const assignments = [
    ...(primaryFamilyId ? [{ familyId: primaryFamilyId, isPrimary: true }] : []),
    ...(secondaryFamilyIds ?? []).map((familyId) => ({ familyId, isPrimary: false })),
  ];
  if (assignments.length > 0) {
    await db.insert(promptFamilyLinks).values(assignments.map(({ familyId, isPrimary }) => ({
      id: crypto.randomUUID(),
      workspaceId,
      promptId,
      familyId,
      isPrimary,
      source: "manual" as const,
    })));
  }
}

export async function createPrompt(db: AppDatabase, workspaceId: string, input: PromptInput) {
  const validated = await validateInput(db, workspaceId, input);
  const promptId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(prompts).values({
      id: promptId,
      workspaceId,
      schoolId: input.schoolId,
      title: validated.title,
      promptText: validated.promptText,
      minWordCount: validated.minWordCount,
      maxWordCount: validated.maxWordCount,
      minCharCount: validated.minCharCount,
      maxCharCount: validated.maxCharCount,
      requirement: input.requirement,
      conditionalNote: validated.conditionalNote,
      status: input.status,
      deadline: input.deadline ?? null,
      notes: validated.notes,
      classificationSource: "manual",
      classificationConfidence: 0,
    });
    await replaceFamilyAssignments(tx, workspaceId, promptId, validated.primaryFamilyId, validated.secondaryFamilyIds);
  });
  return promptId;
}

export async function updatePrompt(db: AppDatabase, workspaceId: string, promptId: string, input: PromptInput) {
  const existing = await db.select({ id: prompts.id }).from(prompts)
    .where(and(eq(prompts.id, promptId), eq(prompts.workspaceId, workspaceId)))
    .then((rows) => rows[0]);
  if (!existing) throw new Error("Prompt not found in the active workspace.");
  const validated = await validateInput(db, workspaceId, input);
  // Status is response state rather than content, so it has to move with the
  // question the way setPromptStatus does: the edit form carries a Status
  // select, and without this a student marking a shared prompt complete at one
  // campus leaves its siblings "not started" and the aggregate count wrong.
  // The rest of the edit stays local to the row it was made on.
  const siblingIds = await canonicalSiblingIds(db, workspaceId, promptId);

  await db.transaction(async (tx) => {
    await tx.update(prompts).set({
      schoolId: input.schoolId,
      title: validated.title,
      promptText: validated.promptText,
      minWordCount: validated.minWordCount,
      maxWordCount: validated.maxWordCount,
      minCharCount: validated.minCharCount,
      maxCharCount: validated.maxCharCount,
      requirement: input.requirement,
      conditionalNote: validated.conditionalNote,
      status: input.status,
      deadline: input.deadline ?? null,
      notes: validated.notes,
      classificationSource: "manual",
      classificationConfidence: 0,
      updatedAt: new Date(),
    }).where(and(eq(prompts.id, promptId), eq(prompts.workspaceId, workspaceId)));
    if (siblingIds.length > 1) {
      await tx.update(prompts)
        .set({ status: input.status, updatedAt: new Date() })
        .where(and(inArray(prompts.id, siblingIds), eq(prompts.workspaceId, workspaceId)));
    }
    await replaceFamilyAssignments(tx, workspaceId, promptId, validated.primaryFamilyId, validated.secondaryFamilyIds);
  });
}

// Status is the one prompt field a student flips constantly while working, so
// it gets its own narrow update: unlike updatePrompt it deliberately leaves
// classification (and its manual-override flag) untouched.
export async function setPromptStatus(db: AppDatabase, workspaceId: string, promptId: string, status: PromptInput["status"]) {
  // Fans out across canonical siblings for the same reason assignment does: one
  // shared question is one piece of work, so marking it complete at one school
  // cannot leave the others reading "not started".
  const promptIds = await canonicalSiblingIds(db, workspaceId, promptId);
  const updated = await db.update(prompts)
    .set({ status, updatedAt: new Date() })
    .where(and(inArray(prompts.id, promptIds), eq(prompts.workspaceId, workspaceId)))
    .returning({ id: prompts.id });
  if (updated.length === 0) throw new Error("Prompt not found in the active workspace.");
}

export async function deletePrompt(db: AppDatabase, workspaceId: string, promptId: string) {
  const removed = await db.delete(prompts)
    .where(and(eq(prompts.id, promptId), eq(prompts.workspaceId, workspaceId)))
    .returning({ id: prompts.id });
  if (removed.length !== 1) throw new Error("Prompt not found in the active workspace.");
}
