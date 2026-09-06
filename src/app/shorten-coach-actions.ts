"use server";

import { wordCount } from "@/lib/essays";
import { type ShortenCoachResult, getShortenCoachRecommendations, validateShortenCoachInput } from "@/lib/coaches/shorten-coach";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";

export type ShortenCoachActionResult =
  | ShortenCoachResult
  | { status: "under-target"; currentWordCount: number; targetWordCount: number };

/**
 * Ask Travila's Shorten Coach profile for editorial shortening suggestions.
 * No DB writes, no essay version, nothing persisted - this is read-only
 * analysis the student decides what to do with. Content is validated before
 * the under-target check runs, so an empty essay is always reported as
 * invalid, never as "already under target".
 */
export async function requestShortenCoachAction(
  essayId: string,
  content: string,
  targetWordCount: number,
): Promise<ShortenCoachActionResult> {
  const snapshot = await getActiveWorkspaceSnapshot();
  const essay = snapshot.essays.find((candidate) => candidate.id === essayId);
  if (!essay) return { status: "error", reason: "invalid-input", detail: "Essay not found in the active workspace." };

  const validationError = validateShortenCoachInput(content, targetWordCount);
  if (validationError) return validationError;

  const currentWordCount = wordCount(content);
  if (currentWordCount <= targetWordCount) {
    return { status: "under-target", currentWordCount, targetWordCount };
  }

  return getShortenCoachRecommendations({ content, targetWordCount, userId: snapshot.user.id });
}
