"use server";

import {
  type PromptFitCoachResult,
  getPromptFitCoachRecommendations,
  validatePromptFitEssayContent,
} from "@/lib/coaches/prompt-fit-coach";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import { essayPromptContext } from "./essay-ui";

export type PromptFitCoachActionResult = PromptFitCoachResult | { status: "no-prompt" };

/**
 * Ask Travila's Prompt Fit Coach profile how well this essay answers its
 * prompt. No DB writes, nothing persisted - read-only analysis.
 *
 * The essay text comes from the client because it may hold unsaved edits the
 * server has not seen yet. The prompt does NOT: it is resolved here from the
 * essay's own current assignment, so a stale or mismatched prompt can never
 * be analysed instead of the real one.
 */
export async function requestPromptFitCoachAction(
  essayId: string,
  content: string,
): Promise<PromptFitCoachActionResult> {
  const snapshot = await getActiveWorkspaceSnapshot();
  const essay = snapshot.essays.find((candidate) => candidate.id === essayId);
  if (!essay) return { status: "error", reason: "invalid-input", detail: "Essay not found in the active workspace." };

  // Essay-side validation first: an empty essay is invalid input and must not
  // be reported as the calm "no prompt attached yet" state instead.
  const contentError = validatePromptFitEssayContent(content);
  if (contentError) return contentError;

  const origin = essayPromptContext(snapshot, essay);
  const promptText = origin?.text?.trim() ?? "";
  if (promptText.length === 0) return { status: "no-prompt" };

  return getPromptFitCoachRecommendations({ content, promptText, userId: snapshot.user.id });
}
