import { cookies } from "next/headers";

import { SESSION_COOKIE, sessionUserId } from "./auth";
import { getAppDatabase } from "./db/server";
import { DEMO_WORKSPACE_ID } from "./db/seed";
import { ensurePersonalWorkspace, findUserById, personalWorkspaceId } from "./users";
import { getWorkspaceSnapshot } from "./workspaces";

export const ACTIVE_WORKSPACE_COOKIE = "college-essay-workspace";

export class NotSignedInError extends Error {
  constructor() {
    super("Not signed in.");
    this.name = "NotSignedInError";
  }
}

/** The signed-in user, or null. Verifying the cookie needs no database read. */
export async function getSignedInUser() {
  const cookieStore = await cookies();
  const userId = sessionUserId(cookieStore.get(SESSION_COOKIE)?.value, process.env.AUTH_SECRET, Date.now());
  if (!userId) return null;
  // The cookie is signed, but the account it names may since have been deleted.
  return findUserById(getAppDatabase().db, userId);
}

export async function requireSignedInUser() {
  const user = await getSignedInUser();
  if (!user) throw new NotSignedInError();
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

  if (!snapshot) throw new Error(`Workspace ${workspaceId} was not initialized.`);
  return { ...snapshot, user };
}

export function isDemoWorkspaceId(workspaceId: string) {
  return workspaceId === DEMO_WORKSPACE_ID;
}
