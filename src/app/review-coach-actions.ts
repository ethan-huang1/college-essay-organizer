"use server";

import { type ReviewCoachResult, getReviewCoachRecommendations } from "@/lib/coaches/review-coach";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import { documentName, essayPromptContext } from "./essay-ui";

export type ReviewCoachActionResult = ReviewCoachResult;

/**
 * Ask Travila's Review Coach profile for a holistic read on the writing. No
 * DB writes, nothing persisted - read-only analysis.
 *
 * No fast path exists for this coach: unlike the word-count coaches there is
 * no numeric precondition, and an essay that rates well on every axis is a
 * real result rather than an edge case. The framing context is resolved
 * server-side and is deliberately non-scoring - Review Coach is told not to
 * judge prompt fit at all.
 */
export async function requestReviewCoachAction(essayId: string, content: string): Promise<ReviewCoachActionResult> {
  const snapshot = await getActiveWorkspaceSnapshot();
  const essay = snapshot.essays.find((candidate) => candidate.id === essayId);
  if (!essay) return { status: "error", reason: "invalid-input", detail: "Essay not found in the active workspace." };

  const origin = essayPromptContext(snapshot, essay);

  return getReviewCoachRecommendations({
    content,
    essayTitle: documentName(essay),
    schoolName: origin?.schoolName ?? null,
    userId: snapshot.user.id,
  });
}
