import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { getReadyDatabase } from "./db/server";
import { DEMO_WORKSPACE_ID, PERSONAL_WORKSPACE_ID } from "./db/seed";
import { workspaces } from "./db/schema";
import { getWorkspaceSnapshot } from "./workspaces";

export const ACTIVE_WORKSPACE_COOKIE = "college-essay-workspace";

export async function getActiveWorkspaceSnapshot() {
  const { db } = await getReadyDatabase();
  const cookieStore = await cookies();
  const requestedId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const requestedWorkspace = requestedId
    ? await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, requestedId)).then((rows) => rows[0])
    : null;
  const workspaceId = requestedWorkspace?.id ?? PERSONAL_WORKSPACE_ID;
  const snapshot = await getWorkspaceSnapshot(db, workspaceId);

  if (!snapshot) throw new Error(`Workspace ${workspaceId} was not initialized.`);
  return snapshot;
}

export function isDemoWorkspaceId(workspaceId: string) {
  return workspaceId === DEMO_WORKSPACE_ID;
}
