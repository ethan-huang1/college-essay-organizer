"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAppDatabase } from "@/lib/db/server";
import { DEMO_WORKSPACE_ID, PERSONAL_WORKSPACE_ID, resetDemoWorkspace } from "@/lib/db/seed";
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
  getAppDatabase();
  await selectWorkspace(PERSONAL_WORKSPACE_ID);
  redirect("/schools");
}

export async function loadDemoWorkspace() {
  const { db } = getAppDatabase();
  resetDemoWorkspace(db);
  await selectWorkspace(DEMO_WORKSPACE_ID);
  redirect("/schools");
}
