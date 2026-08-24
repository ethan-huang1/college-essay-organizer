"use server";

import { revalidatePath } from "next/cache";

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
    secondaryFamilyIds: formData.getAll("secondaryFamilyIds").filter((value): value is string => typeof value === "string"),
  };
}

function revalidateEssayPaths() {
  revalidatePath("/essays");
  revalidatePath("/families");
  revalidatePath("/reuse");
}

export async function createEssayAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  createEssay(db, snapshot.workspace.id, {
    ...essayMetadataInput(formData),
    content: field(formData, "content"),
  });
  recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateEssayPaths();
}

export async function updateEssayMetadataAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  updateEssayMetadata(db, snapshot.workspace.id, field(formData, "essayId"), essayMetadataInput(formData));
  recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateEssayPaths();
}

export async function saveEssayVersionAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  saveEssayVersion(db, snapshot.workspace.id, field(formData, "essayId"), {
    content: field(formData, "content"),
    reason: field(formData, "reason"),
  });
  recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateEssayPaths();
}

export async function restoreEssayVersionAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  restoreEssayVersion(db, snapshot.workspace.id, field(formData, "essayId"), field(formData, "versionId"));
  recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateEssayPaths();
}

export async function deleteEssayAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  deleteEssay(db, snapshot.workspace.id, field(formData, "essayId"));
  recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateEssayPaths();
}
