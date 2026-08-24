"use server";

import { revalidatePath } from "next/cache";

import { getAppDatabase } from "@/lib/db/server";
import { deleteSchool, updateSchool } from "@/lib/schools";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function updateSchoolAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  updateSchool(getAppDatabase().db, snapshot.workspace.id, field(formData, "schoolId"), {
    name: field(formData, "name"),
    notes: field(formData, "notes"),
  });
  revalidatePath("/schools");
}

export async function deleteSchoolAction(formData: FormData) {
  const snapshot = await getActiveWorkspaceSnapshot();
  deleteSchool(getAppDatabase().db, snapshot.workspace.id, field(formData, "schoolId"));
  revalidatePath("/schools");
}
