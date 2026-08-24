"use server";

import { revalidatePath } from "next/cache";

import { getAppDatabase } from "@/lib/db/server";
import { createPrompt, deletePrompt, type PromptInput, updatePrompt } from "@/lib/prompts";
import { recomputeWorkspaceMatches } from "@/lib/reuse";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";

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
    secondaryFamilyIds: formData.getAll("secondaryFamilyIds").filter((value): value is string => typeof value === "string"),
  };
}

export async function createPromptAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  createPrompt(db, snapshot.workspace.id, promptInput(formData));
  recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidatePath("/schools");
  revalidatePath("/families");
  revalidatePath("/reuse");
}

export async function updatePromptAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  updatePrompt(db, snapshot.workspace.id, field(formData, "promptId"), promptInput(formData));
  recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidatePath("/schools");
  revalidatePath("/families");
  revalidatePath("/reuse");
}

export async function deletePromptAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  deletePrompt(db, snapshot.workspace.id, field(formData, "promptId"));
  recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidatePath("/schools");
  revalidatePath("/families");
  revalidatePath("/reuse");
}
