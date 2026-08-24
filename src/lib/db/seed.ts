import type { AppDatabase } from "./client";
import {
  promptFamilies,
  promptTags,
  workspaces,
} from "./schema";
import { PROMPT_FAMILIES, SECONDARY_TAGS } from "./taxonomy";

export const PERSONAL_WORKSPACE_ID = "workspace-personal";
export const DEMO_WORKSPACE_ID = "workspace-demo";

type InsertDatabase = Pick<AppDatabase, "insert">;

function familyId(workspaceId: string, slug: string) {
  return `${workspaceId}:family:${slug}`;
}

export async function seedTaxonomy(db: InsertDatabase, workspaceId: string) {
  await db.insert(promptFamilies)
    .values(
      PROMPT_FAMILIES.map(([slug, name, description, color], index) => ({
        id: familyId(workspaceId, slug),
        workspaceId,
        name,
        description,
        color,
        sortOrder: index + 1,
      })),
    )
    .onConflictDoNothing()
    ;

  await db.insert(promptTags)
    .values(
      SECONDARY_TAGS.map((name) => ({
        id: `${workspaceId}:tag:${name.replaceAll(" ", "-")}`,
        workspaceId,
        name,
      })),
    )
    .onConflictDoNothing()
    ;
}

export async function initializePersonalWorkspace(db: AppDatabase) {
  await db.transaction(async (tx) => {
    await tx.insert(workspaces)
      .values({ id: PERSONAL_WORKSPACE_ID, kind: "personal", name: "My workspace" })
      .onConflictDoNothing()
      ;
    await seedTaxonomy(tx, PERSONAL_WORKSPACE_ID);
  });
}
