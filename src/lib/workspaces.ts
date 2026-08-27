import { eq } from "drizzle-orm";

import type { AppDatabase } from "./db/client";
import {
  applicationCycles,
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
import { CURRENT_CYCLE_LABEL } from "./cycle";
import { schoolCatalogueState } from "./schools";

function wordCount(content: string) {
  return content.trim() ? content.trim().split(/\s+/).length : 0;
}

export async function getWorkspaceSnapshot(db: AppDatabase, workspaceId: string) {
  const workspace = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).then((rows) => rows[0]);
  if (!workspace) return null;

  // One batch rather than eleven sequential round-trips. These reads are
  // independent of each other, and against a network database the difference
  // is most of the page-load budget.
  const [
    workspaceSchools,
    workspacePrompts,
    workspaceCycles,
    workspaceEssays,
    workspaceFamilies,
    versions,
    familyPromptLinks,
    familyEssayLinks,
    assignments,
    matches,
  ] = await Promise.all([
    db.select().from(schools).where(eq(schools.workspaceId, workspaceId)).execute(),
    db.select().from(prompts).where(eq(prompts.workspaceId, workspaceId)).execute(),
    db.select().from(applicationCycles).where(eq(applicationCycles.workspaceId, workspaceId)).execute(),
    db.select().from(essays).where(eq(essays.workspaceId, workspaceId)).execute(),
    db.select().from(promptFamilies).where(eq(promptFamilies.workspaceId, workspaceId)).execute(),
    db.select().from(essayVersions).where(eq(essayVersions.workspaceId, workspaceId)).execute(),
    db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.workspaceId, workspaceId)).execute(),
    db.select().from(essayFamilyLinks).where(eq(essayFamilyLinks.workspaceId, workspaceId)).execute(),
    db.select().from(assignedEssayResponses).where(eq(assignedEssayResponses.workspaceId, workspaceId)).execute(),
    db.select().from(essayPromptMatches).where(eq(essayPromptMatches.workspaceId, workspaceId)).execute(),
  ]);

  const cycleLabelById = new Map(workspaceCycles.map((cycle) => [cycle.id, cycle.label]));
  const isCurrentCyclePrompt = (prompt: (typeof workspacePrompts)[number]) =>
    (prompt.cycleId ? cycleLabelById.get(prompt.cycleId) : CURRENT_CYCLE_LABEL) === CURRENT_CYCLE_LABEL;

  return {
    workspace,
    stats: {
      schools: workspaceSchools.length,
      // Current-cycle prompts only - a previous-cycle prompt is visible and
      // usable throughout the app, but must never count toward "how much
      // of this cycle's work is done."
      prompts: workspacePrompts.filter(isCurrentCyclePrompt).length,
      previousCyclePrompts: workspacePrompts.filter((prompt) => !isCurrentCyclePrompt(prompt)).length,
      essays: workspaceEssays.length,
      assignments: assignments.length,
      // 70 is the top band's floor in matching.ts (see docs/reuse-scoring.md).
      // It was 80 while the top band was "ready to reuse"; that band no longer
      // exists, because essentially every reused essay needs some tailoring.
      strongMatches: matches.filter((match) => match.score >= 70).length,
    },
    schools: workspaceSchools.map((school) => {
      const schoolPrompts = workspacePrompts
        .filter((prompt) => prompt.schoolId === school.id)
        .map((prompt) => ({ isCurrentCycle: isCurrentCyclePrompt(prompt), verificationStatus: prompt.verificationStatus }));
      return {
        ...school,
        promptCount: schoolPrompts.length,
        // Never null, so no view has to invent a fallback for a college that
        // simply has nothing to answer.
        catalogueState: schoolCatalogueState(school.catalogueStatus, schoolPrompts),
      };
    }),
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
        // Capped before reuseCandidate sees it, so three strong-but-unusable
        // matches used to hide a genuinely reusable fourth. Eight is still a
        // short list and the UI shows far fewer.
        .slice(0, 8)
        .map((match) => ({
          essayId: match.essayId,
          essayTitle: workspaceEssays.find((essay) => essay.id === match.essayId)?.title ?? "Unknown essay",
          score: match.score,
          recommendedAction: match.recommendedAction,
        }));
      return {
        ...prompt,
        cycleLabel: prompt.cycleId ? (cycleLabelById.get(prompt.cycleId) ?? CURRENT_CYCLE_LABEL) : CURRENT_CYCLE_LABEL,
        isCurrentCycle: isCurrentCyclePrompt(prompt),
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
    matches: matches.map((match) => {
      const prompt = workspacePrompts.find((candidate) => candidate.id === match.promptId);
      const essay = workspaceEssays.find((candidate) => candidate.id === match.essayId);
      return {
        ...match,
        essayTitle: essay?.title ?? "Unknown essay",
        promptTitle: prompt?.title ?? "Unknown prompt",
        schoolName: workspaceSchools.find((school) => school.id === prompt?.schoolId)?.name ?? "Unknown school",
        // Carried so the UI can say "248 words -> cut to 150" rather than only
        // "needs adaptation". Derived at read time rather than stored on the
        // match row, so it cannot go stale against an edited essay.
        promptMaxWordCount: prompt?.maxWordCount ?? null,
        essayWordCount: essay ? wordCount(essay.currentContent) : 0,
      };
    }),
  };
}

export type WorkspaceSnapshot = NonNullable<Awaited<ReturnType<typeof getWorkspaceSnapshot>>>;
