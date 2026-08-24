import { eq } from "drizzle-orm";

import type { AppDatabase } from "./client";
import {
  applicationCycles,
  assignedEssayResponses,
  essayFamilyLinks,
  essayPromptMatches,
  essays,
  essayVersions,
  promptFamilies,
  promptFamilyLinks,
  prompts,
  promptTags,
  schools,
  workspaces,
} from "./schema";
import { PROMPT_FAMILIES, SECONDARY_TAGS } from "./taxonomy";

export const PERSONAL_WORKSPACE_ID = "workspace-personal";
export const DEMO_WORKSPACE_ID = "workspace-demo";

type InsertDatabase = Pick<AppDatabase, "insert">;

function familyId(workspaceId: string, slug: string) {
  return `${workspaceId}:family:${slug}`;
}

function countWords(content: string) {
  return content.trim() ? content.trim().split(/\s+/).length : 0;
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

const demoSchools = ["Northstar College", "Redwood Institute", "Lakeview University"] as const;

const demoPrompts = [
  ["core-story", "A story only you can tell", "Describe an experience that shaped how you understand yourself.", 650],
  ["identity-background", "Where you come from", "How has your background influenced the person you are becoming?", 400],
  ["community-contribution", "A community you changed", "Describe a community you belong to and how you contributed to it.", 350],
  ["challenge-growth", "Learning through difficulty", "Describe a setback and the growth that followed.", 400],
  ["intellectual-curiosity", "A question worth chasing", "What idea or question keeps drawing you back?", 300],
  ["why-major", "Your academic direction", "Why do you want to study your intended field?", 300],
  ["why-school", "Why Northstar", "Which Northstar programs and communities make this the right place for you?", 250],
  ["activities-impact", "Work that mattered", "Tell us about an activity where your initiative made a difference.", 300],
  ["values-meaning", "A changed perspective", "When did you reconsider an important belief?", 350],
  ["short-takes", "Small sources of joy", "List five ordinary things that bring you joy.", 75],
] as const;

const demoEssays = [
  ["kitchen-table", "The kitchen-table map", "Every Sunday, my family covered the kitchen table with transit maps. Tracing routes together taught me that listening is a form of navigation.", "ready"],
  ["robotics-repair", "The robot that would not turn", "Our robot spun in circles until I stopped defending my design and asked the newest teammate what she noticed. Her answer changed both the machine and my leadership.", "revising"],
  ["library-cards", "Library cards for the block", "I built a weekend sign-up table after learning that many neighbors assumed the library was not for them. Thirty-two new cards became thirty-two invitations.", "draft"],
  ["tidal-pools", "Questions in a tidal pool", "A shrinking tidal pool made me wonder how tiny ecosystems record a changing climate. I began photographing the same rocks each month and comparing what returned.", "draft"],
  ["translation", "Between two languages", "Translating for my grandmother taught me that accuracy is not enough; tone, patience, and context carry meaning too.", "ready"],
  ["northstar-lab", "At Northstar's Civic Systems Lab", "At Northstar College, I would bring my bus-access project to the Civic Systems Lab and learn from Professor Imani Reed.", "outline"],
] as const;

export function resetDemoWorkspace(db: AppDatabase) {
  db.transaction((tx) => {
    tx.delete(workspaces).where(eq(workspaces.id, DEMO_WORKSPACE_ID)).run();
    tx.insert(workspaces).values({ id: DEMO_WORKSPACE_ID, kind: "demo", name: "Fictional demo" }).run();
    seedTaxonomy(tx, DEMO_WORKSPACE_ID);

    const cycleId = `${DEMO_WORKSPACE_ID}:cycle:2026-27`;
    tx.insert(applicationCycles).values({
      id: cycleId,
      workspaceId: DEMO_WORKSPACE_ID,
      label: "2026–27",
      startYear: 2026,
      endYear: 2027,
      isActive: true,
    }).run();

    tx.insert(schools).values(
      demoSchools.map((name, index) => ({
        id: `${DEMO_WORKSPACE_ID}:school:${index + 1}`,
        workspaceId: DEMO_WORKSPACE_ID,
        cycleId,
        name,
        notes: "Synthetic school for demonstration only.",
      })),
    ).run();

    tx.insert(prompts).values(
      demoPrompts.map(([, title, promptText, maxWordCount], index) => ({
        id: `${DEMO_WORKSPACE_ID}:prompt:${index + 1}`,
        workspaceId: DEMO_WORKSPACE_ID,
        schoolId: `${DEMO_WORKSPACE_ID}:school:${(index % demoSchools.length) + 1}`,
        cycleId,
        title,
        promptText,
        maxWordCount,
        classificationConfidence: 92,
      })),
    ).run();

    tx.insert(promptFamilyLinks).values(
      demoPrompts.map(([slug], index) => ({
        id: `${DEMO_WORKSPACE_ID}:prompt-family:${index + 1}`,
        workspaceId: DEMO_WORKSPACE_ID,
        promptId: `${DEMO_WORKSPACE_ID}:prompt:${index + 1}`,
        familyId: familyId(DEMO_WORKSPACE_ID, slug),
        isPrimary: true,
      })),
    ).run();

    tx.insert(essays).values(
      demoEssays.map(([, title, currentContent, status], index) => ({
        id: `${DEMO_WORKSPACE_ID}:essay:${index + 1}`,
        workspaceId: DEMO_WORKSPACE_ID,
        title,
        currentContent,
        targetWordCount: index === 5 ? 250 : 400,
        status,
        designation: index === 5 ? "school-adaptation" as const : "canonical" as const,
        schoolSpecificPhrases: index === 5 ? ["Northstar College", "Civic Systems Lab", "Professor Imani Reed"] : [],
        notes: "Synthetic essay for demonstration only.",
      })),
    ).run();

    const versions = demoEssays.flatMap(([, , content], index) => {
      const base = {
        workspaceId: DEMO_WORKSPACE_ID,
        essayId: `${DEMO_WORKSPACE_ID}:essay:${index + 1}`,
      };
      const current = { ...base, id: `${base.essayId}:version:1`, versionNumber: 1, content, wordCount: countWords(content), reason: "Initial synthetic draft" };
      return index < 2
        ? [
            { ...current, content: content.split(". ")[0] + ".", wordCount: countWords(content.split(". ")[0] + ".") },
            { ...base, id: `${base.essayId}:version:2`, versionNumber: 2, content, wordCount: countWords(content), reason: "Added reflection" },
          ]
        : [current];
    });
    tx.insert(essayVersions).values(versions).run();

    const essayFamilySlugs = ["core-story", "activities-impact", "community-contribution", "intellectual-curiosity", "identity-background", "why-school"];
    tx.insert(essayFamilyLinks).values(
      essayFamilySlugs.map((slug, index) => ({
        id: `${DEMO_WORKSPACE_ID}:essay-family:${index + 1}`,
        workspaceId: DEMO_WORKSPACE_ID,
        essayId: `${DEMO_WORKSPACE_ID}:essay:${index + 1}`,
        familyId: familyId(DEMO_WORKSPACE_ID, slug),
        isPrimary: true,
      })),
    ).run();

    tx.insert(assignedEssayResponses).values([
      { id: `${DEMO_WORKSPACE_ID}:assignment:1`, workspaceId: DEMO_WORKSPACE_ID, promptId: `${DEMO_WORKSPACE_ID}:prompt:1`, essayId: `${DEMO_WORKSPACE_ID}:essay:1`, essayVersionId: `${DEMO_WORKSPACE_ID}:essay:1:version:2` },
      { id: `${DEMO_WORKSPACE_ID}:assignment:2`, workspaceId: DEMO_WORKSPACE_ID, promptId: `${DEMO_WORKSPACE_ID}:prompt:2`, essayId: `${DEMO_WORKSPACE_ID}:essay:1`, essayVersionId: `${DEMO_WORKSPACE_ID}:essay:1:version:2` },
    ]).run();

    tx.insert(essayPromptMatches).values([
      { id: `${DEMO_WORKSPACE_ID}:match:1`, workspaceId: DEMO_WORKSPACE_ID, essayId: `${DEMO_WORKSPACE_ID}:essay:1`, promptId: `${DEMO_WORKSPACE_ID}:prompt:1`, score: 91, matchedThemes: ["family", "growth"], missingRequirements: [], recommendedAction: "ready-to-reuse", explanation: "The core story directly answers the prompt." },
      { id: `${DEMO_WORKSPACE_ID}:match:2`, workspaceId: DEMO_WORKSPACE_ID, essayId: `${DEMO_WORKSPACE_ID}:essay:1`, promptId: `${DEMO_WORKSPACE_ID}:prompt:4`, score: 58, matchedThemes: ["growth"], missingRequirements: ["specific setback"], recommendedAction: "major-adaptation", explanation: "The reflection transfers, but the prompt requires a specific setback." },
      { id: `${DEMO_WORKSPACE_ID}:match:3`, workspaceId: DEMO_WORKSPACE_ID, essayId: `${DEMO_WORKSPACE_ID}:essay:6`, promptId: `${DEMO_WORKSPACE_ID}:prompt:7`, score: 35, matchedThemes: ["institutional fit"], missingRequirements: ["correct institution research"], schoolSpecificityRisk: "high", recommendedAction: "new-response", explanation: "Northstar-specific references make direct reuse dangerous." },
    ]).run();
  });
}
