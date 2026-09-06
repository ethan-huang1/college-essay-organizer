"use server";

import { type FlowCoachResult, getFlowCoachFindings } from "@/lib/coaches/flow-coach";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";

export type FlowCoachActionResult = FlowCoachResult;

/**
 * Ask Travila's Flow Coach profile for its read on the current draft. No DB
 * writes, nothing persisted - read-only analysis.
 *
 * The essay id is looked up in the active workspace snapshot purely to enforce
 * the workspace boundary; the text analysed is whatever the client sent, which
 * is the live unsaved draft rather than the last saved version.
 *
 * No numeric precondition and so no calm fast-path status: this coach's only
 * precondition is a non-empty essay, and finding nothing is a real result the
 * UI reports as such rather than an edge case.
 */
export async function requestFlowCoachAction(essayId: string, content: string): Promise<FlowCoachActionResult> {
  const snapshot = await getActiveWorkspaceSnapshot();
  const essay = snapshot.essays.find((candidate) => candidate.id === essayId);
  if (!essay) return { status: "error", reason: "invalid-input", detail: "Essay not found in the active workspace." };

  return getFlowCoachFindings({ content, userId: snapshot.user.id });
}
