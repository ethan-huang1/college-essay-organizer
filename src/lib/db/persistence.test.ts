import { count, eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase, openDatabase } from "./client";
import {
  assignedEssayResponses,
  essayFamilyLinks,
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
    const secondaryFamilies = connection.db
      .select({ id: promptFamilies.id })
      .from(promptFamilies)
      .where(inArray(promptFamilies.sortOrder, [2, 3]))
      .all();

    connection.db.insert(promptFamilyLinks).values(
      secondaryFamilies.map((family, index) => ({
        id: `${DEMO_WORKSPACE_ID}:manual-secondary:${index + 1}`,
        workspaceId: DEMO_WORKSPACE_ID,
        promptId,
        familyId: family.id,
        isPrimary: false,
        source: "manual" as const,
      })),
    ).run();
    connection.db.update(promptFamilyLinks)
      .set({ source: "manual" })
      .where(eq(promptFamilyLinks.id, `${DEMO_WORKSPACE_ID}:prompt-family:1`))
      .run();

    const links = connection.db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.promptId, promptId)).all();
    expect(links).toHaveLength(3);
    expect(links.filter((link) => link.isPrimary)).toHaveLength(1);
    expect(links.filter((link) => link.source === "manual")).toHaveLength(3);

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
});
