import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { assignEssayWithinTx } from "./assignments";
import { canonicalSiblingIds } from "./canonical";
import type { AppDatabase } from "./db/client";
import { assignedEssayResponses, essays, prompts, schools } from "./db/schema";
import { insertEssay } from "./essays";
import { promptFamilyLinks } from "./db/schema";

/**
 * Reusing an essay for another school's prompt: copy, don't share.
 *
 * The old behaviour attached one essay to a second prompt, which made a single
 * document answer two colleges - so opening the Northwestern row opened the
 * Princeton essay, and editing for one school edited the other. What a student
 * means by "use this here" is "start this school's answer from that text", so
 * this creates a **new document** seeded with the source's text, owned by the
 * target prompt, independent from that moment on.
 *
 * Everything below happens in one transaction the caller owns, so a failure
 * cannot leave a copy that answers nothing.
 */

export type ReuseOutcome =
  | { status: "reused"; essayId: string; created: boolean }
  /**
   * A different essay currently answers this prompt and the caller did not say
   * so. Nothing was written; the caller has to confirm the replacement.
   */
  | { status: "needs-confirmation"; assignedEssayId: string; assignedTitle: string; existingCopyId: string | null };

export type ReuseOptions = {
  /**
   * Which essay the caller believes currently answers the prompt - `null` for
   * "nothing does". Checked again inside the transaction, so a confirmation
   * that has gone stale asks again rather than silently displacing whatever is
   * there now. The same optimistic-concurrency shape as saveEssayDraft's
   * expectedLastEditedAt.
   */
  expectedAssignedEssayId?: string | null;
};

/** "Northwestern University — Diverse perspectives — Reused from Princeton University Your Voice". */
function copyTitle(
  targetSchoolName: string | null,
  promptTitle: string,
  source: { title: string; schoolName: string | null; promptTitle: string | null },
) {
  const head = [targetSchoolName, promptTitle].filter(Boolean).join(" — ");
  const from = [source.schoolName, source.promptTitle].filter(Boolean).join(" ") || source.title;
  // cleanTitle rejects anything over 160 characters, and these names are built
  // from three of the longest strings in the app, so the tail is trimmed rather
  // than allowed to fail the write.
  return `${head} — Reused from ${from}`.slice(0, 160).trim();
}

