"use server";

import { revalidatePath } from "next/cache";

import { importCollege } from "@/lib/college-import";
import { getAppDatabase } from "@/lib/db/server";
import { recomputeWorkspaceMatches } from "@/lib/reuse";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";

export async function addCollegeAction(formData: FormData) {
  const name = formData.get("collegeName");
  if (typeof name !== "string" || !name.trim()) throw new Error("Choose or enter a college name.");

  const snapshot = await getActiveWorkspaceSnapshot();
  const db = getAppDatabase().db;
  importCollege(db, snapshot.workspace.id, name);
  recomputeWorkspaceMatches(db, snapshot.workspace.id);

  revalidatePath("/");
  revalidatePath("/schools");
  revalidatePath("/families");
  revalidatePath("/reuse");
}
