"use server";

import { redirect } from "next/navigation";

import { getAppDatabase } from "@/lib/db/server";
import {
  createEssay,
  deleteEssay,
  type DraftSaveResult,
  type EssayMetadataInput,
  restoreEssayVersion,
  saveEssayDraft,
  saveEssayVersion,
  setEssayStatus,
  updateEssayMetadata,
} from "@/lib/essays";
import { setPromptStatus } from "@/lib/prompts";
import { recomputeWorkspaceMatches } from "@/lib/reuse";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import { revalidateEssayPaths } from "./revalidate-essay-paths";

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

export async function createEssayAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  const essayId = await createEssay(db, snapshot.workspace.id, {
    ...essayMetadataInput(formData),
    content: field(formData, "content"),
  });
  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateEssayPaths();
  // Straight into the writing workspace: a new document exists to be written
  // in, and My Essays will show it as in progress when the student comes back.
  redirect(`/editor/${essayId}`);
}

export async function updateEssayMetadataAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  const essayId = field(formData, "essayId");
  await updateEssayMetadata(db, snapshot.workspace.id, essayId, essayMetadataInput(formData));
  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateEssayPaths(essayId);
}

export async function saveEssayVersionAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  const essayId = field(formData, "essayId");
  await saveEssayVersion(db, snapshot.workspace.id, essayId, {
    content: field(formData, "content"),
    reason: field(formData, "reason"),
  });
  // The only place matches are rescored for an edit. Autosave deliberately
  // skips it - rescoring runs real embeddings - so saving a version is also
  // what refreshes the editor's reuse and adaptation guidance.
  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateEssayPaths(essayId);
}

export async function restoreEssayVersionAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  const essayId = field(formData, "essayId");
  await restoreEssayVersion(db, snapshot.workspace.id, essayId, field(formData, "versionId"));
  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateEssayPaths(essayId);
}

export async function deleteEssayAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  await deleteEssay(db, snapshot.workspace.id, field(formData, "essayId"));
  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateEssayPaths();
  // Deleting is only offered from inside the document, and that URL is gone
  // now - staying on it would render a 404 for the thing the student just
  // deliberately deleted.
  redirect("/essays");
}

/**
 * Autosave from the editor.
 *
 * A typed-argument action rather than a form action: it is called from the
 * client editor on an idle debounce, never submitted. It writes the draft and
 * nothing else - no version row, and no match rescoring, which runs real
 * embeddings and would make every pause in typing cost seconds.
 *
 * No revalidatePath either. Every route in this app is force-dynamic and
 * nothing is prerendered, so the next navigation renders fresh; revalidating
 * five paths per keystroke burst would be work with no visible effect. Saving a
 * version still revalidates everything.
 *
 * The result is returned rather than thrown, because "someone restored a
 * version while you were typing" and "this document was deleted" are expected
 * states the editor has to show, not exceptions.
 */
export async function autosaveEssayDraftAction(
  essayId: string,
  content: string,
  expectedLastEditedAt: number | null,
): Promise<DraftSaveResult> {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  return saveEssayDraft(db, snapshot.workspace.id, essayId, { content, expectedLastEditedAt });
}

/**
 * Renaming the document from the editor's header.
 *
 * The 2-160 character rule lives in cleanTitle, so this validates in exactly
 * one place. The input carries the same bounds for the browser to enforce
 * first; a value that gets past that (spaces only, say) comes back as an inline
 * message on the field rather than an error page. The name appears in the nav
 * badge, both dashboards, the ribbon and the reuse page, so everything is
 * revalidated.
 */
export async function updateEssayTitleAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  const essayId = field(formData, "essayId");
  let ok = false;
  try {
    const result = await saveEssayDraft(db, snapshot.workspace.id, essayId, { title: field(formData, "title") });
    ok = result.status === "saved";
  } catch {
    ok = false;
  }
  revalidateEssayPaths(essayId);
  if (!ok) redirect(`/editor/${essayId}?titleError=1`);
}

/**
 * Mark complete, and its reverse.
 *
 * Completion has to mean the same thing in both places it is read, so it moves
 * both: the essay's own status, and the work state of every prompt it answers -
 * which is what workState, summarizeWorkload, the rings, the bands and the
 * dashboard groups all read. Setting only one of the two is how an editor
 * saying "complete" ends up next to an Overview still counting the prompt as
 * outstanding.
 *
 * `ready` rather than `submitted`: submitted is reserved for an essay actually
 * sent to the college, and stays available in the details form.
 *
 * Nothing else writes either status. Autosave, renaming, saving a version and
 * restoring one all leave both alone, so completion persists until it is
 * reopened here.
 */
export async function setEssayCompletionAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  const essayId = field(formData, "essayId");
  const complete = field(formData, "complete") === "1";
  const essay = snapshot.essays.find((candidate) => candidate.id === essayId);
  if (!essay) throw new Error("Essay not found in the active workspace.");

  await setEssayStatus(db, snapshot.workspace.id, essayId, complete ? "ready" : "revising");
  for (const prompt of essay.linkedPrompts) {
    // Fans out across canonical siblings inside setPromptStatus, so completing
    // a question several campuses share completes it at all of them.
    await setPromptStatus(db, snapshot.workspace.id, prompt.id, complete ? "complete" : "in-progress");
  }

  // Completing closes a reuse opportunity, so the suggestions are stale until
  // rescored - the same reason setPromptStatusAction rescores.
  await recomputeWorkspaceMatches(db, snapshot.workspace.id);
  revalidateEssayPaths(essayId);
}
