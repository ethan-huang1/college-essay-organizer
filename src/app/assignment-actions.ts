"use server";

import { revalidatePath } from "next/cache";

import { assignEssayToPrompt, unassignPrompt } from "@/lib/assignments";
import { getAppDatabase } from "@/lib/db/server";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function revalidateAssignmentPaths() {
  revalidatePath("/schools");
  revalidatePath("/essays");
  revalidatePath("/reuse");
}

export async function assignEssayAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  assignEssayToPrompt(getAppDatabase().db, snapshot.workspace.id, field(formData, "promptId"), field(formData, "essayId"));
  revalidateAssignmentPaths();
}

export async function unassignEssayAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  unassignPrompt(getAppDatabase().db, snapshot.workspace.id, field(formData, "promptId"));
  revalidateAssignmentPaths();
}
