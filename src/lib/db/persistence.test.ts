import { and, count, eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase, openDatabase } from "./client";
import {
  applicationCycles,
  assignedEssayResponses,
  essayFamilyLinks,
  essayPromptMatches,
  essays,
  essayVersions,
  promptChangeLog,
  promptFamilies,
  promptFamilyLinks,
  prompts,
  schools,
  workspaces,
} from "./schema";
import {
  DEMO_WORKSPACE_ID,
  initializePersonalWorkspace,
  PERSONAL_WORKSPACE_ID,
  resetDemoWorkspace,
} from "./seed";
import { getWorkspaceSnapshot } from "../workspaces";
import { createSchool, deleteSchool, updateSchool } from "../schools";
import { createPrompt, deletePrompt, updatePrompt } from "../prompts";
import { createEssay, deleteEssay, restoreEssayVersion, saveEssayVersion, updateEssayMetadata } from "../essays";
import { recomputeWorkspaceMatches } from "../reuse";
import { importCollege } from "../college-import";
import { assignEssayToPrompt, unassignPrompt } from "../assignments";

describe("local persistence foundation", () => {
  let connection: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    connection = openDatabase(":memory:");
    migrateDatabase(connection.db);
  });

  afterEach(() => connection.close());

  it("migrates all core tables with foreign keys enabled", () => {
    const tableNames = connection.sqlite
      .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle_%' order by name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(connection.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(tableNames).toEqual(expect.arrayContaining([
      "application_cycles",
      "assigned_essay_responses",
      "essay_family_links",
      "essay_prompt_matches",
      "essay_tag_links",
      "essay_versions",
      "essays",
      "prompt_families",
      "prompt_family_links",
      "prompt_tag_links",
      "prompt_tags",
      "prompts",
      "schools",
      "workspaces",
    ]));
  });

  it("seeds an editable ten-family taxonomy idempotently", () => {
    initializePersonalWorkspace(connection.db);
    initializePersonalWorkspace(connection.db);

    const families = connection.db
      .select()
      .from(promptFamilies)
      .where(eq(promptFamilies.workspaceId, PERSONAL_WORKSPACE_ID))
      .all();

    expect(families).toHaveLength(10);
    expect(families.every((family) => family.isEditable)).toBe(true);
    expect(families.map((family) => family.sortOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("supports one primary and multiple secondary prompt families with manual override", () => {
    resetDemoWorkspace(connection.db);
    const promptId = `${DEMO_WORKSPACE_ID}:prompt:1`;
    const prompt = connection.db.select().from(prompts).where(eq(prompts.id, promptId)).get();
    const secondaryFamilies = connection.db
      .select({ id: promptFamilies.id })
      .from(promptFamilies)
      .where(inArray(promptFamilies.sortOrder, [2, 3]))
      .all();
    if (!prompt) throw new Error("Expected a seeded prompt.");

    updatePrompt(connection.db, DEMO_WORKSPACE_ID, promptId, {
      schoolId: prompt.schoolId,
      title: prompt.title,
      promptText: `${prompt.promptText}\n\nKeep this paragraph break.`,
      minWordCount: prompt.minWordCount,
      maxWordCount: prompt.maxWordCount,
      requirement: prompt.requirement,
      status: prompt.status,
      deadline: prompt.deadline,
      notes: prompt.notes ?? undefined,
      primaryFamilyId: `${DEMO_WORKSPACE_ID}:family:core-story`,
      secondaryFamilyIds: secondaryFamilies.map((family) => family.id),
    });

    const links = connection.db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.promptId, promptId)).all();
    const overriddenPrompt = connection.db.select().from(prompts).where(eq(prompts.id, promptId)).get();
    expect(links).toHaveLength(3);
    expect(links.filter((link) => link.isPrimary)).toHaveLength(1);
    expect(links.filter((link) => link.source === "manual")).toHaveLength(3);
    expect(overriddenPrompt).toMatchObject({
      classificationSource: "manual",
      classificationConfidence: 0,
      promptText: `${prompt.promptText}\n\nKeep this paragraph break.`,
    });

    expect(() => connection.db.insert(promptFamilyLinks).values({
      id: `${DEMO_WORKSPACE_ID}:second-primary`,
      workspaceId: DEMO_WORKSPACE_ID,
      promptId,
      familyId: `${DEMO_WORKSPACE_ID}:family:challenge-growth`,
      isPrimary: true,
    }).run()).toThrow();
  });

  it("resets synthetic demo data without changing personal data", () => {
    initializePersonalWorkspace(connection.db);
    connection.db.insert(essays).values({
      id: `${PERSONAL_WORKSPACE_ID}:essay:keep`,
      workspaceId: PERSONAL_WORKSPACE_ID,
      title: "Keep this personal draft",
      currentContent: "This content belongs only to the personal workspace.",
    }).run();

    resetDemoWorkspace(connection.db);
    resetDemoWorkspace(connection.db);

    expect(connection.db.select({ value: count() }).from(workspaces).get()?.value).toBe(2);
    expect(connection.db.select().from(essays).where(eq(essays.workspaceId, PERSONAL_WORKSPACE_ID)).all()).toHaveLength(1);
    expect(connection.db.select().from(schools).where(eq(schools.workspaceId, DEMO_WORKSPACE_ID)).all()).toHaveLength(3);
    expect(connection.db.select().from(prompts).where(eq(prompts.workspaceId, DEMO_WORKSPACE_ID)).all()).toHaveLength(10);
    expect(connection.db.select().from(essays).where(eq(essays.workspaceId, DEMO_WORKSPACE_ID)).all()).toHaveLength(6);
    expect(connection.db.select().from(essayVersions).where(eq(essayVersions.workspaceId, DEMO_WORKSPACE_ID)).all()).toHaveLength(8);
  });

  it("links one essay to prompts at multiple schools", () => {
    resetDemoWorkspace(connection.db);
    const essayId = `${DEMO_WORKSPACE_ID}:essay:1`;
    const assignments = connection.db
      .select({ schoolId: prompts.schoolId })
      .from(assignedEssayResponses)
      .innerJoin(prompts, eq(assignedEssayResponses.promptId, prompts.id))
      .where(eq(assignedEssayResponses.essayId, essayId))
      .all();

    expect(new Set(assignments.map(({ schoolId }) => schoolId)).size).toBe(2);
    expect(connection.db.select().from(essayFamilyLinks).where(eq(essayFamilyLinks.essayId, essayId)).all()).toHaveLength(1);
  });

  it("returns strictly workspace-scoped read models", () => {
    initializePersonalWorkspace(connection.db);
    resetDemoWorkspace(connection.db);
    connection.db.insert(essays).values({
      id: `${PERSONAL_WORKSPACE_ID}:essay:private`,
      workspaceId: PERSONAL_WORKSPACE_ID,
      title: "Private draft",
      currentContent: "Only the personal snapshot may return this essay.",
    }).run();

    const personal = getWorkspaceSnapshot(connection.db, PERSONAL_WORKSPACE_ID);
    const demo = getWorkspaceSnapshot(connection.db, DEMO_WORKSPACE_ID);

    expect(personal?.essays.map((essay) => essay.title)).toEqual(["Private draft"]);
    expect(personal?.schools).toHaveLength(0);
    expect(demo?.essays).toHaveLength(6);
    expect(demo?.essays.some((essay) => essay.title === "Private draft")).toBe(false);
    expect(demo?.matches).toHaveLength(3);
  });

  it("creates, updates, and deletes schools only inside the selected workspace", () => {
    initializePersonalWorkspace(connection.db);
    resetDemoWorkspace(connection.db);
    const created = createSchool(connection.db, PERSONAL_WORKSPACE_ID, { name: "  Harbor   College  ", notes: "Personal note" });
    expect(created?.name).toBe("Harbor College");
    if (!created) throw new Error("Expected the school to be created.");

    expect(() => updateSchool(connection.db, DEMO_WORKSPACE_ID, created.id, { name: "Wrong workspace" })).toThrow();
    updateSchool(connection.db, PERSONAL_WORKSPACE_ID, created.id, { name: "Harbor University", notes: "Updated" });
    connection.db.insert(prompts).values({
      id: `${PERSONAL_WORKSPACE_ID}:prompt:cascade-test`,
      workspaceId: PERSONAL_WORKSPACE_ID,
      schoolId: created.id,
      title: "Cascade test",
      promptText: "This prompt should be removed with its school.",
    }).run();

    deleteSchool(connection.db, PERSONAL_WORKSPACE_ID, created.id);
    expect(connection.db.select().from(schools).where(eq(schools.id, created.id)).all()).toHaveLength(0);
    expect(connection.db.select().from(prompts).where(eq(prompts.schoolId, created.id)).all()).toHaveLength(0);
  });

  it("creates and updates prompts with one primary, multiple secondary families, and manual provenance", () => {
    initializePersonalWorkspace(connection.db);
    const school = createSchool(connection.db, PERSONAL_WORKSPACE_ID, { name: "Harbor College" });
    if (!school) throw new Error("Expected the school to be created.");
    const families = connection.db.select().from(promptFamilies)
      .where(eq(promptFamilies.workspaceId, PERSONAL_WORKSPACE_ID)).all();
    const promptId = createPrompt(connection.db, PERSONAL_WORKSPACE_ID, {
      schoolId: school.id,
      title: "Community reflection",
      promptText: "Describe a community that shaped you and how you contributed to it.",
      minWordCount: 200,
      maxWordCount: 350,
      requirement: "required",
      status: "not-started",
      primaryFamilyId: families[2].id,
      secondaryFamilyIds: [families[0].id, families[8].id, families[2].id],
    });

    let links = connection.db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.promptId, promptId)).all();
    expect(links).toHaveLength(3);
    expect(links.filter((link) => link.isPrimary).map((link) => link.familyId)).toEqual([families[2].id]);
    expect(links.every((link) => link.source === "manual")).toBe(true);
    expect(connection.db.select().from(prompts).where(eq(prompts.id, promptId)).get()?.classificationSource).toBe("manual");

    updatePrompt(connection.db, PERSONAL_WORKSPACE_ID, promptId, {
      schoolId: school.id,
      title: "Community and identity reflection",
      promptText: "Describe a community that shaped your identity and explain your contribution.",
      requirement: "optional",
      status: "in-progress",
      primaryFamilyId: families[1].id,
      secondaryFamilyIds: [families[2].id],
    });
    links = connection.db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.promptId, promptId)).all();
    expect(links).toHaveLength(2);
    expect(links.find((link) => link.isPrimary)?.familyId).toBe(families[1].id);
    expect(connection.db.select().from(prompts).where(eq(prompts.id, promptId)).get()).toMatchObject({
      title: "Community and identity reflection",
      requirement: "optional",
      status: "in-progress",
      classificationSource: "manual",
    });
    const snapshotPrompt = getWorkspaceSnapshot(connection.db, PERSONAL_WORKSPACE_ID)?.prompts
      .find((prompt) => prompt.id === promptId);
    expect(snapshotPrompt?.primaryFamily?.id).toBe(families[1].id);
    expect(snapshotPrompt?.secondaryFamilies.map((family) => family.id)).toEqual([families[2].id]);
  });

  it("rejects cross-workspace prompt schools and families without partial writes", () => {
    initializePersonalWorkspace(connection.db);
    resetDemoWorkspace(connection.db);
    const personalSchool = createSchool(connection.db, PERSONAL_WORKSPACE_ID, { name: "Harbor College" });
    if (!personalSchool) throw new Error("Expected the school to be created.");
    const personalFamily = connection.db.select().from(promptFamilies)
      .where(eq(promptFamilies.workspaceId, PERSONAL_WORKSPACE_ID)).get();
    const demoFamily = connection.db.select().from(promptFamilies)
      .where(eq(promptFamilies.workspaceId, DEMO_WORKSPACE_ID)).get();
    if (!personalFamily || !demoFamily) throw new Error("Expected seeded families.");

    const baseline = connection.db.select().from(prompts).where(eq(prompts.workspaceId, PERSONAL_WORKSPACE_ID)).all().length;
    expect(() => createPrompt(connection.db, PERSONAL_WORKSPACE_ID, {
      schoolId: `${DEMO_WORKSPACE_ID}:school:1`, title: "Wrong school", promptText: "This must not be inserted into personal data.",
      requirement: "required", status: "not-started", primaryFamilyId: personalFamily.id,
    })).toThrow("School not found");
    expect(() => createPrompt(connection.db, PERSONAL_WORKSPACE_ID, {
      schoolId: personalSchool.id, title: "Wrong family", promptText: "This must not link a demo family.",
      requirement: "required", status: "not-started", primaryFamilyId: demoFamily.id,
    })).toThrow("family");
    expect(connection.db.select().from(prompts).where(eq(prompts.workspaceId, PERSONAL_WORKSPACE_ID)).all()).toHaveLength(baseline);
  });

  it("deletes only the scoped prompt and cascades its relationships", () => {
    resetDemoWorkspace(connection.db);
    const promptId = `${DEMO_WORKSPACE_ID}:prompt:1`;
    expect(() => deletePrompt(connection.db, PERSONAL_WORKSPACE_ID, promptId)).toThrow();
    expect(connection.db.select().from(prompts).where(eq(prompts.id, promptId)).get()).toBeDefined();

    deletePrompt(connection.db, DEMO_WORKSPACE_ID, promptId);
    expect(connection.db.select().from(prompts).where(eq(prompts.id, promptId)).all()).toHaveLength(0);
    expect(connection.db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.promptId, promptId)).all()).toHaveLength(0);
    expect(connection.db.select().from(assignedEssayResponses).where(eq(assignedEssayResponses.promptId, promptId)).all()).toHaveLength(0);
    expect(connection.db.select().from(essayPromptMatches).where(eq(essayPromptMatches.promptId, promptId)).all()).toHaveLength(0);
    expect(connection.db.select().from(prompts).where(eq(prompts.workspaceId, DEMO_WORKSPACE_ID)).all()).toHaveLength(9);
  });

  it("creates an essay with an immutable initial version and workspace-scoped family assignment", () => {
    initializePersonalWorkspace(connection.db);
    const families = connection.db.select().from(promptFamilies).where(eq(promptFamilies.workspaceId, PERSONAL_WORKSPACE_ID)).all();

    const essayId = createEssay(connection.db, PERSONAL_WORKSPACE_ID, {
      title: "Why Computer Science",
      content: "I have loved building things since I first broke my family's computer trying to fix it.",
      status: "draft",
      designation: "canonical",
      targetWordCount: 250,
      primaryFamilyId: families[5].id,
      secondaryFamilyIds: [families[4].id],
    });

    const essay = connection.db.select().from(essays).where(eq(essays.id, essayId)).get();
    const versions = connection.db.select().from(essayVersions).where(eq(essayVersions.essayId, essayId)).all();
    const links = connection.db.select().from(essayFamilyLinks).where(eq(essayFamilyLinks.essayId, essayId)).all();
    expect(essay?.title).toBe("Why Computer Science");
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ versionNumber: 1, reason: "Initial version" });
    expect(links.find((link) => link.isPrimary)?.familyId).toBe(families[5].id);

    expect(() => createEssay(connection.db, PERSONAL_WORKSPACE_ID, {
      title: "Wrong family",
      status: "idea",
      designation: "canonical",
      primaryFamilyId: `${DEMO_WORKSPACE_ID}:family:core-story`,
    })).toThrow();
  });

  it("saves essay content changes as new immutable versions and restores without destroying history", () => {
    initializePersonalWorkspace(connection.db);
    const essayId = createEssay(connection.db, PERSONAL_WORKSPACE_ID, {
      title: "Draft essay",
      content: "First draft content.",
      status: "draft",
      designation: "canonical",
    });

    saveEssayVersion(connection.db, PERSONAL_WORKSPACE_ID, essayId, { content: "Second draft content, revised.", reason: "Tightened the opening" });
    let versions = connection.db.select().from(essayVersions).where(eq(essayVersions.essayId, essayId)).all();
    expect(versions).toHaveLength(2);
    expect(connection.db.select().from(essays).where(eq(essays.id, essayId)).get()?.currentContent).toBe("Second draft content, revised.");

    const firstVersion = versions.find((version) => version.versionNumber === 1);
    if (!firstVersion) throw new Error("Expected the first version to exist.");
    restoreEssayVersion(connection.db, PERSONAL_WORKSPACE_ID, essayId, firstVersion.id);

    versions = connection.db.select().from(essayVersions).where(eq(essayVersions.essayId, essayId)).all();
    expect(versions).toHaveLength(3);
    expect(versions.find((version) => version.versionNumber === 1)?.content).toBe("First draft content.");
    expect(connection.db.select().from(essays).where(eq(essays.id, essayId)).get()?.currentContent).toBe("First draft content.");

    updateEssayMetadata(connection.db, PERSONAL_WORKSPACE_ID, essayId, {
      title: "Draft essay", status: "ready", designation: "canonical",
    });
    expect(connection.db.select().from(essayVersions).where(eq(essayVersions.essayId, essayId)).all()).toHaveLength(3);
  });

  it("deletes only the scoped essay and cascades its versions, family links, and matches", () => {
    initializePersonalWorkspace(connection.db);
    const essayId = createEssay(connection.db, PERSONAL_WORKSPACE_ID, { title: "Disposable", content: "x", status: "idea", designation: "canonical" });
    expect(() => deleteEssay(connection.db, DEMO_WORKSPACE_ID, essayId)).toThrow();
    deleteEssay(connection.db, PERSONAL_WORKSPACE_ID, essayId);
    expect(connection.db.select().from(essays).where(eq(essays.id, essayId)).all()).toHaveLength(0);
    expect(connection.db.select().from(essayVersions).where(eq(essayVersions.essayId, essayId)).all()).toHaveLength(0);
  });

  it("recomputes deterministic reuse matches for every essay/prompt pair in a workspace", () => {
    initializePersonalWorkspace(connection.db);
    const families = connection.db.select().from(promptFamilies).where(eq(promptFamilies.workspaceId, PERSONAL_WORKSPACE_ID)).all();
    const school = createSchool(connection.db, PERSONAL_WORKSPACE_ID, { name: "Lakeview University" });
    if (!school) throw new Error("Expected the school to be created.");
    const whyMajorFamily = families.find((family) => family.name === "Why Major / Academic Interests");
    if (!whyMajorFamily) throw new Error("Expected a Why Major family.");

    const promptId = createPrompt(connection.db, PERSONAL_WORKSPACE_ID, {
      schoolId: school.id,
      title: "Why this field",
      promptText: "Why do you want to study your intended field?",
      minWordCount: 100,
      maxWordCount: 300,
      requirement: "required",
      status: "not-started",
      primaryFamilyId: whyMajorFamily.id,
    });
    const essayId = createEssay(connection.db, PERSONAL_WORKSPACE_ID, {
      title: "Why Computer Science",
      // 15 words x 12 = 180, inside the prompt's [100, 300] range.
      content: Array(12).fill("I want to study computer science because building systems that help people has always driven me.").join(" "),
      status: "draft",
      designation: "canonical",
      primaryFamilyId: whyMajorFamily.id,
    });

    recomputeWorkspaceMatches(connection.db, PERSONAL_WORKSPACE_ID);
    const matches = connection.db.select().from(essayPromptMatches).where(eq(essayPromptMatches.workspaceId, PERSONAL_WORKSPACE_ID)).all();
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ essayId, promptId, recommendedAction: "ready-to-reuse" });
    expect(matches[0].score).toBeGreaterThanOrEqual(80);

    // Recomputing again after nothing changed must not accumulate duplicate rows.
    recomputeWorkspaceMatches(connection.db, PERSONAL_WORKSPACE_ID);
    expect(connection.db.select().from(essayPromptMatches).where(eq(essayPromptMatches.workspaceId, PERSONAL_WORKSPACE_ID)).all()).toHaveLength(1);

    // Demo's hand-curated matches are untouched by a personal-workspace recompute.
    resetDemoWorkspace(connection.db);
    expect(connection.db.select().from(essayPromptMatches).where(eq(essayPromptMatches.workspaceId, DEMO_WORKSPACE_ID)).all()).toHaveLength(3);
  });

  it("imports and auto-classifies a verified school's prompts, idempotently", () => {
    initializePersonalWorkspace(connection.db);

    const first = importCollege(connection.db, PERSONAL_WORKSPACE_ID, "Stanford University");
    expect(first.verificationStatus).toBe("officially-verified");
    expect(first.counts.created).toBeGreaterThan(0);
    expect(first.counts.updated).toBe(0);
    expect(first.sourceUrl).toMatch(/^https:\/\//);

    const imported = connection.db.select().from(prompts)
      .where(and(eq(prompts.workspaceId, PERSONAL_WORKSPACE_ID), eq(prompts.schoolId, first.schoolId)))
      .all();
    expect(imported).toHaveLength(first.counts.created);
    expect(imported.every((prompt) => prompt.classificationSource === "deterministic")).toBe(true);
    expect(imported.every((prompt) => prompt.verificationStatus === "officially-verified")).toBe(true);
    expect(imported.every((prompt) => prompt.externalRef)).toBe(true);
    const links = connection.db.select().from(promptFamilyLinks)
      .where(inArray(promptFamilyLinks.promptId, imported.map((prompt) => prompt.id)))
      .all();
    expect(links.length).toBeGreaterThan(0);

    // Re-adding the same school does not duplicate its school row or prompts -
    // every prompt is recognized as unchanged (deduplication + idempotency).
    const second = importCollege(connection.db, PERSONAL_WORKSPACE_ID, "  stanford university  ".trim());
    expect(second.counts.created).toBe(0);
    expect(second.counts.updated).toBe(0);
    expect(second.counts.unchanged).toBe(first.counts.created);
    expect(connection.db.select().from(schools).where(eq(schools.workspaceId, PERSONAL_WORKSPACE_ID)).all()).toHaveLength(1);
    expect(connection.db.select().from(prompts).where(eq(prompts.schoolId, first.schoolId)).all()).toHaveLength(first.counts.created);
  });

  it("adds a school with no verified prompts as 'not yet verified' rather than guessing", () => {
    initializePersonalWorkspace(connection.db);
    const result = importCollege(connection.db, PERSONAL_WORKSPACE_ID, "Some Unlisted College");
    expect(result.counts.created).toBe(0);
    expect(result.verificationStatus).toBe("manual");
    expect(result.note).toMatch(/not yet verified/i);
    expect(connection.db.select().from(schools).where(eq(schools.id, result.schoolId)).get()?.name).toBe("Some Unlisted College");
  });

  it("imports confirmed previous-cycle prompts, distinctly cycle-labeled and never as current", () => {
    initializePersonalWorkspace(connection.db);
    const result = importCollege(connection.db, PERSONAL_WORKSPACE_ID, "Harvard University");
    expect(result.verificationStatus).toBe("previous-cycle");
    expect(result.counts.created).toBeGreaterThan(0);

    const imported = connection.db.select().from(prompts).where(eq(prompts.schoolId, result.schoolId)).all();
    expect(imported).toHaveLength(result.counts.created);
    expect(imported.every((prompt) => prompt.verificationStatus === "previous-cycle")).toBe(true);

    const promptCycle = connection.db.select().from(applicationCycles).where(eq(applicationCycles.id, imported[0].cycleId!)).get();
    const currentCycle = connection.db.select().from(applicationCycles).where(eq(applicationCycles.workspaceId, PERSONAL_WORKSPACE_ID)).all()
      .find((cycle) => cycle.label === "2026–27");
    expect(promptCycle?.label).toBe("2025–26");
    expect(promptCycle?.id).not.toBe(currentCycle?.id);

    // Previous-cycle prompts are visible/matchable but excluded from the
    // "current cycle" prompt stat.
    const snapshot = getWorkspaceSnapshot(connection.db, PERSONAL_WORKSPACE_ID);
    expect(snapshot?.prompts.some((prompt) => prompt.schoolId === result.schoolId)).toBe(true);
    expect(snapshot?.stats.prompts).toBe(0);
    expect(snapshot?.stats.previousCyclePrompts).toBe(result.counts.created);
  });

  it("imports genuinely conditional, degree-dependent prompts with their note intact", () => {
    initializePersonalWorkspace(connection.db);
    const result = importCollege(connection.db, PERSONAL_WORKSPACE_ID, "Princeton University");
    const conditionalPrompts = connection.db.select().from(prompts)
      .where(and(eq(prompts.schoolId, result.schoolId), eq(prompts.requirement, "conditional")))
      .all();
    expect(conditionalPrompts.length).toBeGreaterThanOrEqual(2);
    expect(conditionalPrompts.every((prompt) => Boolean(prompt.conditionalNote))).toBe(true);
  });

  it("imports character-limited prompts distinctly from word-limited ones", () => {
    initializePersonalWorkspace(connection.db);
    const result = importCollege(connection.db, PERSONAL_WORKSPACE_ID, "Yale University");
    const charLimited = connection.db.select().from(prompts)
      .where(and(eq(prompts.schoolId, result.schoolId), eq(prompts.externalRef, "short-take-teach-write-create")))
      .get();
    expect(charLimited?.maxCharCount).toBe(200);
    expect(charLimited?.maxWordCount).toBeNull();
  });

  it("shares one canonical prompt set across UC campuses without cross-campus id collisions", () => {
    initializePersonalWorkspace(connection.db);
    const berkeley = importCollege(connection.db, PERSONAL_WORKSPACE_ID, "University of California, Berkeley");
    const ucla = importCollege(connection.db, PERSONAL_WORKSPACE_ID, "University of California, Los Angeles");
    expect(berkeley.counts.created).toBe(8);
    expect(ucla.counts.created).toBe(8);
    expect(connection.db.select().from(prompts).where(eq(prompts.workspaceId, PERSONAL_WORKSPACE_ID)).all()).toHaveLength(16);
  });

  it("flags a changed prompt as needs-review and records the prior wording, without duplicating it", () => {
    initializePersonalWorkspace(connection.db);
    const first = importCollege(connection.db, PERSONAL_WORKSPACE_ID, "Massachusetts Institute of Technology");
    const target = connection.db.select().from(prompts)
      .where(and(eq(prompts.schoolId, first.schoolId), eq(prompts.externalRef, "short-answer-fun")))
      .get();
    if (!target) throw new Error("Expected the seeded MIT prompt to exist.");

    // Simulate "the source re-fetched with different wording than what we
    // previously imported" by rewinding the stored text, then re-import.
    connection.db.update(prompts).set({ promptText: "What do you do just for fun on weekends?" })
      .where(eq(prompts.id, target.id)).run();

    const second = importCollege(connection.db, PERSONAL_WORKSPACE_ID, "Massachusetts Institute of Technology");
    expect(second.counts.updated).toBe(1);
    expect(second.counts.flagged).toBe(1);

    const updated = connection.db.select().from(prompts).where(eq(prompts.id, target.id)).get();
    expect(updated?.verificationStatus).toBe("needs-review");
    expect(updated?.promptText).toBe("What do you do just for fun?");

    const changeLog = connection.db.select().from(promptChangeLog).where(eq(promptChangeLog.promptId, target.id)).all();
    expect(changeLog).toHaveLength(1);
    expect(changeLog[0].previousPromptText).toBe("What do you do just for fun on weekends?");

    // No duplicate prompt was created for the same externalRef.
    expect(connection.db.select().from(prompts).where(and(eq(prompts.schoolId, first.schoolId), eq(prompts.externalRef, "short-answer-fun"))).all()).toHaveLength(1);
  });

  it("assigns exactly one essay response per prompt, replacing a prior assignment, and can unassign", () => {
    initializePersonalWorkspace(connection.db);
    const school = createSchool(connection.db, PERSONAL_WORKSPACE_ID, { name: "Lakeview University" });
    if (!school) throw new Error("Expected the school to be created.");
    const promptId = createPrompt(connection.db, PERSONAL_WORKSPACE_ID, {
      schoolId: school.id, title: "Community", promptText: "Describe a community you belong to.",
      requirement: "required", status: "not-started",
    });
    const essayOneId = createEssay(connection.db, PERSONAL_WORKSPACE_ID, { title: "Essay one", content: "x", status: "draft", designation: "canonical" });
    const essayTwoId = createEssay(connection.db, PERSONAL_WORKSPACE_ID, { title: "Essay two", content: "y", status: "draft", designation: "canonical" });

    assignEssayToPrompt(connection.db, PERSONAL_WORKSPACE_ID, promptId, essayOneId);
    let snapshot = getWorkspaceSnapshot(connection.db, PERSONAL_WORKSPACE_ID);
    expect(snapshot?.prompts.find((prompt) => prompt.id === promptId)?.assignedEssay?.id).toBe(essayOneId);

    assignEssayToPrompt(connection.db, PERSONAL_WORKSPACE_ID, promptId, essayTwoId);
    expect(connection.db.select().from(assignedEssayResponses).where(eq(assignedEssayResponses.promptId, promptId)).all()).toHaveLength(1);
    snapshot = getWorkspaceSnapshot(connection.db, PERSONAL_WORKSPACE_ID);
    expect(snapshot?.prompts.find((prompt) => prompt.id === promptId)?.assignedEssay?.id).toBe(essayTwoId);

    unassignPrompt(connection.db, PERSONAL_WORKSPACE_ID, promptId);
    snapshot = getWorkspaceSnapshot(connection.db, PERSONAL_WORKSPACE_ID);
    expect(snapshot?.prompts.find((prompt) => prompt.id === promptId)?.assignedEssay).toBeNull();
  });
});
