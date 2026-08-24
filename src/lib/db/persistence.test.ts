import { count, eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase, openDatabase } from "./client";
import {
  assignedEssayResponses,
  essayFamilyLinks,
  essayPromptMatches,
  essays,
  essayVersions,
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
});
