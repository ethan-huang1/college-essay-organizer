import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, sessionUserId } from "./auth";
import { getAppDatabase } from "./db/server";
import { DEMO_WORKSPACE_ID } from "./db/seed";
import { ensurePersonalWorkspace, findUserById, personalWorkspaceId } from "./users";
import { getWorkspaceSnapshot } from "./workspaces";

export const ACTIVE_WORKSPACE_COOKIE = "college-essay-workspace";

/** The signed-in user, or null. Verifying the cookie needs no database read. */
export async function getSignedInUser() {
  const cookieStore = await cookies();
  const userId = sessionUserId(cookieStore.get(SESSION_COOKIE)?.value, process.env.AUTH_SECRET, Date.now());
  if (!userId) return null;
  // The cookie is signed, but the account it names may since have been deleted.
  return findUserById(getAppDatabase().db, userId);
}

/**
 * The signed-in user, or a redirect to sign-in. Redirecting rather than throwing
 * matters for the case where the cookie is validly signed but its account has
 * since been deleted (a restored backup, a switched database, a removed
 * account): that used to surface as a 500 on every route.
 */
export async function requireSignedInUser() {
  const user = await getSignedInUser();
  if (!user) redirect("/sign-in?error=expired");
  return user;
}

export async function getActiveWorkspaceSnapshot() {
  const user = await requireSignedInUser();
  const { db } = getAppDatabase();
  const ownWorkspaceId = personalWorkspaceId(user.id);

  // A user may only ever be in their OWN workspace or the shared example one.
  // The cookie is client-controlled, so it selects between those two rather
  // than naming a workspace id: otherwise anyone could read another account's
  // essays by editing a cookie value.
  const cookieStore = await cookies();
  const wantsDemo = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value === DEMO_WORKSPACE_ID;
  const workspaceId = wantsDemo ? DEMO_WORKSPACE_ID : ownWorkspaceId;

  let snapshot = await getWorkspaceSnapshot(db, workspaceId);

  // A personal workspace is created at sign-up, so a missing one means it went
  // away underneath a live session. Recreate it rather than failing until the
  // process recycles.
  if (!snapshot && workspaceId === ownWorkspaceId) {
    await ensurePersonalWorkspace(db, user.id);
    snapshot = await getWorkspaceSnapshot(db, workspaceId);
  }

  // The example workspace is seeded out of band and is never recreated by a
  // request - entering it must not rebuild it, because that rebuild is a
  // 19-college reimport that deletes whatever anyone else is looking at. If it
  // is genuinely absent, fall back to the user's own workspace instead of
  // throwing: an unseeded example is a deployment gap, not a reason to 500
  // every route for someone who only wanted to look around.
  if (!snapshot && workspaceId === DEMO_WORKSPACE_ID) {
    snapshot = await getWorkspaceSnapshot(db, ownWorkspaceId);
  }

  if (!snapshot) throw new Error(`Workspace ${workspaceId} was not initialized.`);
  return { ...snapshot, user };
}

/**
 * Refuses a write when the active workspace is the shared example.
 *
 * One example workspace row is shared by every account, so a write there is a
 * write to everyone's copy: one student editing "The Metronome" changes what
 * the next one reads. It is a showcase, not a sandbox, and the only safe answer
 * for a multi-user deployment is that it is read-only.
 *
 * Called by every action that mutates workspace data. Deliberately NOT called
 * by account deletion: which workspace someone happens to be viewing has no
 * bearing on their right to delete their own account, and the example row
 * belongs to nobody (userId is null) so it is outside that cascade anyway.
 */
export function requireWritableWorkspace(snapshot: { workspace: { kind: string } }) {
  if (snapshot.workspace.kind === "demo") {
    throw new Error("The example workspace is read-only. Switch to your own workspace to make changes.");
  }
}

export function isDemoWorkspaceId(workspaceId: string) {
  return workspaceId === DEMO_WORKSPACE_ID;
}
