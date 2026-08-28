"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAppDatabase } from "@/lib/db/server";
import {
  createEssay,
  deleteEssay,
  type EssayMetadataInput,
  restoreEssayVersion,
  saveEssayVersion,
  updateEssayMetadata,
} from "@/lib/essays";
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

const STATUSES = ["idea", "outline", "draft", "revising", "ready", "submitted"] as const;

function essayMetadataInput(formData: FormData): EssayMetadataInput {
  const status = field(formData, "status");
  const designation = field(formData, "designation");
  return {
    title: field(formData, "title"),
    targetWordCount: optionalNumber(formData, "targetWordCount"),
    status: (STATUSES as readonly string[]).includes(status) ? (status as EssayMetadataInput["status"]) : "idea",
    designation: designation === "school-adaptation" ? "school-adaptation" : "canonical",
    notes: field(formData, "notes"),
    schoolSpecificPhrases: field(formData, "schoolSpecificPhrases")
      .split(",")
      .map((phrase) => phrase.trim())
      .filter(Boolean),
    primaryFamilyId: field(formData, "primaryFamilyId") || null,
    // The prompt this essay was written for. Selecting a catalogue prompt wins;
    // normalizeOrigin clears the pasted pair in that case, so a student who
    // picks a prompt after pasting one does not leave two answers behind.
    originPromptId: field(formData, "originPromptId") || null,
    originPromptTitle: field(formData, "originPromptTitle") || null,
    originPromptText: field(formData, "originPromptText") || null,
    // The essay form no longer offers a secondary-category picker, so omitting
    // the key tells updateEssayMetadata to keep the importer's links.
    secondaryFamilyIds: formData.has("secondaryFamilyIds")
      ? formData.getAll("secondaryFamilyIds").filter((value): value is string => typeof value === "string")
      : undefined,
  };
}

function revalidateEssayPaths() {
  revalidatePath("/");
  revalidatePath("/schools");
  revalidatePath("/essays");
  revalidatePath("/families");
  revalidatePath("/reuse");
}

export async function createEssayAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  const essayId = await createEssay(db, snapshot.workspace.id, {
    ...essayMetadataInput(formData),
    content: field(formData, "content"),
  });
  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateEssayPaths();
  // Navigating away is what closes and resets the <details> form, and the hash
  // scrolls the new card into view - both without any client-side state.
  redirect(`/essays#essay-${essayId}`);
}

export async function updateEssayMetadataAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  await updateEssayMetadata(db, snapshot.workspace.id, field(formData, "essayId"), essayMetadataInput(formData));
  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateEssayPaths();
}

export async function saveEssayVersionAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  await saveEssayVersion(db, snapshot.workspace.id, field(formData, "essayId"), {
    content: field(formData, "content"),
    reason: field(formData, "reason"),
  });
  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateEssayPaths();
}

export async function restoreEssayVersionAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  await restoreEssayVersion(db, snapshot.workspace.id, field(formData, "essayId"), field(formData, "versionId"));
  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateEssayPaths();
}

export async function deleteEssayAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  await deleteEssay(db, snapshot.workspace.id, field(formData, "essayId"));
  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateEssayPaths();
}
