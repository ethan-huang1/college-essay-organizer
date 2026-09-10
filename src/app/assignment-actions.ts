"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assignEssayToPrompt, unassignPrompt } from "@/lib/assignments";
import { getAppDatabase } from "@/lib/db/server";
import { createEssay } from "@/lib/essays";
import { reuseEssayForPrompt } from "@/lib/reuse-essay";
import { recomputeWorkspaceMatches } from "@/lib/reuse";
import { getActiveWorkspaceSnapshot, requireWritableWorkspace } from "@/lib/workspace-session";

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function revalidateAssignmentPaths() {
  revalidatePath("/");
  revalidatePath("/schools");
  revalidatePath("/families");
  revalidatePath("/essays");
  revalidatePath("/reuse");
  revalidatePath("/editor");
}

export async function unassignEssayAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  requireWritableWorkspace(snapshot);
  const db = getAppDatabase().db;
  await unassignPrompt(db, snapshot.workspace.id, field(formData, "promptId"));
  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateAssignmentPaths();
}

// "Start a new essay for this prompt" - creates an empty essay pre-classified
// from the prompt it answers (so matching immediately places it in the right
// family) and assigns it, instead of making the student retype the prompt's
// family, word target, and school in the essay library.
export async function draftEssayForPromptAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  requireWritableWorkspace(snapshot);
  const promptId = field(formData, "promptId");
  const prompt = snapshot.prompts.find((candidate) => candidate.id === promptId);
  if (!prompt) throw new Error("Prompt not found in the active workspace.");
  const school = snapshot.schools.find((candidate) => candidate.id === prompt.schoolId);

  const db = getAppDatabase().db;
  const essayId = await createEssay(db, snapshot.workspace.id, {
    title: `${school?.name ?? "Draft"} — ${prompt.title}`.slice(0, 160),
    targetWordCount: prompt.maxWordCount,
    status: "idea",
    designation: "school-adaptation",
    primaryFamilyId: prompt.primaryFamily?.id ?? null,
    secondaryFamilyIds: prompt.secondaryFamilies.map((family) => family.id),
    // This essay is being started *from* a prompt, so its origin is known
    // exactly and needs no inference. Recording it here is what makes the
    // difference between the matcher knowing what the essay does and guessing
    // from finished prose - and it must be the origin rather than the
    // assignment, so later reuse cannot redefine it.
    originPromptId: promptId,
    content: "",
  });
  await assignEssayToPrompt(db, snapshot.workspace.id, promptId, essayId);
  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateAssignmentPaths();
  // Nothing left to configure - the school, the prompt, the word target and the
  // category all came from the prompt - so the student lands in the document.
  redirect(`/editor/${essayId}`);
}

/**
 * "Use here" - reuse an essay for another school's prompt.
 *
 * This copies rather than links. Attaching one document to a second college's
 * question made editing for one school edit the other, and made the second
 * school's row open the first school's essay; a student who says "use this
 * here" means "start this answer from that text". See src/lib/reuse-essay.ts.
 *
 * `expectedAssignedEssayId` is what the caller believed answered the prompt -
 * empty from a button that was only rendered because nothing did, and the named
 * essay when the caller is the confirmation page. The write re-checks it and
 * refuses to displace anything it was not told about, so the confirmation is
 * enforced by the write and not merely by which control was rendered.
 */
export async function reuseEssayForPromptAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  requireWritableWorkspace(snapshot);
  const db = getAppDatabase().db;
  const promptId = field(formData, "promptId");
  const essayId = field(formData, "essayId");
  const from = field(formData, "from");

  const result = await reuseEssayForPrompt(db, snapshot.workspace.id, promptId, essayId, {
    expectedAssignedEssayId: field(formData, "expectedAssignedEssayId") || null,
  });

  if (result.status === "needs-confirmation") {
    // Nothing was written. Ask about the essay that is actually attached now,
    // which may not be the one the confirmation page displayed.
    const params = new URLSearchParams({ promptId, essayId, assigned: result.assignedEssayId });
    if (from) params.set("from", from);
    redirect(`/editor/reuse?${params.toString()}`);
  }

  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateAssignmentPaths();
  redirect(`/editor/${result.essayId}`);
}
