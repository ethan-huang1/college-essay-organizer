"use server";

import { revalidatePath } from "next/cache";

import { getAppDatabase } from "@/lib/db/server";
import { createPrompt, deletePrompt, type PromptInput, setPromptStatus, updatePrompt } from "@/lib/prompts";
import { recomputeWorkspaceMatches } from "@/lib/reuse";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";

function revalidatePromptPaths() {
  revalidatePath("/");
  revalidatePath("/schools");
  revalidatePath("/families");
  revalidatePath("/reuse");
}

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function optionalNumber(formData: FormData, name: string) {
  const value = field(formData, name).trim();
  return value ? Number(value) : null;
}

function promptInput(formData: FormData): PromptInput {
  const requirement = field(formData, "requirement");
  const status = field(formData, "status");
  const deadline = field(formData, "deadline");
  return {
    schoolId: field(formData, "schoolId"),
    title: field(formData, "title"),
    promptText: field(formData, "promptText"),
    minWordCount: optionalNumber(formData, "minWordCount"),
    maxWordCount: optionalNumber(formData, "maxWordCount"),
    minCharCount: optionalNumber(formData, "minCharCount"),
    maxCharCount: optionalNumber(formData, "maxCharCount"),
    requirement: requirement === "optional" ? "optional" : requirement === "conditional" ? "conditional" : "required",
    conditionalNote: field(formData, "conditionalNote"),
    status: ["in-progress", "complete", "submitted"].includes(status)
      ? status as PromptInput["status"]
      : "not-started",
    deadline: deadline ? new Date(`${deadline}T12:00:00`) : null,
    notes: field(formData, "notes"),
    primaryFamilyId: field(formData, "primaryFamilyId") || null,
    // The prompt form no longer offers a secondary-category picker, so omitting
    // the key tells updatePrompt to keep the importer's links rather than clear
    // them.
    secondaryFamilyIds: formData.has("secondaryFamilyIds")
      ? formData.getAll("secondaryFamilyIds").filter((value): value is string => typeof value === "string")
      : undefined,
  };
}

export async function createPromptAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  await createPrompt(db, snapshot.workspace.id, promptInput(formData));
  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidatePromptPaths();
}

export async function updatePromptAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  await updatePrompt(db, snapshot.workspace.id, field(formData, "promptId"), promptInput(formData));
  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidatePromptPaths();
}

export async function deletePromptAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  await deletePrompt(db, snapshot.workspace.id, field(formData, "promptId"));
  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidatePromptPaths();
}

export async function setPromptStatusAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const status = field(formData, "status");
  const db = getAppDatabase().db;
  await setPromptStatus(
    db,
    snapshot.workspace.id,
    field(formData, "promptId"),
    ["in-progress", "complete", "submitted"].includes(status) ? (status as PromptInput["status"]) : "not-started",
  );
  // Completing a prompt closes it as a reuse opportunity, so matches are stale
  // until rescored.
  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidatePromptPaths();
}
