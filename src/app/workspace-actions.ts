"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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

/**
 * Switches to the shared example workspace. Selection only - it never seeds,
 * resets or recreates.
 *
 * It used to call resetDemoWorkspace() on the way in, which meant the button
 * labelled "Example workspace" - the one the Overview onboarding copy tells
 * every new user to press - deleted the workspace row and reimported 19
 * colleges. With more than one account that is a shared-state bomb: whoever
 * clicked last wiped what everyone else was reading, and for the ~6s of the
 * rebuild their pages had no workspace to render. Seeding is an out-of-band
 * operation now (resetDemoWorkspace in src/lib/db/demo-workspace.ts, run from
 * a script), and the example is read-only - see requireWritableWorkspace.
 */
export async function loadDemoWorkspace() {
  await requireSignedInUser();
  await selectWorkspace(DEMO_WORKSPACE_ID);
  redirect("/schools");
}
