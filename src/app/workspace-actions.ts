"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resetDemoWorkspace } from "@/lib/db/demo-workspace";
import { getAppDatabase } from "@/lib/db/server";
import { DEMO_WORKSPACE_ID } from "@/lib/db/seed";
import { ensurePersonalWorkspace } from "@/lib/users";
import { ACTIVE_WORKSPACE_COOKIE, requireSignedInUser } from "@/lib/workspace-session";

// The cookie only ever selects between "my own workspace" and "the shared
// example" - it never carries a workspace id, so it cannot be edited to point
// at someone else's data. See getActiveWorkspaceSnapshot.
async function selectWorkspace(value: "personal" | typeof DEMO_WORKSPACE_ID) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function openPersonalWorkspace() {
  const user = await requireSignedInUser();
  await ensurePersonalWorkspace(getAppDatabase().db, user.id);
  await selectWorkspace("personal");
  redirect("/schools");
}

export async function loadDemoWorkspace() {
  await requireSignedInUser();
  await resetDemoWorkspace(getAppDatabase().db);
  await selectWorkspace(DEMO_WORKSPACE_ID);
  redirect("/schools");
}
