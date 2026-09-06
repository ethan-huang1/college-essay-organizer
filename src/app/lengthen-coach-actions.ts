"use server";

import { wordCount } from "@/lib/essays";
import {
  type LengthenCoachResult,
  getLengthenCoachRecommendations,
  validateLengthenCoachInput,
} from "@/lib/coaches/lengthen-coach";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";

export type LengthenCoachActionResult =
  | LengthenCoachResult
  | { status: "no-headroom"; currentWordCount: number; targetWordCount: number };

/**
 * Ask Travila's Lengthen Coach profile where this essay would benefit from
 * more development. No DB writes, nothing persisted - read-only analysis.
 *
 * Content is validated before the no-headroom fast path, so an empty essay is
 * always reported as invalid rather than as "no room to expand". The fast
 * path itself only applies when a target exists: without one, "where would
 * more detail help?" is still a perfectly good question.
 */
export async function requestLengthenCoachAction(
  essayId: string,
  content: string,
  targetWordCount: number | null,
): Promise<LengthenCoachActionResult> {
  const snapshot = await getActiveWorkspaceSnapshot();
  const essay = snapshot.essays.find((candidate) => candidate.id === essayId);
  if (!essay) return { status: "error", reason: "invalid-input", detail: "Essay not found in the active workspace." };

  const validationError = validateLengthenCoachInput(content, targetWordCount);
  if (validationError) return validationError;

  if (targetWordCount !== null) {
    const currentWordCount = wordCount(content);
    if (currentWordCount >= targetWordCount) {
      return { status: "no-headroom", currentWordCount, targetWordCount };
    }
  }

  return getLengthenCoachRecommendations({ content, targetWordCount, userId: snapshot.user.id });
}
