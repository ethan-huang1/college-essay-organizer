import { and, eq, inArray } from "drizzle-orm";

import { canonicalSiblingIds } from "./canonical";
import type { AppDatabase } from "./db/client";
import { assignedEssayResponses, essays, prompts } from "./db/schema";

// One assignment per prompt (enforced by the schema's unique index on
// promptId) - assigning a new essay replaces whatever was assigned before,
// it never leaves two "current" responses for the same prompt.
//
// The write fans out across canonical siblings: a shared question answered
// through one school is answered for all of them. Doing it here rather than in
// the Server Action means every caller inherits it, including the demo seed.
export async function assignEssayToPrompt(db: AppDatabase, workspaceId: string, promptId: string, essayId: string) {
  const promptIds = await canonicalSiblingIds(db, workspaceId, promptId);
  const essay = await db.select({ id: essays.id }).from(essays)
    .where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId)))
    .then((rows) => rows[0]);
  if (!essay) throw new Error("Essay not found in the active workspace.");

  await db.transaction(async (tx) => {
    await tx.delete(assignedEssayResponses).where(inArray(assignedEssayResponses.promptId, promptIds));
    await tx.insert(assignedEssayResponses).values(promptIds.map((id) => ({
      id: crypto.randomUUID(),
      workspaceId,
      promptId: id,
      essayId,
      assignedAt: new Date(),
    })));
    // Assigning an essay is starting the work, so a prompt must not stay "Not
    // started" afterwards - that mismatch is why progress never moved when a
    // student assigned an essay. An already-complete prompt is left alone.
    await tx.update(prompts)
      .set({ status: "in-progress", updatedAt: new Date() })
      .where(and(inArray(prompts.id, promptIds), eq(prompts.status, "not-started")));
  });
}

export async function unassignPrompt(db: AppDatabase, workspaceId: string, promptId: string) {
  // Delete-shaped, so a prompt that is already gone is success, not an error.
  // Routing through canonicalSiblingIds made this throw where it used to be a
  // tolerant no-op, which turned an ordinary race - the prompt or its school
  // deleted in another tab, or a double-submitted form - into a Server Action
  // crash.
  const promptIds = await canonicalSiblingIds(db, workspaceId, promptId, { missingIsEmpty: true });
  if (promptIds.length === 0) return;
  await db.delete(assignedEssayResponses)
    .where(and(
      inArray(assignedEssayResponses.promptId, promptIds),
      eq(assignedEssayResponses.workspaceId, workspaceId),
    ));
}
