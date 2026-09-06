import { and, desc, eq, inArray, or } from "drizzle-orm";

import type { AppDatabase } from "./db/client";
import { essayFamilyLinks, essays, essayVersions, promptFamilies, prompts } from "./db/schema";

export type EssayStatus = "idea" | "outline" | "draft" | "revising" | "ready" | "submitted";
export type EssayDesignation = "canonical" | "school-adaptation";

/**
 * A client that can write, but cannot open a transaction of its own.
 *
 * Reusing an essay for another prompt has to create a document and attach it as
 * that prompt's answer in one atomic step, so those writes are available as
 * helpers taking an existing transaction. Omitting `transaction` from the type
 * is the point: nothing inside such a helper can start a nested transaction, so
 * none of this depends on savepoint behaviour in either driver.
 *
 * The narrower `Pick` precedent is already in this file (replaceFamilyAssignments)
 * and in canonical.ts.
 */
export type EssayWriter = Pick<AppDatabase, "select" | "insert" | "update" | "delete">;

export type EssayMetadataInput = {
  title: string;
  targetWordCount?: number | null;
  status: EssayStatus;
  designation: EssayDesignation;
  notes?: string;
  schoolSpecificPhrases?: string[];
  primaryFamilyId?: string | null;
  secondaryFamilyIds?: string[];
  /**
   * The prompt this essay was written for. One of the two forms, or neither.
   *
   * `originPromptId` for a prompt in the student's catalogue; the pasted pair
   * for anything else - a college not yet added, a scholarship, a class
   * assignment. Existing essays stay null, which is why every field is optional
   * and why matching treats an unknown origin as neutral rather than as a
   * mismatch.
   */
  originPromptId?: string | null;
  originPromptTitle?: string | null;
  originPromptText?: string | null;
  /**
   * The essay this one was copied from, when it was created by reusing another
   * essay for a different prompt. Two independent documents from then on: this
   * records where the text came from, nothing more. `on delete set null`, so
   * deleting either side leaves the other intact.
   */
  adaptedFromEssayId?: string | null;
};

/**
 * Normalises the origin pair.
 *
 * Selecting a catalogue prompt clears any pasted text, because keeping both
 * would leave two answers to one question and no rule for which wins. Pasted
 * text with no title is accepted - the text is the part that carries the
 * function - but a title alone is not, since a bare title cannot be classified.
 */
function normalizeOrigin(input: EssayMetadataInput) {
  const originPromptId = input.originPromptId?.trim() || null;
  if (originPromptId) return { originPromptId, originPromptTitle: null, originPromptText: null };
  const originPromptText = input.originPromptText?.trim() || null;
  const originPromptTitle = input.originPromptTitle?.trim() || null;
  if (!originPromptText) return { originPromptId: null, originPromptTitle: null, originPromptText: null };
  if (originPromptText.length > 4000) throw new Error("Original prompt text must be 4,000 characters or fewer.");
  if (originPromptTitle && originPromptTitle.length > 200) throw new Error("Original prompt title must be 200 characters or fewer.");
  return { originPromptId: null, originPromptTitle, originPromptText };
}

function cleanTitle(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 160) throw new Error("Essay title must be between 2 and 160 characters.");
  return trimmed;
}

export function cleanContent(value: string) {
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

async function validateFamilies(db: Pick<AppDatabase, "select">, workspaceId: string, primaryFamilyId: string | null, secondaryFamilyIds: string[] = []) {
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

async function validateMetadata(db: Pick<AppDatabase, "select">, workspaceId: string, input: EssayMetadataInput) {
  const targetWordCount = input.targetWordCount ?? null;
  if (targetWordCount !== null && (!Number.isInteger(targetWordCount) || targetWordCount < 0)) {
    throw new Error("Target word count must be a nonnegative integer.");
  }
  if (input.notes && input.notes.trim().length > 2000) throw new Error("Notes must be 2,000 characters or fewer.");

  const schoolSpecificPhrases = [...new Set((input.schoolSpecificPhrases ?? []).map((phrase) => phrase.trim()).filter(Boolean))].slice(0, 20);
  const families = normalizeFamilies(input);
  await validateFamilies(db, workspaceId, families.primaryFamilyId, families.secondaryFamilyIds);
  const origin = normalizeOrigin(input);
  if (origin.originPromptId) {
    // Scoped to the workspace, like every other id the forms accept: a prompt id
    // from another workspace would otherwise cross the isolation boundary and
    // silently supply an origin from someone else's college list.
    const prompt = await db.select({ id: prompts.id }).from(prompts)
      .where(and(eq(prompts.id, origin.originPromptId), eq(prompts.workspaceId, workspaceId)))
      .then((rows) => rows[0]);
    if (!prompt) throw new Error("The original prompt is not in this workspace.");
  }

  return {
    ...families,
    ...origin,
    title: cleanTitle(input.title),
    targetWordCount,
    notes: input.notes?.trim() || null,
    schoolSpecificPhrases,
  };
}

/**
 * Creating an essay, without opening a transaction.
 *
 * Split out so reuse can create a document and attach it to its prompt in one
 * atomic write (see reuse-essay.ts). Callers that only create an essay use
 * createEssay below, which is this in its own transaction.
 */
export async function insertEssay(
  tx: EssayWriter,
  workspaceId: string,
  input: EssayMetadataInput & { content?: string },
) {
  const validated = await validateMetadata(tx, workspaceId, input);
  const content = cleanContent(input.content ?? "");
  const essayId = crypto.randomUUID();

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
    originPromptId: validated.originPromptId,
    originPromptTitle: validated.originPromptTitle,
    originPromptText: validated.originPromptText,
    adaptedFromEssayId: input.adaptedFromEssayId ?? null,
    lastEditedAt: new Date(),
  });
  await tx.insert(essayVersions).values({
    id: crypto.randomUUID(),
    workspaceId,
    essayId,
    versionNumber: 1,
    content,
    wordCount: wordCount(content),
    reason: "First saved draft",
  });
  await replaceFamilyAssignments(tx, workspaceId, essayId, validated.primaryFamilyId, validated.secondaryFamilyIds);

  return essayId;
}

