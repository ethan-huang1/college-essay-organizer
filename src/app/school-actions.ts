"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAppDatabase } from "@/lib/db/server";
import { deleteSchool, updateSchool } from "@/lib/schools";
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
