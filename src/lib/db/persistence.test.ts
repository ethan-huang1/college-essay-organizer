import { and, count, eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type AppDatabase, openTestDatabase } from "./client";
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
  users,
  workspaces,
} from "./schema";
import {
  DEMO_ESSAYS,
  DEMO_SCHOOLS,
  DEMO_WORKSPACE_NAME,
  resetDemoWorkspace,
} from "./demo-workspace";
import { DEMO_WORKSPACE_ID } from "./seed";
import { ensurePersonalWorkspace } from "../users";
import { getWorkspaceSnapshot } from "../workspaces";
import { createSchool, deleteSchool, updateSchool } from "../schools";
import { createPrompt, deletePrompt, updatePrompt } from "../prompts";
import { createEssay, deleteEssay, restoreEssayVersion, saveEssayVersion, updateEssayMetadata } from "../essays";
import { recomputeWorkspaceMatches } from "../reuse";
import { importCollege } from "../college-import";
import { assignEssayToPrompt, unassignPrompt } from "../assignments";

// The demo workspace is built through the real import pipeline, so its rows
// carry generated ids - these resolve the anchors the tests need by name.
async function demoEssayIdByTitle(db: AppDatabase, title: string) {
  const [essay] = await db.select({ id: essays.id }).from(essays)
    .where(and(eq(essays.workspaceId, DEMO_WORKSPACE_ID), eq(essays.title, title)));
  if (!essay) throw new Error(`Expected a demo essay titled "${title}".`);
  return essay.id;
}

async function demoSchoolId(db: AppDatabase) {
  const [school] = await db.select({ id: schools.id }).from(schools).where(eq(schools.workspaceId, DEMO_WORKSPACE_ID));
  if (!school) throw new Error("Expected the demo workspace to have schools.");
  return school.id;
}

