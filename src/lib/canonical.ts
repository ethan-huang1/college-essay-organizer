import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "./db/client";
import { prompts } from "./db/schema";

/**
 * Every prompt in this workspace that is literally the same question as
 * `promptId`, including itself.
 *
 * Seven UC campuses each import their own row for Personal Insight Question 1,
 * but a student writes that essay once. Response state therefore has to move
 * across all of them together: assigning an essay through UCLA has to satisfy
 * Berkeley too.
 *
 * Keeping siblings in lockstep at write time - rather than merging them at read
 * time - is what lets every read path stay ignorant of canonical prompts. It
 * also means removing one campus cannot orphan a shared assignment: the
 * surviving campuses still hold their own rows.
 *
 * Throws when the prompt is not in the workspace, so callers get the same
 * workspace-scoping guarantee they had when they scoped the write themselves.
 * `missingIsEmpty` opts out for delete-shaped callers, where a prompt that is
 * already gone is success rather than an error.
 */
export async function canonicalSiblingIds(
  db: Pick<AppDatabase, "select">,
  workspaceId: string,
  promptId: string,
  options: { missingIsEmpty?: boolean } = {},
): Promise<string[]> {
  const prompt = await db.select({ id: prompts.id, canonicalKey: prompts.canonicalKey })
    .from(prompts)
    .where(and(eq(prompts.id, promptId), eq(prompts.workspaceId, workspaceId)))
    .then((rows) => rows[0]);
  if (!prompt) {
    if (options.missingIsEmpty) return [];
    throw new Error("Prompt not found in the active workspace.");
  }
  if (!prompt.canonicalKey) return [prompt.id];

  const siblings = await db.select({ id: prompts.id })
    .from(prompts)
    .where(and(eq(prompts.workspaceId, workspaceId), eq(prompts.canonicalKey, prompt.canonicalKey)));
  return siblings.map((sibling) => sibling.id);
}
