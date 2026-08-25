import type { AppDatabase } from "./client";
import { promptFamilies, promptTags } from "./schema";
import { PROMPT_FAMILIES, SECONDARY_TAGS } from "./taxonomy";

// The one shared example workspace. Personal workspaces are per user and their
// ids are derived from the user's - see personalWorkspaceId in users.ts.
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
        slug,
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
