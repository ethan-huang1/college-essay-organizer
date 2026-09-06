"use server";

import { redirect } from "next/navigation";

import { getAppDatabase } from "@/lib/db/server";
import { saveEssayVersion } from "@/lib/essays";
import { reuseEssayForPrompt } from "@/lib/reuse-essay";
import { recomputeWorkspaceMatches } from "@/lib/reuse";
import { type ShortenResult, shortenEssay } from "@/lib/travila";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import { revalidateEssayPaths } from "./revalidate-essay-paths";

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Ask Travila to shorten an essay. No DB writes - the result is a proposed
 * revision the student has to explicitly accept. Every input validation rule
 * lives inside shortenEssay itself, so this (and the Reuse-side caller below)
 * can never bypass it.
 */
export async function requestShortenAction(
  essayId: string,
  content: string,
  targetWordCount: number,
): Promise<ShortenResult> {
  const snapshot = await getActiveWorkspaceSnapshot();
  const essay = snapshot.essays.find((candidate) => candidate.id === essayId);
  if (!essay) return { status: "error", reason: "invalid-input", detail: "Essay not found in the active workspace." };
  return shortenEssay({ content, targetWordCount, userId: snapshot.user.id });
}

export type AcceptShortenResult = { status: "accepted" } | { status: "stale"; currentLastEditedAt: number };

/**
 * Accept a proposed shorten: saves it as a new immutable version, but only if
 * the essay has not changed since the proposal was generated.
 * `expectedLastEditedAt` is the same optimistic-concurrency token autosave
 * already threads through the editor (AutosaveState.savedAt) - if the essay
 * moved on since generation (a concurrent autosave, another tab), this
 * refuses the write instead of silently discarding those newer edits.
 *
 * A typed action rather than a bound `<form action>`, so the client can show
 * the "regenerate" message inline instead of via a page redirect.
 */
export async function acceptShortenAction(input: {
  essayId: string;
  content: string;
  targetWordCount: number;
  expectedLastEditedAt: number | null;
}): Promise<AcceptShortenResult> {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  const result = await saveEssayVersion(db, snapshot.workspace.id, input.essayId, {
    content: input.content,
    reason: `Shortened with Travila to ~${input.targetWordCount} words`,
    expectedLastEditedAt: input.expectedLastEditedAt,
  });
  if (result.status === "stale") {
    return { status: "stale", currentLastEditedAt: result.currentLastEditedAt };
  }
  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateEssayPaths(input.essayId);
  return { status: "accepted" };
}

/**
 * Accept a reuse-and-shorten: reuses the essay exactly as reuseEssayForPromptAction
 * does today (unmodified), then - if that succeeded - saves the shortened text
 * as an explicit second version on the fresh copy. The two writes are
 * deliberately not one transaction: reuseEssayForPrompt already committed a
 * real, usable essay (full-length copy, version 1) by the time the second
 * write is attempted, so a failure there does not corrupt or lose anything -
 * it just means the copy is still full-length, which the redirect flags.
 */
export async function acceptReuseWithShortenAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  const promptId = field(formData, "promptId");
  const essayId = field(formData, "essayId");
  const from = field(formData, "from");
  const content = field(formData, "content");
  const targetWordCount = Number(field(formData, "targetWordCount"));

  const result = await reuseEssayForPrompt(db, snapshot.workspace.id, promptId, essayId, {
    expectedAssignedEssayId: field(formData, "expectedAssignedEssayId") || null,
  });

  if (result.status === "needs-confirmation") {
    const params = new URLSearchParams({ promptId, essayId, assigned: result.assignedEssayId });
    if (from) params.set("from", from);
    redirect(`/editor/reuse?${params.toString()}`);
  }

  await recomputeWorkspaceMatches(db, snapshot.workspace.id);

  try {
    await saveEssayVersion(db, snapshot.workspace.id, result.essayId, {
      content,
      reason: `Shortened with Travila to ~${targetWordCount} words`,
    });
  } catch {
    // The copy and its first version are safe regardless - only the second,
    // shortened version failed to save. Say so rather than losing the error.
    revalidateEssayPaths(result.essayId);
    redirect(`/editor/${result.essayId}?shortenSaveError=1`);
  }

  revalidateEssayPaths(result.essayId);
  redirect(`/editor/${result.essayId}`);
}