export async function createEssay(db: AppDatabase, workspaceId: string, input: EssayMetadataInput & { content?: string }) {
  return db.transaction((tx) => insertEssay(tx, workspaceId, input));
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
      originPromptId: validated.originPromptId,
      originPromptTitle: validated.originPromptTitle,
      originPromptText: validated.originPromptText,
    }).where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId)));
    await replaceFamilyAssignments(tx, workspaceId, essayId, validated.primaryFamilyId, validated.secondaryFamilyIds);
  });
}

export type DraftSaveResult =
  | { status: "saved"; savedAt: number }
  /** Someone else moved the document on: a restore, another tab, another device. */
  | { status: "conflict"; savedAt: number }
  | { status: "missing" };

/**
 * Autosave: the working draft, written in place.
 *
 * Deliberately creates no version row. A version is a snapshot the student
 * asked for and can restore to; a version per keystroke burst would bury the
 * three that mean something under three hundred that do not. Nothing is lost
 * that ever existed - versions have only ever been created on an explicit save.
 *
 * `expectedLastEditedAt` is how a pending autosave is stopped from overwriting
 * a restore, a delete, or another tab. The editor sends the timestamp it
 * believes current; if the stored one has moved, this writes nothing and says
 * so. A deleted essay reports `missing`, so an autosave in flight across a
 * delete cannot resurrect the document.
 */
export async function saveEssayDraft(
  db: AppDatabase,
  workspaceId: string,
  essayId: string,
  input: { content?: string; title?: string; expectedLastEditedAt?: number | null },
): Promise<DraftSaveResult> {
  const existing = await db.select({ id: essays.id, lastEditedAt: essays.lastEditedAt }).from(essays)
    .where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId)))
    .then((rows) => rows[0]);
  if (!existing) return { status: "missing" };

  const storedAt = existing.lastEditedAt.getTime();
  if (input.expectedLastEditedAt != null && input.expectedLastEditedAt !== storedAt) {
    return { status: "conflict", savedAt: storedAt };
  }

  const savedAt = new Date();
  await db.update(essays).set({
    ...(input.content === undefined ? {} : { currentContent: cleanContent(input.content) }),
    ...(input.title === undefined ? {} : { title: cleanTitle(input.title) }),
    lastEditedAt: savedAt,
  }).where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId)));

  return { status: "saved", savedAt: savedAt.getTime() };
}

/**
 * The essay's own status, on its own.
 *
 * "Mark complete" moves two things - this and the work state of every prompt
 * the essay answers - and it must not touch anything else about the document,
 * so it does not go through updateEssayMetadata, which rewrites every field the
 * details form owns.
 */
export async function setEssayStatus(db: AppDatabase, workspaceId: string, essayId: string, status: EssayStatus) {
  const updated = await db.update(essays)
    .set({ status })
    .where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId)))
    .returning({ id: essays.id });
  if (updated.length !== 1) throw new Error("Essay not found in the active workspace.");
}

export type SaveVersionResult =
  | { status: "saved" }
  /** Someone else moved the document on since the caller last read it - a
   * concurrent autosave, another tab, another device - and the caller asked
   * to be told rather than overwrite it silently. Nothing was written. */
  | { status: "stale"; currentLastEditedAt: number };

// Content changes are never made in place - every save creates a new
// immutable version and only then repoints the essay's currentContent.
//
// `expectedLastEditedAt` is optional and, when passed, is the same
// optimistic-concurrency guard saveEssayDraft already uses for autosave: the
// caller states the lastEditedAt it believes the row carries, and the check
// runs inside this transaction so nothing can land between the read and the
// write. Omitting it (every caller before Shorten) skips the check entirely -
// existing behaviour is unchanged.
export async function saveEssayVersion(
  db: AppDatabase,
  workspaceId: string,
  essayId: string,
  input: { content: string; reason?: string; expectedLastEditedAt?: number | null },
): Promise<SaveVersionResult> {
  const existing = await db.select({ id: essays.id }).from(essays)
    .where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId)))
    .then((rows) => rows[0]);
  if (!existing) throw new Error("Essay not found in the active workspace.");
  const content = cleanContent(input.content);
  const reason = input.reason?.trim() || null;

  return db.transaction(async (tx) => {
    if (input.expectedLastEditedAt != null) {
      const current = await tx.select({ lastEditedAt: essays.lastEditedAt }).from(essays)
        .where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId)))
        .for("update")
        .then((rows) => rows[0]);
      const currentLastEditedAt = current?.lastEditedAt.getTime() ?? null;
      if (currentLastEditedAt !== input.expectedLastEditedAt) {
        return { status: "stale", currentLastEditedAt: currentLastEditedAt ?? 0 };
      }
    }

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
    return { status: "saved" };
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
    // History is labelled by save time rather than by number, so the reason
    // cannot name "version 3" - and writing a timestamp into it would bake the
    // server's timezone into the data.
    reason: "Restored from an earlier save",
  });
}

export async function deleteEssay(db: AppDatabase, workspaceId: string, essayId: string) {
  const removed = await db.delete(essays)
    .where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId)))
    .returning({ id: essays.id });
  if (removed.length !== 1) throw new Error("Essay not found in the active workspace.");
}
