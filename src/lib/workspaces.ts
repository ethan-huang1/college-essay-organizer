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
  /**
   * An essay prompt, as opposed to a supporting-material requirement.
   *
   * A graded paper, a writing sample and a caption per portfolio item are all
   * real application requirements a student has to see and track, but the
   * deliverable is not prose composed for this application. So they are counted
   * separately, never as essays: "1 of 2 essays done" must mean essays.
   */
  const isEssayPrompt = (prompt: (typeof workspacePrompts)[number]) => prompt.supportingMaterial === null;

  return {
    workspace,
    stats: {
      schools: workspaceSchools.length,
      // Current-cycle prompts only - a previous-cycle prompt is visible and
      // usable throughout the app, but must never count toward "how much
      // of this cycle's work is done."
      prompts: workspacePrompts.filter((prompt) => isCurrentCyclePrompt(prompt) && isEssayPrompt(prompt)).length,
      previousCyclePrompts: workspacePrompts.filter((prompt) => !isCurrentCyclePrompt(prompt) && isEssayPrompt(prompt)).length,
      // Tracked and shown, never counted as essay work.
      supportingMaterial: workspacePrompts.filter((prompt) => !isEssayPrompt(prompt)).length,
      essays: workspaceEssays.length,
      assignments: assignments.length,
      // No strongMatches count here. It hardcoded the top band's 70 floor, a
      // second copy of bandFromScore that also ignored the ceilings - a match
      // capped to new-response still counted as strong. Nothing read it.
    },
    schools: workspaceSchools.map((school) => {
      const schoolPrompts = workspacePrompts
        .filter((prompt) => prompt.schoolId === school.id)
        .filter(isEssayPrompt)
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
      // Supporting material carries no category links, so it cannot appear
      // here anyway; the filter states the intent rather than relying on that.
      const familyPrompts = workspacePrompts
        .filter((prompt) => linkedPromptIds.has(prompt.id) && isEssayPrompt(prompt))
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
