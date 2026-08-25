"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAppDatabase } from "@/lib/db/server";
import { deleteSchool, setSchoolPrograms, updateSchool } from "@/lib/schools";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function updateSchoolAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  await updateSchool(getAppDatabase().db, snapshot.workspace.id, field(formData, "schoolId"), {
    name: field(formData, "name"),
    notes: field(formData, "notes"),
  });
  revalidatePath("/");
  revalidatePath("/schools");
}

// Program-gated prompts cannot be counted until the student says which
// programs they are applying to. Submitting with nothing checked is a valid
// answer - "none" - and settles those prompts at zero rather than leaving them
// unresolved forever.
export async function setSchoolProgramsAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  const programKeys = formData.getAll("programKey").filter((value): value is string => typeof value === "string");
  await setSchoolPrograms(getAppDatabase().db, snapshot.workspace.id, field(formData, "schoolId"), programKeys);
  revalidatePath("/");
  revalidatePath("/schools");
  revalidatePath("/families");
}

// Removing a school cascades its prompts, their category links, and any essay
// assigned to them, so every view that reads those has to be revalidated - and
// the user is sent back to the full list, since the page they were on may have
// been filtered to the school that no longer exists.
export async function deleteSchoolAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  await deleteSchool(getAppDatabase().db, snapshot.workspace.id, field(formData, "schoolId"));
  revalidatePath("/");
  revalidatePath("/schools");
  revalidatePath("/families");
  revalidatePath("/essays");
  revalidatePath("/reuse");
  redirect("/schools");
}