describe("local persistence foundation", () => {
  let connection: ReturnType<typeof openTestDatabase>;

  // Personal workspaces belong to a user now, so each test signs one up. The
  // id is derived from the user's, which is what keeps workspace resolution a
  // pure function of the session.
  let PERSONAL: string;

  beforeEach(async () => {
    // PGlite: real Postgres in-process, migrated from the committed SQL, so
    // each test gets a throwaway database on the dialect we deploy on.
    connection = openTestDatabase();
    await connection.migrate();
    // The user row is inserted directly rather than through createUser: these
    // tests are about workspace-scoped persistence, and paying production-cost
    // scrypt hashing in all 23 setups tripled the suite's runtime. Account
    // creation and password hashing are covered by users.test.ts.
    const userId = crypto.randomUUID();
    await connection.db.insert(users).values({
      id: userId,
      email: "student@example.com",
      passwordHash: "scrypt$16384$8$1$dGVzdA$dGVzdA",
    });
    PERSONAL = await ensurePersonalWorkspace(connection.db, userId);
  });

  afterEach(async () => { await connection.close(); });

  it("migrates all core tables with foreign keys enforced", async () => {
    const tables = await connection.client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' and table_name not like '__drizzle%' order by table_name",
    );
    const tableNames = tables.rows.map((row) => row.table_name);

    // Postgres always enforces declared foreign keys; assert the constraints
    // actually landed rather than a pragma that has no equivalent.
    const foreignKeys = await connection.client.query<{ count: string }>(
      "select count(*)::text as count from information_schema.table_constraints where constraint_type = 'FOREIGN KEY' and table_schema = 'public'",
    );
    expect(Number(foreignKeys.rows[0].count)).toBeGreaterThan(0);
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

  it("seeds an editable ten-family taxonomy idempotently", async () => {

    const families = await connection.db
      .select()
      .from(promptFamilies)
      .where(eq(promptFamilies.workspaceId, PERSONAL));

    expect(families).toHaveLength(10);
    expect(families.every((family) => family.isEditable)).toBe(true);
    expect(families.map((family) => family.sortOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("supports one primary and multiple secondary prompt families with manual override", async () => {
    await resetDemoWorkspace(connection.db);
    // A required prompt: this test is about family override, and re-saving a
    // conditional prompt would additionally demand its conditional note.
    const prompt = await connection.db.select().from(prompts)
      .where(and(eq(prompts.workspaceId, DEMO_WORKSPACE_ID), eq(prompts.requirement, "required"))).then((rows) => rows[0]);
    if (!prompt) throw new Error("Expected a seeded prompt.");
    const promptId = prompt.id;
    const secondaryFamilies = await connection.db
      .select({ id: promptFamilies.id })
      .from(promptFamilies)
      .where(and(eq(promptFamilies.workspaceId, DEMO_WORKSPACE_ID), inArray(promptFamilies.sortOrder, [2, 3])));

    await updatePrompt(connection.db, DEMO_WORKSPACE_ID, promptId, {
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

    const links = await connection.db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.promptId, promptId));
    const overriddenPrompt = await connection.db.select().from(prompts).where(eq(prompts.id, promptId)).then((rows) => rows[0]);
    expect(links).toHaveLength(3);
    expect(links.filter((link) => link.isPrimary)).toHaveLength(1);
    expect(links.filter((link) => link.source === "manual")).toHaveLength(3);
    expect(overriddenPrompt).toMatchObject({
      classificationSource: "manual",
      classificationConfidence: 0,
      promptText: `${prompt.promptText}\n\nKeep this paragraph break.`,
    });

    // The partial unique index has to reject a second primary category in
    // Postgres exactly as it did in SQLite.
    await expect(connection.db.insert(promptFamilyLinks).values({
      id: `${DEMO_WORKSPACE_ID}:second-primary`,
      workspaceId: DEMO_WORKSPACE_ID,
      promptId,
      familyId: `${DEMO_WORKSPACE_ID}:family:challenge-growth`,
      isPrimary: true,
    })).rejects.toThrow();
  });

  it("resets the example demo workspace without changing personal data", async () => {
    await connection.db.insert(essays).values({
      id: `${PERSONAL}:essay:keep`,
      workspaceId: PERSONAL,
      title: "Keep this personal draft",
      currentContent: "This content belongs only to the personal workspace.",
    });

    const first = await resetDemoWorkspace(connection.db);
    const second = await resetDemoWorkspace(connection.db);

    // Rebuilding twice must land on exactly the same workspace, not double it.
    expect(second).toEqual(first);
    expect((await connection.db.select({ value: count() }).from(workspaces).then((rows) => rows[0]))?.value).toBe(2);
    expect((await connection.db.select().from(workspaces).where(eq(workspaces.id, DEMO_WORKSPACE_ID)).then((rows) => rows[0]))?.name).toBe(DEMO_WORKSPACE_NAME);
    expect(await connection.db.select().from(essays).where(eq(essays.workspaceId, PERSONAL))).toHaveLength(1);
    expect(await connection.db.select().from(schools).where(eq(schools.workspaceId, PERSONAL))).toHaveLength(0);

    // The reported summary has to match what actually landed in the database.
    const demoSchools = await connection.db.select().from(schools).where(eq(schools.workspaceId, DEMO_WORKSPACE_ID));
    const demoPrompts = await connection.db.select().from(prompts).where(eq(prompts.workspaceId, DEMO_WORKSPACE_ID));
    const demoEssays = await connection.db.select().from(essays).where(eq(essays.workspaceId, DEMO_WORKSPACE_ID));
    expect(demoSchools).toHaveLength(DEMO_SCHOOLS.length);
    expect(demoEssays).toHaveLength(DEMO_ESSAYS.length);
    expect(first.schools).toBe(demoSchools.length);
    expect(first.prompts).toBe(demoPrompts.length);
    expect(first.essays).toBe(demoEssays.length);
    expect(first.assignments).toBe(
      ((await connection.db.select().from(assignedEssayResponses).where(eq(assignedEssayResponses.workspaceId, DEMO_WORKSPACE_ID)))).length,
    );
    // Every planned assignment must land on a distinct prompt; a collision
    // would silently replace one demo essay's response with another's.
    expect(first.assignments).toBe(7);

    // The point of the example workspace is realistic scale.
    expect(demoPrompts.length).toBeGreaterThan(80);
    const demoSchoolIds = new Set(demoSchools.map((school) => school.id));
    expect(demoPrompts.every((prompt) => demoSchoolIds.has(prompt.schoolId))).toBe(true);

    // One immutable version per essay, plus one more for each declared revision.
    const expectedVersions = DEMO_ESSAYS.length + DEMO_ESSAYS.filter((essay) => essay.revision).length;
    expect(await connection.db.select().from(essayVersions).where(eq(essayVersions.workspaceId, DEMO_WORKSPACE_ID))).toHaveLength(expectedVersions);
    expect(DEMO_ESSAYS.filter((essay) => essay.revision).length).toBeGreaterThanOrEqual(2);

    // Demo essays must never read as the student's own work.
    expect(demoEssays.every((essay) => (essay.notes ?? "").includes("not your writing"))).toBe(true);
  });

  it("covers every taxonomy category and every reuse recommendation in the demo workspace", async () => {
    await resetDemoWorkspace(connection.db);

    const classified = await connection.db
      .select({ familyName: promptFamilies.name })
      .from(promptFamilyLinks)
      .innerJoin(promptFamilies, eq(promptFamilies.id, promptFamilyLinks.familyId))
      .where(and(eq(promptFamilyLinks.workspaceId, DEMO_WORKSPACE_ID), eq(promptFamilyLinks.isPrimary, true)));
    const demoFamilies = await connection.db.select().from(promptFamilies).where(eq(promptFamilies.workspaceId, DEMO_WORKSPACE_ID));
    expect(new Set(classified.map((row) => row.familyName)).size).toBe(demoFamilies.length);

    // Strong reuse, substantial adaptation, and a dangerous institution-
    // specific reuse case all have to be demonstrable (MVP_SPEC section 6).
    const matches = await connection.db.select().from(essayPromptMatches).where(eq(essayPromptMatches.workspaceId, DEMO_WORKSPACE_ID));
    const actions = new Set(matches.map((match) => match.recommendedAction));
    expect(actions.has("ready-to-reuse")).toBe(true);
    expect(actions.has("major-adaptation")).toBe(true);
    expect(matches.some((match) => match.schoolSpecificityRisk === "high")).toBe(true);

    const statuses = await connection.db.select({ status: prompts.status }).from(prompts).where(eq(prompts.workspaceId, DEMO_WORKSPACE_ID));
    expect(statuses.some((row) => row.status === "complete")).toBe(true);
    expect(statuses.some((row) => row.status === "in-progress")).toBe(true);
    expect(statuses.some((row) => row.status === "not-started")).toBe(true);
  });

  it("links one essay to prompts at multiple schools", async () => {
    await resetDemoWorkspace(connection.db);
    const essayId = await demoEssayIdByTitle(connection.db, "The Metronome");
    const assignments = await connection.db
      .select({ schoolId: prompts.schoolId })
      .from(assignedEssayResponses)
      .innerJoin(prompts, eq(assignedEssayResponses.promptId, prompts.id))
      .where(eq(assignedEssayResponses.essayId, essayId));

    expect(new Set(assignments.map(({ schoolId }) => schoolId)).size).toBe(2);
    expect(await connection.db.select().from(essayFamilyLinks).where(eq(essayFamilyLinks.essayId, essayId))).toHaveLength(1);
  });

  it("returns strictly workspace-scoped read models", async () => {
    await resetDemoWorkspace(connection.db);
    await connection.db.insert(essays).values({
      id: `${PERSONAL}:essay:private`,
      workspaceId: PERSONAL,
      title: "Private draft",
      currentContent: "Only the personal snapshot may return this essay.",
    });

    const personal = await getWorkspaceSnapshot(connection.db, PERSONAL);
    const demo = await getWorkspaceSnapshot(connection.db, DEMO_WORKSPACE_ID);

    expect(personal?.essays.map((essay) => essay.title)).toEqual(["Private draft"]);
    expect(personal?.schools).toHaveLength(0);
    expect(personal?.matches).toHaveLength(0);
    expect(demo?.essays).toHaveLength(DEMO_ESSAYS.length);
    expect(demo?.essays.some((essay) => essay.title === "Private draft")).toBe(false);
    // Every demo essay is scored against every demo prompt.
    expect(demo?.matches).toHaveLength(DEMO_ESSAYS.length * (demo?.prompts.length ?? 0));
  });

  it("creates, updates, and deletes schools only inside the selected workspace", async () => {
    await resetDemoWorkspace(connection.db);
    const created = await createSchool(connection.db, PERSONAL, { name: "  Harbor   College  ", notes: "Personal note" });
    expect(created?.name).toBe("Harbor College");
    if (!created) throw new Error("Expected the school to be created.");

    await expect(updateSchool(connection.db, DEMO_WORKSPACE_ID, created.id, { name: "Wrong workspace" })).rejects.toThrow();
    await updateSchool(connection.db, PERSONAL, created.id, { name: "Harbor University", notes: "Updated" });
    await connection.db.insert(prompts).values({
      id: `${PERSONAL}:prompt:cascade-test`,
      workspaceId: PERSONAL,
      schoolId: created.id,
      title: "Cascade test",
      promptText: "This prompt should be removed with its school.",
    });

    await deleteSchool(connection.db, PERSONAL, created.id);
    expect(await connection.db.select().from(schools).where(eq(schools.id, created.id))).toHaveLength(0);
    expect(await connection.db.select().from(prompts).where(eq(prompts.schoolId, created.id))).toHaveLength(0);
  });

  it("creates and updates prompts with one primary, multiple secondary families, and manual provenance", async () => {
    const school = await createSchool(connection.db, PERSONAL, { name: "Harbor College" });
    if (!school) throw new Error("Expected the school to be created.");
    const families = await connection.db.select().from(promptFamilies)
      .where(eq(promptFamilies.workspaceId, PERSONAL));
    const promptId = await createPrompt(connection.db, PERSONAL, {
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

    let links = await connection.db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.promptId, promptId));
    expect(links).toHaveLength(3);
    expect(links.filter((link) => link.isPrimary).map((link) => link.familyId)).toEqual([families[2].id]);
    expect(links.every((link) => link.source === "manual")).toBe(true);
    expect((await connection.db.select().from(prompts).where(eq(prompts.id, promptId)).then((rows) => rows[0]))?.classificationSource).toBe("manual");

    await updatePrompt(connection.db, PERSONAL, promptId, {
      schoolId: school.id,
      title: "Community and identity reflection",
      promptText: "Describe a community that shaped your identity and explain your contribution.",
      requirement: "optional",
      status: "in-progress",
      primaryFamilyId: families[1].id,
      secondaryFamilyIds: [families[2].id],
    });
    links = await connection.db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.promptId, promptId));
    expect(links).toHaveLength(2);
    expect(links.find((link) => link.isPrimary)?.familyId).toBe(families[1].id);
    expect(await connection.db.select().from(prompts).where(eq(prompts.id, promptId)).then((rows) => rows[0])).toMatchObject({
      title: "Community and identity reflection",
      requirement: "optional",
      status: "in-progress",
      classificationSource: "manual",
    });
    const snapshotPrompt = (await getWorkspaceSnapshot(connection.db, PERSONAL))?.prompts
      .find((prompt) => prompt.id === promptId);
    expect(snapshotPrompt?.primaryFamily?.id).toBe(families[1].id);
    expect(snapshotPrompt?.secondaryFamilies.map((family) => family.id)).toEqual([families[2].id]);
  });

  it("rejects cross-workspace prompt schools and families without partial writes", async () => {
    await resetDemoWorkspace(connection.db);
    const personalSchool = await createSchool(connection.db, PERSONAL, { name: "Harbor College" });
    if (!personalSchool) throw new Error("Expected the school to be created.");
    const personalFamily = await connection.db.select().from(promptFamilies)
      .where(eq(promptFamilies.workspaceId, PERSONAL)).then((rows) => rows[0]);
    const demoFamily = await connection.db.select().from(promptFamilies)
      .where(eq(promptFamilies.workspaceId, DEMO_WORKSPACE_ID)).then((rows) => rows[0]);
    if (!personalFamily || !demoFamily) throw new Error("Expected seeded families.");

    const baseline = (await connection.db.select().from(prompts).where(eq(prompts.workspaceId, PERSONAL))).length;
    await expect(createPrompt(connection.db, PERSONAL, {
      schoolId: await demoSchoolId(connection.db), title: "Wrong school", promptText: "This must not be inserted into personal data.",
      requirement: "required", status: "not-started", primaryFamilyId: personalFamily.id,
    })).rejects.toThrow("School not found");
    await expect(createPrompt(connection.db, PERSONAL, {
      schoolId: personalSchool.id, title: "Wrong family", promptText: "This must not link a demo family.",
      requirement: "required", status: "not-started", primaryFamilyId: demoFamily.id,
    })).rejects.toThrow("family");
    expect(await connection.db.select().from(prompts).where(eq(prompts.workspaceId, PERSONAL))).toHaveLength(baseline);
  });

  it("deletes only the scoped prompt and cascades its relationships", async () => {
    await resetDemoWorkspace(connection.db);
    // An assigned prompt, so the cascade has a family link, an assignment, and
    // matches to remove.
    const [firstAssignment] = await connection.db.select({ promptId: assignedEssayResponses.promptId })
      .from(assignedEssayResponses)
      .where(eq(assignedEssayResponses.workspaceId, DEMO_WORKSPACE_ID));
    const promptId = firstAssignment?.promptId;
    if (!promptId) throw new Error("Expected the demo workspace to assign at least one prompt.");
    const before = (await connection.db.select().from(prompts).where(eq(prompts.workspaceId, DEMO_WORKSPACE_ID))).length;
    expect((await connection.db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.promptId, promptId))).length).toBeGreaterThan(0);
    expect((await connection.db.select().from(essayPromptMatches).where(eq(essayPromptMatches.promptId, promptId))).length).toBeGreaterThan(0);

    await expect(deletePrompt(connection.db, PERSONAL, promptId)).rejects.toThrow();
    expect(await connection.db.select().from(prompts).where(eq(prompts.id, promptId)).then((rows) => rows[0])).toBeDefined();

    await deletePrompt(connection.db, DEMO_WORKSPACE_ID, promptId);
    expect(await connection.db.select().from(prompts).where(eq(prompts.id, promptId))).toHaveLength(0);
    expect(await connection.db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.promptId, promptId))).toHaveLength(0);
    expect(await connection.db.select().from(assignedEssayResponses).where(eq(assignedEssayResponses.promptId, promptId))).toHaveLength(0);
    expect(await connection.db.select().from(essayPromptMatches).where(eq(essayPromptMatches.promptId, promptId))).toHaveLength(0);
    expect(await connection.db.select().from(prompts).where(eq(prompts.workspaceId, DEMO_WORKSPACE_ID))).toHaveLength(before - 1);
  });

  it("creates an essay with an immutable initial version and workspace-scoped family assignment", async () => {
    const families = await connection.db.select().from(promptFamilies).where(eq(promptFamilies.workspaceId, PERSONAL));

    const essayId = await createEssay(connection.db, PERSONAL, {
      title: "Why Computer Science",
      content: "I have loved building things since I first broke my family's computer trying to fix it.",
      status: "draft",
      designation: "canonical",
      targetWordCount: 250,
      primaryFamilyId: families[5].id,
      secondaryFamilyIds: [families[4].id],
    });

    const essay = await connection.db.select().from(essays).where(eq(essays.id, essayId)).then((rows) => rows[0]);
    const versions = await connection.db.select().from(essayVersions).where(eq(essayVersions.essayId, essayId));
    const links = await connection.db.select().from(essayFamilyLinks).where(eq(essayFamilyLinks.essayId, essayId));
    expect(essay?.title).toBe("Why Computer Science");
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ versionNumber: 1, reason: "Initial version" });
    expect(links.find((link) => link.isPrimary)?.familyId).toBe(families[5].id);

    // The essay form no longer offers a secondary-category picker, so a
    // metadata save omits the key entirely. That must keep the secondaries the
    // importer derived - only an explicit [] clears them.
    await updateEssayMetadata(connection.db, PERSONAL, essayId, {
      title: "Why Computer Science",
      status: "draft",
      designation: "canonical",
      primaryFamilyId: families[6].id,
    });
    const preserved = await connection.db.select().from(essayFamilyLinks).where(eq(essayFamilyLinks.essayId, essayId));
    expect(preserved.find((link) => link.isPrimary)?.familyId).toBe(families[6].id);
    expect(preserved.filter((link) => !link.isPrimary).map((link) => link.familyId)).toEqual([families[4].id]);

    // Promoting a preserved secondary to primary must not trip
    // essay_family_pair_unique.
    await updateEssayMetadata(connection.db, PERSONAL, essayId, {
      title: "Why Computer Science",
      status: "draft",
      designation: "canonical",
      primaryFamilyId: families[4].id,
    });
    const promoted = await connection.db.select().from(essayFamilyLinks).where(eq(essayFamilyLinks.essayId, essayId));
    expect(promoted).toHaveLength(1);
    expect(promoted[0]).toMatchObject({ familyId: families[4].id, isPrimary: true });

    await updateEssayMetadata(connection.db, PERSONAL, essayId, {
      title: "Why Computer Science",
      status: "draft",
      designation: "canonical",
      primaryFamilyId: families[6].id,
      secondaryFamilyIds: [],
    });
    expect(await connection.db.select().from(essayFamilyLinks).where(eq(essayFamilyLinks.essayId, essayId))).toHaveLength(1);

    await expect(createEssay(connection.db, PERSONAL, {
      title: "Wrong family",
      status: "idea",
      designation: "canonical",
      primaryFamilyId: `${DEMO_WORKSPACE_ID}:family:core-story`,
    })).rejects.toThrow();
  });

  it("saves essay content changes as new immutable versions and restores without destroying history", async () => {
    const essayId = await createEssay(connection.db, PERSONAL, {
      title: "Draft essay",
      content: "First draft content.",
      status: "draft",
      designation: "canonical",
    });

    await saveEssayVersion(connection.db, PERSONAL, essayId, { content: "Second draft content, revised.", reason: "Tightened the opening" });
    let versions = await connection.db.select().from(essayVersions).where(eq(essayVersions.essayId, essayId));
    expect(versions).toHaveLength(2);
    expect((await connection.db.select().from(essays).where(eq(essays.id, essayId)).then((rows) => rows[0]))?.currentContent).toBe("Second draft content, revised.");

    const firstVersion = versions.find((version) => version.versionNumber === 1);
    if (!firstVersion) throw new Error("Expected the first version to exist.");
    await restoreEssayVersion(connection.db, PERSONAL, essayId, firstVersion.id);

    versions = await connection.db.select().from(essayVersions).where(eq(essayVersions.essayId, essayId));
    expect(versions).toHaveLength(3);
    expect(versions.find((version) => version.versionNumber === 1)?.content).toBe("First draft content.");
    expect((await connection.db.select().from(essays).where(eq(essays.id, essayId)).then((rows) => rows[0]))?.currentContent).toBe("First draft content.");

    await updateEssayMetadata(connection.db, PERSONAL, essayId, {
      title: "Draft essay", status: "ready", designation: "canonical",
    });
    expect(await connection.db.select().from(essayVersions).where(eq(essayVersions.essayId, essayId))).toHaveLength(3);
  });

  it("deletes only the scoped essay and cascades its versions, family links, and matches", async () => {
    const essayId = await createEssay(connection.db, PERSONAL, { title: "Disposable", content: "x", status: "idea", designation: "canonical" });
    await expect(deleteEssay(connection.db, DEMO_WORKSPACE_ID, essayId)).rejects.toThrow();
    await deleteEssay(connection.db, PERSONAL, essayId);
    expect(await connection.db.select().from(essays).where(eq(essays.id, essayId))).toHaveLength(0);
    expect(await connection.db.select().from(essayVersions).where(eq(essayVersions.essayId, essayId))).toHaveLength(0);
  });

  it("recomputes deterministic reuse matches for every essay/prompt pair in a workspace", async () => {
    const families = await connection.db.select().from(promptFamilies).where(eq(promptFamilies.workspaceId, PERSONAL));
    const school = await createSchool(connection.db, PERSONAL, { name: "Lakeview University" });
    if (!school) throw new Error("Expected the school to be created.");
    const whyMajorFamily = families.find((family) => family.name === "Why Major / Academic Interests");
    if (!whyMajorFamily) throw new Error("Expected a Why Major family.");

    const promptId = await createPrompt(connection.db, PERSONAL, {
      schoolId: school.id,
      title: "Why this field",
      promptText: "Why do you want to study your intended field?",
      minWordCount: 100,
      maxWordCount: 300,
      requirement: "required",
      status: "not-started",
      primaryFamilyId: whyMajorFamily.id,
    });
    const essayId = await createEssay(connection.db, PERSONAL, {
      title: "Why Computer Science",
      // 15 words x 12 = 180, inside the prompt's [100, 300] range.
      content: Array(12).fill("I want to study computer science because building systems that help people has always driven me.").join(" "),
      status: "draft",
      designation: "canonical",
      primaryFamilyId: whyMajorFamily.id,
    });

    await recomputeWorkspaceMatches(connection.db, PERSONAL);
    const matches = await connection.db.select().from(essayPromptMatches).where(eq(essayPromptMatches.workspaceId, PERSONAL));
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ essayId, promptId, recommendedAction: "ready-to-reuse" });
    expect(matches[0].score).toBeGreaterThanOrEqual(80);

    // Recomputing again after nothing changed must not accumulate duplicate rows.
    await recomputeWorkspaceMatches(connection.db, PERSONAL);
    expect(await connection.db.select().from(essayPromptMatches).where(eq(essayPromptMatches.workspaceId, PERSONAL))).toHaveLength(1);

    // A personal-workspace recompute must leave the demo's matches alone.
    const demoMatches = (await resetDemoWorkspace(connection.db)).matches;
    expect(demoMatches).toBeGreaterThan(0);
    await recomputeWorkspaceMatches(connection.db, PERSONAL);
    expect(await connection.db.select().from(essayPromptMatches).where(eq(essayPromptMatches.workspaceId, DEMO_WORKSPACE_ID))).toHaveLength(demoMatches);
  });

  it("imports and auto-classifies a verified school's prompts, idempotently", async () => {

    const first = await importCollege(connection.db, PERSONAL, "Stanford University");
    expect(first.verificationStatus).toBe("officially-verified");
    expect(first.counts.created).toBeGreaterThan(0);
    expect(first.counts.updated).toBe(0);
    expect(first.sourceUrl).toMatch(/^https:\/\//);

    const imported = await connection.db.select().from(prompts)
      .where(and(eq(prompts.workspaceId, PERSONAL), eq(prompts.schoolId, first.schoolId)));
    expect(imported).toHaveLength(first.counts.created);
    expect(imported.every((prompt) => prompt.classificationSource === "deterministic")).toBe(true);
    expect(imported.every((prompt) => prompt.verificationStatus === "officially-verified")).toBe(true);
    expect(imported.every((prompt) => prompt.externalRef)).toBe(true);
    const links = await connection.db.select().from(promptFamilyLinks)
      .where(inArray(promptFamilyLinks.promptId, imported.map((prompt) => prompt.id)));
    expect(links.length).toBeGreaterThan(0);

    // Re-adding the same school does not duplicate its school row or prompts -
    // every prompt is recognized as unchanged (deduplication + idempotency).
    const second = await importCollege(connection.db, PERSONAL, "  stanford university  ".trim());
    expect(second.counts.created).toBe(0);
    expect(second.counts.updated).toBe(0);
    expect(second.counts.unchanged).toBe(first.counts.created);
    expect(await connection.db.select().from(schools).where(eq(schools.workspaceId, PERSONAL))).toHaveLength(1);
    expect(await connection.db.select().from(prompts).where(eq(prompts.schoolId, first.schoolId))).toHaveLength(first.counts.created);
  });

  it("adds a school with no verified prompts as 'not yet verified' rather than guessing", async () => {
    const result = await importCollege(connection.db, PERSONAL, "Some Unlisted College");
    expect(result.counts.created).toBe(0);
    expect(result.verificationStatus).toBe("manual");
    expect(result.note).toMatch(/not yet verified/i);
    expect((await connection.db.select().from(schools).where(eq(schools.id, result.schoolId)).then((rows) => rows[0]))?.name).toBe("Some Unlisted College");
  });

  it("imports confirmed previous-cycle prompts, distinctly cycle-labeled and never as current", async () => {
    const result = await importCollege(connection.db, PERSONAL, "Harvard University");
    expect(result.verificationStatus).toBe("previous-cycle");
    expect(result.counts.created).toBeGreaterThan(0);

    const imported = await connection.db.select().from(prompts).where(eq(prompts.schoolId, result.schoolId));
    expect(imported).toHaveLength(result.counts.created);
    expect(imported.every((prompt) => prompt.verificationStatus === "previous-cycle")).toBe(true);

    const promptCycle = await connection.db.select().from(applicationCycles).where(eq(applicationCycles.id, imported[0].cycleId!)).then((rows) => rows[0]);
    const currentCycle = (await connection.db.select().from(applicationCycles)
      .where(eq(applicationCycles.workspaceId, PERSONAL)))
      .find((cycle) => cycle.label === "2026–27");
    expect(promptCycle?.label).toBe("2025–26");
    expect(promptCycle?.id).not.toBe(currentCycle?.id);

    // Previous-cycle prompts are visible/matchable but excluded from the
    // "current cycle" prompt stat.
    const snapshot = await getWorkspaceSnapshot(connection.db, PERSONAL);
    expect(snapshot?.prompts.some((prompt) => prompt.schoolId === result.schoolId)).toBe(true);
    expect(snapshot?.stats.prompts).toBe(0);
    expect(snapshot?.stats.previousCyclePrompts).toBe(result.counts.created);
  });

  it("imports genuinely conditional, degree-dependent prompts with their note intact", async () => {
    const result = await importCollege(connection.db, PERSONAL, "Princeton University");
    const conditionalPrompts = await connection.db.select().from(prompts)
      .where(and(eq(prompts.schoolId, result.schoolId), eq(prompts.requirement, "conditional")));
    expect(conditionalPrompts.length).toBeGreaterThanOrEqual(2);
    expect(conditionalPrompts.every((prompt) => Boolean(prompt.conditionalNote))).toBe(true);
  });

  it("imports character-limited prompts distinctly from word-limited ones", async () => {
    const result = await importCollege(connection.db, PERSONAL, "Yale University");
    const charLimited = await connection.db.select().from(prompts)
      .where(and(eq(prompts.schoolId, result.schoolId), eq(prompts.externalRef, "short-take-teach-write-create")))
      .then((rows) => rows[0]);
    expect(charLimited?.maxCharCount).toBe(200);
    expect(charLimited?.maxWordCount).toBeNull();
  });

  it("shares one canonical prompt set across UC campuses without cross-campus id collisions", async () => {
    const berkeley = await importCollege(connection.db, PERSONAL, "University of California, Berkeley");
    const ucla = await importCollege(connection.db, PERSONAL, "University of California, Los Angeles");
    expect(berkeley.counts.created).toBe(8);
    expect(ucla.counts.created).toBe(8);
    expect(await connection.db.select().from(prompts).where(eq(prompts.workspaceId, PERSONAL))).toHaveLength(16);
  });

  it("flags a changed prompt as needs-review and records the prior wording, without duplicating it", async () => {
    const first = await importCollege(connection.db, PERSONAL, "Massachusetts Institute of Technology");
    const target = await connection.db.select().from(prompts)
      .where(and(eq(prompts.schoolId, first.schoolId), eq(prompts.externalRef, "short-answer-fun")))
      .then((rows) => rows[0]);
    if (!target) throw new Error("Expected the seeded MIT prompt to exist.");

    // Simulate "the source re-fetched with different wording than what we
    // previously imported" by rewinding the stored text, then re-import.
    await connection.db.update(prompts).set({ promptText: "What do you do just for fun on weekends?" })
      .where(eq(prompts.id, target.id));

    const second = await importCollege(connection.db, PERSONAL, "Massachusetts Institute of Technology");
    expect(second.counts.updated).toBe(1);
    expect(second.counts.flagged).toBe(1);

    const updated = await connection.db.select().from(prompts).where(eq(prompts.id, target.id)).then((rows) => rows[0]);
    expect(updated?.verificationStatus).toBe("needs-review");
    expect(updated?.promptText).toBe("What do you do just for fun?");

    const changeLog = await connection.db.select().from(promptChangeLog).where(eq(promptChangeLog.promptId, target.id));
    expect(changeLog).toHaveLength(1);
    expect(changeLog[0].previousPromptText).toBe("What do you do just for fun on weekends?");

    // No duplicate prompt was created for the same externalRef.
    expect(await connection.db.select().from(prompts).where(and(eq(prompts.schoolId, first.schoolId), eq(prompts.externalRef, "short-answer-fun")))).toHaveLength(1);
  });

  it("assigns exactly one essay response per prompt, replacing a prior assignment, and can unassign", async () => {
    const school = await createSchool(connection.db, PERSONAL, { name: "Lakeview University" });
    if (!school) throw new Error("Expected the school to be created.");
    const promptId = await createPrompt(connection.db, PERSONAL, {
      schoolId: school.id, title: "Community", promptText: "Describe a community you belong to.",
      requirement: "required", status: "not-started",
    });
    const essayOneId = await createEssay(connection.db, PERSONAL, { title: "Essay one", content: "x", status: "draft", designation: "canonical" });
    const essayTwoId = await createEssay(connection.db, PERSONAL, { title: "Essay two", content: "y", status: "draft", designation: "canonical" });

    await assignEssayToPrompt(connection.db, PERSONAL, promptId, essayOneId);
    let snapshot = await getWorkspaceSnapshot(connection.db, PERSONAL);
    expect(snapshot?.prompts.find((prompt) => prompt.id === promptId)?.assignedEssay?.id).toBe(essayOneId);

    await assignEssayToPrompt(connection.db, PERSONAL, promptId, essayTwoId);
    expect(await connection.db.select().from(assignedEssayResponses).where(eq(assignedEssayResponses.promptId, promptId))).toHaveLength(1);
    snapshot = await getWorkspaceSnapshot(connection.db, PERSONAL);
    expect(snapshot?.prompts.find((prompt) => prompt.id === promptId)?.assignedEssay?.id).toBe(essayTwoId);

    await unassignPrompt(connection.db, PERSONAL, promptId);
    snapshot = await getWorkspaceSnapshot(connection.db, PERSONAL);
    expect(snapshot?.prompts.find((prompt) => prompt.id === promptId)?.assignedEssay).toBeNull();
  });
});
