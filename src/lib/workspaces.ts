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
      const assignment = assignments.find((candidate) => candidate.promptId === prompt.id);
      const assignedEssay = assignment
        ? workspaceEssays.find((essay) => essay.id === assignment.essayId)
        : undefined;
      const suggestedMatches = matches
        .filter((match) => match.promptId === prompt.id && match.essayId !== assignment?.essayId)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((match) => ({
          essayId: match.essayId,
          essayTitle: workspaceEssays.find((essay) => essay.id === match.essayId)?.title ?? "Unknown essay",
          score: match.score,
          recommendedAction: match.recommendedAction,
        }));
      return {
        ...prompt,
        primaryFamily: workspaceFamilies.find((family) => family.id === primaryLink?.familyId) ?? null,
        secondaryFamilies: links
          .filter((link) => !link.isPrimary)
          .map((link) => workspaceFamilies.find((family) => family.id === link.familyId))
          .filter((family): family is NonNullable<typeof family> => Boolean(family)),
        assignedEssay: assignedEssay ? { id: assignedEssay.id, title: assignedEssay.title } : null,
        suggestedMatches,
      };
    }),
    essays: workspaceEssays.map((essay) => {
      const links = familyEssayLinks.filter((link) => link.essayId === essay.id);
      const primaryLink = links.find((link) => link.isPrimary);
      const essayVersionsDesc = versions
        .filter((version) => version.essayId === essay.id)
        .sort((a, b) => b.versionNumber - a.versionNumber);
      const linkedPrompts = assignments
        .filter((assignment) => assignment.essayId === essay.id)
        .map((assignment) => {
          const prompt = workspacePrompts.find((candidate) => candidate.id === assignment.promptId);
          const school = workspaceSchools.find((candidate) => candidate.id === prompt?.schoolId);
          return prompt ? { id: prompt.id, title: prompt.title, schoolName: school?.name ?? "Unknown school" } : null;
        })
        .filter((link): link is NonNullable<typeof link> => Boolean(link));
      return {
        ...essay,
        wordCount: wordCount(essay.currentContent),
        versionCount: essayVersionsDesc.length,
        versions: essayVersionsDesc,
        linkedPromptCount: linkedPrompts.length,
        linkedPrompts,
        primaryFamily: workspaceFamilies.find((family) => family.id === primaryLink?.familyId) ?? null,
        secondaryFamilies: links
          .filter((link) => !link.isPrimary)
          .map((link) => workspaceFamilies.find((family) => family.id === link.familyId))
          .filter((family): family is NonNullable<typeof family> => Boolean(family)),
      };
    }),
    families: workspaceFamilies.map((family) => {
      const linkedPromptIds = new Set(familyPromptLinks.filter((link) => link.familyId === family.id).map((link) => link.promptId));
      const familyPrompts = workspacePrompts
        .filter((prompt) => linkedPromptIds.has(prompt.id))
        .map((prompt) => ({
          id: prompt.id,
          title: prompt.title,
          schoolName: workspaceSchools.find((school) => school.id === prompt.schoolId)?.name ?? "Unknown school",
          maxWordCount: prompt.maxWordCount,
        }));
      return {
        ...family,
        promptCount: familyPrompts.length,
        essayCount: familyEssayLinks.filter((link) => link.familyId === family.id).length,
        prompts: familyPrompts,
      };
    }),
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
