import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "./db/client";
import { assignedEssayResponses, essays, prompts } from "./db/schema";

// One assignment per prompt (enforced by the schema's unique index on
// promptId) - assigning a new essay replaces whatever was assigned before,
// it never leaves two "current" responses for the same prompt.
export async function assignEssayToPrompt(db: AppDatabase, workspaceId: string, promptId: string, essayId: string) {
  const prompt = await db.select({ id: prompts.id }).from(prompts)
    .where(and(eq(prompts.id, promptId), eq(prompts.workspaceId, workspaceId)))
    .then((rows) => rows[0]);
  if (!prompt) throw new Error("Prompt not found in the active workspace.");
  const essay = await db.select({ id: essays.id }).from(essays)
    .where(and(eq(essays.id, essayId), eq(essays.workspaceId, workspaceId)))
    .then((rows) => rows[0]);
  if (!essay) throw new Error("Essay not found in the active workspace.");

  await db.transaction(async (tx) => {
    await tx.delete(assignedEssayResponses).where(eq(assignedEssayResponses.promptId, promptId));
    await tx.insert(assignedEssayResponses).values({
      id: crypto.randomUUID(),
      workspaceId,
      promptId,
      essayId,
      assignedAt: new Date(),
    });
  });
}

export async function unassignPrompt(db: AppDatabase, workspaceId: string, promptId: string) {
  await db.delete(assignedEssayResponses)
    .where(and(eq(assignedEssayResponses.promptId, promptId), eq(assignedEssayResponses.workspaceId, workspaceId)))
    ;
}
