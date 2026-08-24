"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAppDatabase, getReadyDatabase } from "@/lib/db/server";
import { resetDemoWorkspace } from "@/lib/db/demo-workspace";
import { DEMO_WORKSPACE_ID, PERSONAL_WORKSPACE_ID } from "@/lib/db/seed";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace-session";

async function selectWorkspace(workspaceId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

export async function openPersonalWorkspace() {
  // Ensures the empty personal workspace and its taxonomy exist before the
  // redirect lands on a page that reads them.
  await getReadyDatabase();
  await selectWorkspace(PERSONAL_WORKSPACE_ID);
  redirect("/schools");
}

export async function loadDemoWorkspace() {
  const { db } = getAppDatabase();
  await resetDemoWorkspace(db);
  await selectWorkspace(DEMO_WORKSPACE_ID);
  redirect("/schools");
}
