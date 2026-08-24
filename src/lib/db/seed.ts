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

export function seedTaxonomy(db: InsertDatabase, workspaceId: string) {
  db.insert(promptFamilies)
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
    .run();

  db.insert(promptTags)
    .values(
      SECONDARY_TAGS.map((name) => ({
        id: `${workspaceId}:tag:${name.replaceAll(" ", "-")}`,
        workspaceId,
        name,
      })),
    )
    .onConflictDoNothing()
    .run();
}

export function initializePersonalWorkspace(db: AppDatabase) {
  db.transaction((tx) => {
    tx.insert(workspaces)
      .values({ id: PERSONAL_WORKSPACE_ID, kind: "personal", name: "My workspace" })
      .onConflictDoNothing()
      .run();
    seedTaxonomy(tx, PERSONAL_WORKSPACE_ID);
  });
}
