import { eq } from "drizzle-orm";

import type { AppDatabase } from "./db/client";
import {
  assignedEssayResponses,
  essayFamilyLinks,
  essayPromptMatches,
  essayVersions,
  essays,
  promptFamilies,
  promptFamilyLinks,
  prompts,
  schools,
  workspaces,
} from "./db/schema";

function wordCount(content: string) {
  return content.trim() ? content.trim().split(/\s+/).length : 0;
}

export function getWorkspaceSnapshot(db: AppDatabase, workspaceId: string) {
  const workspace = db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get();
  if (!workspace) return null;

  const workspaceSchools = db.select().from(schools).where(eq(schools.workspaceId, workspaceId)).all();
  const workspacePrompts = db.select().from(prompts).where(eq(prompts.workspaceId, workspaceId)).all();
  const workspaceEssays = db.select().from(essays).where(eq(essays.workspaceId, workspaceId)).all();
  const workspaceFamilies = db.select().from(promptFamilies).where(eq(promptFamilies.workspaceId, workspaceId)).all();
  const versions = db.select().from(essayVersions).where(eq(essayVersions.workspaceId, workspaceId)).all();
  const familyPromptLinks = db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.workspaceId, workspaceId)).all();
  const familyEssayLinks = db.select().from(essayFamilyLinks).where(eq(essayFamilyLinks.workspaceId, workspaceId)).all();
  const assignments = db.select().from(assignedEssayResponses).where(eq(assignedEssayResponses.workspaceId, workspaceId)).all();
  const matches = db.select().from(essayPromptMatches).where(eq(essayPromptMatches.workspaceId, workspaceId)).all();

  return {
    workspace,
    stats: {
      schools: workspaceSchools.length,
      prompts: workspacePrompts.length,
      essays: workspaceEssays.length,
      assignments: assignments.length,
      strongMatches: matches.filter((match) => match.score >= 75).length,
    },
    schools: workspaceSchools.map((school) => ({
      ...school,
      promptCount: workspacePrompts.filter((prompt) => prompt.schoolId === school.id).length,
    })),
    prompts: workspacePrompts.map((prompt) => {
      const links = familyPromptLinks.filter((link) => link.promptId === prompt.id);
      const primaryLink = links.find((link) => link.isPrimary);
      return {
        ...prompt,
        primaryFamily: workspaceFamilies.find((family) => family.id === primaryLink?.familyId) ?? null,
        secondaryFamilies: links
          .filter((link) => !link.isPrimary)
          .map((link) => workspaceFamilies.find((family) => family.id === link.familyId))
          .filter((family): family is NonNullable<typeof family> => Boolean(family)),
      };
    }),
    essays: workspaceEssays.map((essay) => ({
      ...essay,
      wordCount: wordCount(essay.currentContent),
      versionCount: versions.filter((version) => version.essayId === essay.id).length,
      linkedPromptCount: assignments.filter((assignment) => assignment.essayId === essay.id).length,
    })),
    families: workspaceFamilies.map((family) => ({
      ...family,
      promptCount: familyPromptLinks.filter((link) => link.familyId === family.id).length,
      essayCount: familyEssayLinks.filter((link) => link.familyId === family.id).length,
    })),
    matches: matches.map((match) => ({
      ...match,
      essayTitle: workspaceEssays.find((essay) => essay.id === match.essayId)?.title ?? "Unknown essay",
      promptTitle: workspacePrompts.find((prompt) => prompt.id === match.promptId)?.title ?? "Unknown prompt",
      schoolName:
        workspaceSchools.find(
          (school) => school.id === workspacePrompts.find((prompt) => prompt.id === match.promptId)?.schoolId,
        )?.name ?? "Unknown school",
    })),
  };
}

export type WorkspaceSnapshot = NonNullable<ReturnType<typeof getWorkspaceSnapshot>>;