export async function reuseEssayForPrompt(
  db: AppDatabase,
  workspaceId: string,
  promptId: string,
  essayId: string,
  options: ReuseOptions = {},
): Promise<ReuseOutcome> {
  return db.transaction(async (tx) => {
    // Locked for the duration: two "Use here" clicks on the same essay arriving
    // together are serialised, so the second sees the copy the first made and
    // reattaches it instead of creating a duplicate.
    const source = await tx.select().from(essays)
      .where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId)))
      .for("update")
      .then((rows) => rows[0]);
    if (!source) throw new Error("Essay not found in the active workspace.");

    const prompt = await tx.select().from(prompts)
      .where(and(eq(prompts.id, promptId), eq(prompts.workspaceId, workspaceId)))
      .then((rows) => rows[0]);
    if (!prompt) throw new Error("Prompt not found in the active workspace.");

    const promptIds = await canonicalSiblingIds(tx, workspaceId, promptId);

    // A copy of this source for this question may already exist - from an
    // earlier "Use here", or from one made through a sibling campus of the same
    // shared question.
    const existingCopy = await tx.select({ id: essays.id }).from(essays)
      .where(and(
        eq(essays.workspaceId, workspaceId),
        eq(essays.adaptedFromEssayId, essayId),
        isNotNull(essays.originPromptId),
        inArray(essays.originPromptId, promptIds),
      ))
      .then((rows) => rows[0] ?? null);

    const current = await tx.select({ essayId: assignedEssayResponses.essayId })
      .from(assignedEssayResponses)
      .where(and(
        eq(assignedEssayResponses.workspaceId, workspaceId),
        inArray(assignedEssayResponses.promptId, promptIds),
      ))
      .then((rows) => rows[0]?.essayId ?? null);

    // The essay this call is going to attach: the existing copy if there is
    // one, otherwise the copy about to be made.
    const incomingId = existingCopy?.id ?? null;
    const expected = options.expectedAssignedEssayId ?? null;

    // Ask-first is enforced here, not only by whichever button was rendered: if
    // something else answers this prompt and the caller did not name it, write
    // nothing and let the caller confirm against what is actually there.
    if (current && current !== incomingId && current !== expected) {
      const assigned = await tx.select({ title: essays.title }).from(essays)
        .where(and(eq(essays.id, current), eq(essays.workspaceId, workspaceId)))
        .then((rows) => rows[0]);
      return {
        status: "needs-confirmation",
        assignedEssayId: current,
        assignedTitle: assigned?.title ?? "another essay",
        existingCopyId: incomingId,
      };
    }

    if (existingCopy) {
      // Reattach rather than re-copy. The copy may have been displaced by
      // another essay since it was made, in which case this is the repair; when
      // it is already the current answer this rewrites the same row.
      await assignEssayWithinTx(tx, workspaceId, promptId, existingCopy.id);
      return { status: "reused", essayId: existingCopy.id, created: false };
    }

    const school = prompt.schoolId
      ? await tx.select({ name: schools.name }).from(schools)
        .where(and(eq(schools.id, prompt.schoolId), eq(schools.workspaceId, workspaceId)))
        .then((rows) => rows[0] ?? null)
      : null;

    // Where the text came from, for the copy's name. Mirrors essayOrigin's
    // precedence - a catalogue prompt beats pasted text - without importing the
    // view layer.
    const sourcePrompt = source.originPromptId
      ? await tx.select({ title: prompts.title, schoolId: prompts.schoolId }).from(prompts)
        .where(and(eq(prompts.id, source.originPromptId), eq(prompts.workspaceId, workspaceId)))
        .then((rows) => rows[0] ?? null)
      : null;
    const sourceSchool = sourcePrompt?.schoolId
      ? await tx.select({ name: schools.name }).from(schools)
        .where(and(eq(schools.id, sourcePrompt.schoolId), eq(schools.workspaceId, workspaceId)))
        .then((rows) => rows[0] ?? null)
      : null;

    // The target prompt's own categories, so the copy is classified for the
    // question it now answers rather than for the one it came from.
    const familyLinks = await tx.select({ familyId: promptFamilyLinks.familyId, isPrimary: promptFamilyLinks.isPrimary })
      .from(promptFamilyLinks)
      .where(and(eq(promptFamilyLinks.workspaceId, workspaceId), eq(promptFamilyLinks.promptId, prompt.id)));

    const copyId = await insertEssay(tx, workspaceId, {
      title: copyTitle(school?.name ?? null, prompt.title, {
        title: source.title,
        schoolName: sourceSchool?.name ?? null,
        promptTitle: sourcePrompt?.title ?? source.originPromptTitle ?? null,
      }),
      // Exactly what the source says right now. The copy's first version is
      // therefore the source's current text, character for character.
      content: source.currentContent,
      targetWordCount: prompt.maxWordCount,
      status: source.currentContent.trim() ? "draft" : "idea",
      designation: "school-adaptation",
      primaryFamilyId: familyLinks.find((link) => link.isPrimary)?.familyId ?? null,
      secondaryFamilyIds: familyLinks.filter((link) => !link.isPrimary).map((link) => link.familyId),
      originPromptId: prompt.id,
      adaptedFromEssayId: source.id,
      // Carried over so the "names another school" warning follows the text
      // into the document that has to act on it.
      schoolSpecificPhrases: source.schoolSpecificPhrases,
      notes: source.notes ?? undefined,
    });

    await assignEssayWithinTx(tx, workspaceId, promptId, copyId);
    return { status: "reused", essayId: copyId, created: true };
  });
}
