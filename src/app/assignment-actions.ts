"use server";

import { revalidatePath } from "next/cache";

import { assignEssayToPrompt, unassignPrompt } from "@/lib/assignments";
import { getAppDatabase } from "@/lib/db/server";
import { createEssay } from "@/lib/essays";
import { recomputeWorkspaceMatches } from "@/lib/reuse";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";

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
}

export async function assignEssayAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  await assignEssayToPrompt(getAppDatabase().db, snapshot.workspace.id, field(formData, "promptId"), field(formData, "essayId"));
  revalidateAssignmentPaths();
}

export async function unassignEssayAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  await unassignPrompt(getAppDatabase().db, snapshot.workspace.id, field(formData, "promptId"));
  revalidateAssignmentPaths();
}

// "Start a new essay for this prompt" - creates an empty essay pre-classified
// from the prompt it answers (so matching immediately places it in the right
// family) and assigns it, instead of making the student retype the prompt's
// family, word target, and school in the essay library.
export async function draftEssayForPromptAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
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
    content: "",
  });
  await assignEssayToPrompt(db, snapshot.workspace.id, promptId, essayId);
  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateAssignmentPaths();
}
