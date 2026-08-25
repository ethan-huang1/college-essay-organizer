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
  promptTagLinks,
  essayTagLinks,
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
import { createPrompt, deletePrompt, setPromptStatus, updatePrompt } from "../prompts";
import { createEssay, deleteEssay, restoreEssayVersion, saveEssayVersion, updateEssayMetadata } from "../essays";
import { recomputeWorkspaceMatches } from "../reuse";
import { importCollege } from "../college-import";
import { assignEssayToPrompt, unassignPrompt } from "../assignments";
import { migrateWorkspaceTaxonomy, workspacesNeedingTaxonomyMigration } from "./taxonomy-migration";

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

  it("seeds an editable seven-category taxonomy idempotently", async () => {

    const families = await connection.db
      .select()
      .from(promptFamilies)
      .where(eq(promptFamilies.workspaceId, PERSONAL));

    expect(families).toHaveLength(7);
    expect(families.every((family) => family.isEditable)).toBe(true);
    expect(families.map((family) => family.sortOrder)).toEqual([1, 2, 3, 4, 5, 6, 7]);
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
      primaryFamilyId: `${DEMO_WORKSPACE_ID}:family:personal-statement`,
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
      familyId: `${DEMO_WORKSPACE_ID}:family:other`,
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
    expect(demoFamilies).toHaveLength(7);

    // Every content category has to be demonstrated. Other is excluded on
    // purpose: it is where a prompt lands when nothing recognises it, and after
    // the classifier rewrite that is only ~4% of the catalogue. Requiring the
    // demo to contain one would mean contriving a prompt the app cannot
    // classify, which makes the example worse, not better.
    const populated = new Set(classified.map((row) => row.familyName));
    const contentCategories = demoFamilies.filter((family) => family.slug !== "other");
    expect(contentCategories).toHaveLength(6);
    for (const family of contentCategories) {
      expect(populated, `${family.name} has no demo prompt`).toContain(family.name);
    }

    // Other still has to exist, and sort last: it is a real seventh category,
    // not a "needs attention" bucket.
    const other = demoFamilies.find((family) => family.slug === "other");
    expect(other?.sortOrder).toBe(7);

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
      secondaryFamilyIds: [families[0].id, families[5].id, families[2].id],
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
      primaryFamilyId: `${DEMO_WORKSPACE_ID}:family:personal-statement`,
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
    const whyMajorFamily = families.find((family) => family.name === "Why Major");
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
    const row = await connection.db.select().from(schools).where(eq(schools.id, result.schoolId)).then((rows) => rows[0]);
    expect(row?.name).toBe("Some Unlisted College");
    expect(row?.catalogueStatus).toBe("manual");
  });

  // A college with zero prompts is not one state but four, and they mean
  // opposite things to a student. Each has to be readable from a column, never
  // from the prose in schools.notes.
  it("distinguishes every zero-prompt college state from structured data alone", async () => {
    const noSupplement = await importCollege(connection.db, PERSONAL, "Colby College");
    const notPublished = await importCollege(connection.db, PERSONAL, "Boston University");
    const previousOnly = await importCollege(connection.db, PERSONAL, "Harvard University");
    const manual = await importCollege(connection.db, PERSONAL, "Some Unlisted College");

    const byId = new Map(
      (await connection.db.select().from(schools).where(eq(schools.workspaceId, PERSONAL))).map((row) => [row.id, row]),
    );
    expect(byId.get(noSupplement.schoolId)?.catalogueStatus).toBe("no-supplement");
    expect(byId.get(notPublished.schoolId)?.catalogueStatus).toBe("not-published");
    expect(byId.get(previousOnly.schoolId)?.catalogueStatus).toBe("previous-cycle");
    expect(byId.get(manual.schoolId)?.catalogueStatus).toBe("manual");

    const snapshot = await getWorkspaceSnapshot(connection.db, PERSONAL);
    const stateOf = (schoolId: string) => snapshot?.schools.find((school) => school.id === schoolId)?.catalogueState;
    expect(stateOf(noSupplement.schoolId)).toBe("no-supplement");
    expect(stateOf(notPublished.schoolId)).toBe("not-published");
    expect(stateOf(manual.schoolId)).toBe("manual");
    // Harvard has prompts, all previous-cycle, so the state comes from the
    // prompt rows rather than the stored status.
    expect(stateOf(previousOnly.schoolId)).toBe("previous-cycle-only");
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
  // Seven UC campuses each store their own row for Personal Insight Question 1,
  // but a student writes that essay once. These pin the whole invariant: writes
  // fan out, a later campus inherits, and removing one campus cannot orphan the
  // shared work.
  describe("canonical shared prompts", () => {
    const ucCampuses = ["University of California, Berkeley", "University of California, Los Angeles"];

    async function importUcCampuses(names = ucCampuses) {
      const results = [];
      for (const name of names) results.push(await importCollege(connection.db, PERSONAL, name));
      return results;
    }

    // Resolves the same question at any campus. Matching the externalRef
    // exactly matters: a looser match would silently pick a different question
    // per campus and the fan-out assertions would compare unrelated rows.
    async function piqOne(schoolId: string) {
      const piq = await connection.db.select().from(prompts)
        .where(and(eq(prompts.schoolId, schoolId), eq(prompts.externalRef, "piq-1-leadership")))
        .then((rows) => rows[0]);
      if (!piq) throw new Error("Expected the shared UC PIQ 1 to be imported.");
      return piq;
    }

    it("gives every campus the same canonicalKey for the same question", async () => {
      const [berkeley, ucla] = await importUcCampuses();
      const first = await piqOne(berkeley.schoolId);
      const second = await piqOne(ucla.schoolId);
      expect(first.canonicalKey).toBeTruthy();
      expect(first.canonicalKey).toBe(second.canonicalKey);
      expect(first.id).not.toBe(second.id);
    });

    it("assigning through one campus assigns every campus", async () => {
      const [berkeley, ucla] = await importUcCampuses();
      const essayId = await createEssay(connection.db, PERSONAL, {
        title: "The woodshop", content: "x", status: "draft", designation: "canonical",
      });

      await assignEssayToPrompt(connection.db, PERSONAL, (await piqOne(berkeley.schoolId)).id, essayId);

      const snapshot = await getWorkspaceSnapshot(connection.db, PERSONAL);
      const uclaPiq = await piqOne(ucla.schoolId);
      expect(snapshot?.prompts.find((prompt) => prompt.id === uclaPiq.id)?.assignedEssay?.id).toBe(essayId);
      // Assigning is starting work, so neither may still read "not started".
      expect(snapshot?.prompts.find((prompt) => prompt.id === uclaPiq.id)?.status).toBe("in-progress");
    });

    it("marking one campus complete marks every campus", async () => {
      const [berkeley, ucla] = await importUcCampuses();
      await setPromptStatus(connection.db, PERSONAL, (await piqOne(berkeley.schoolId)).id, "complete");
      expect((await piqOne(ucla.schoolId)).status).toBe("complete");
    });

    it("a campus imported later inherits the shared answer", async () => {
      const [berkeley] = await importUcCampuses(["University of California, Berkeley"]);
      const essayId = await createEssay(connection.db, PERSONAL, {
        title: "The woodshop", content: "x", status: "draft", designation: "canonical",
      });
      await assignEssayToPrompt(connection.db, PERSONAL, (await piqOne(berkeley.schoolId)).id, essayId);

      const [ucla] = await importUcCampuses(["University of California, Los Angeles"]);
      const snapshot = await getWorkspaceSnapshot(connection.db, PERSONAL);
      const uclaPiq = await piqOne(ucla.schoolId);
      expect(snapshot?.prompts.find((prompt) => prompt.id === uclaPiq.id)?.assignedEssay?.id).toBe(essayId);
    });

    it("removing one campus keeps the shared assignment on the others", async () => {
      const [berkeley, ucla] = await importUcCampuses();
      const essayId = await createEssay(connection.db, PERSONAL, {
        title: "The woodshop", content: "x", status: "draft", designation: "canonical",
      });
      // Assign through the campus that is about to be removed - the case where
      // keeping one arbitrary row would have lost the assignment entirely.
      await assignEssayToPrompt(connection.db, PERSONAL, (await piqOne(berkeley.schoolId)).id, essayId);
      const uclaPiqId = (await piqOne(ucla.schoolId)).id;

      await deleteSchool(connection.db, PERSONAL, berkeley.schoolId);

      const snapshot = await getWorkspaceSnapshot(connection.db, PERSONAL);
      expect(snapshot?.schools.map((school) => school.id)).not.toContain(berkeley.schoolId);
      expect(snapshot?.prompts.find((prompt) => prompt.id === uclaPiqId)?.assignedEssay?.id).toBe(essayId);
      // And the essay itself is untouched.
      expect(snapshot?.essays.map((essay) => essay.id)).toContain(essayId);
    });
  });
  // Categories are user-renameable, and matching used to resolve them by
  // display name - so renaming one silently unmapped every family and collapsed
  // every score in the workspace to the baseline. The slug is the identity now.
  it("keeps matching intact after a student renames a category", async () => {
    await resetDemoWorkspace(connection.db);
    const before = await connection.db.select().from(essayPromptMatches)
      .where(eq(essayPromptMatches.workspaceId, DEMO_WORKSPACE_ID));
    const strongBefore = before.filter((match) => match.score >= 55).length;
    expect(strongBefore).toBeGreaterThan(0);

    await connection.db.update(promptFamilies)
      .set({ name: "My own name for this" })
      .where(eq(promptFamilies.id, `${DEMO_WORKSPACE_ID}:family:community`));

    await recomputeWorkspaceMatches(connection.db, DEMO_WORKSPACE_ID);

    const after = await connection.db.select().from(essayPromptMatches)
      .where(eq(essayPromptMatches.workspaceId, DEMO_WORKSPACE_ID));
    expect(after.filter((match) => match.score >= 55).length).toBe(strongBefore);
    // And the scores are identical, not merely similar.
    const scoreOf = (rows: typeof after) => new Map(rows.map((row) => [`${row.essayId}:${row.promptId}`, row.score]));
    expect([...scoreOf(after)].sort()).toEqual([...scoreOf(before)].sort());
  });
  // The only phase that rewrites existing rows, so this is the one that has to
  // prove nobody loses work: a student who classified prompts by hand under the
  // ten-category taxonomy keeps every one of those classifications, remapped.
  describe("seven-category taxonomy migration", () => {
    const LEGACY = [
      ["core-story", "Personal Statement / Core Story", 1],
      ["identity-background", "Identity & Background", 2],
      ["community-contribution", "Community & Contribution", 3],
      ["challenge-growth", "Challenge, Setback & Growth", 4],
      ["intellectual-curiosity", "Intellectual Curiosity", 5],
      ["why-major", "Why Major / Academic Interests", 6],
      ["why-school", "Why This School / Program", 7],
      ["activities-impact", "Activities, Leadership & Impact", 8],
      ["values-meaning", "Values, Perspective & Meaning", 9],
      ["short-takes", "Short Takes & Personality", 10],
    ] as const;

    /** Rebuilds the pre-migration state this workspace would have had. */
    async function seedLegacyTaxonomy(workspaceId: string) {
      await connection.db.delete(promptFamilies).where(eq(promptFamilies.workspaceId, workspaceId));
      await connection.db.insert(promptFamilies).values(LEGACY.map(([slug, name, sortOrder]) => ({
        id: `${workspaceId}:family:${slug}`,
        workspaceId,
        slug,
        name,
        description: `${name} description`,
        color: "#000000",
        sortOrder,
      })));
    }

    it("repoints every link, loses no classification, and records the retired concept as a tag", async () => {
      await seedLegacyTaxonomy(PERSONAL);
      const school = await createSchool(connection.db, PERSONAL, { name: "Legacy University" });
      if (!school) throw new Error("Expected the school to be created.");

      // One prompt per legacy category, each hand-classified.
      const promptIds: string[] = [];
      for (const [slug] of LEGACY) {
        const promptId = await createPrompt(connection.db, PERSONAL, {
          schoolId: school.id,
          title: `Prompt for ${slug}`,
          promptText: `A prompt filed under ${slug} by the student themselves.`,
          requirement: "required",
          status: "not-started",
          primaryFamilyId: `${PERSONAL}:family:${slug}`,
        });
        promptIds.push(promptId);
      }
      const essayId = await createEssay(connection.db, PERSONAL, {
        title: "Legacy essay",
        content: "x",
        status: "draft",
        designation: "canonical",
        primaryFamilyId: `${PERSONAL}:family:challenge-growth`,
      });

      const result = await migrateWorkspaceTaxonomy(connection.db, PERSONAL);
      expect(result.migrated).toBe(true);

      const families = await connection.db.select().from(promptFamilies).where(eq(promptFamilies.workspaceId, PERSONAL));
      expect(families).toHaveLength(7);
      expect(families.map((family) => family.sortOrder).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);

      // Not one prompt lost its primary category.
      const links = await connection.db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.workspaceId, PERSONAL));
      const primaryByPrompt = new Map(links.filter((link) => link.isPrimary).map((link) => [link.promptId, link.familyId]));
      for (const promptId of promptIds) {
        expect(primaryByPrompt.get(promptId), `prompt ${promptId} lost its category`).toBeTruthy();
      }
      // And no prompt ended up with two.
      for (const promptId of promptIds) {
        expect(links.filter((link) => link.promptId === promptId && link.isPrimary)).toHaveLength(1);
      }

      // The four retired categories collapse into Other...
      const otherId = `${PERSONAL}:family:other`;
      expect([...primaryByPrompt.values()].filter((id) => id === otherId)).toHaveLength(4);
      // ...and each keeps its concept as an internal tag, so the reuse signal
      // survives without becoming a user-facing category.
      const tagLinks = await connection.db.select().from(promptTagLinks).where(eq(promptTagLinks.workspaceId, PERSONAL));
      expect(tagLinks).toHaveLength(4);

      const essayLinks = await connection.db.select().from(essayFamilyLinks).where(eq(essayFamilyLinks.essayId, essayId));
      expect(essayLinks.find((link) => link.isPrimary)?.familyId).toBe(otherId);
      expect(await connection.db.select().from(essayTagLinks).where(eq(essayTagLinks.essayId, essayId))).toHaveLength(1);
    });

    it("is idempotent and leaves an already-migrated workspace alone", async () => {
      const first = await migrateWorkspaceTaxonomy(connection.db, PERSONAL);
      expect(first.migrated).toBe(false);
      expect(await connection.db.select().from(promptFamilies).where(eq(promptFamilies.workspaceId, PERSONAL))).toHaveLength(7);
    });

    it("reports which workspaces still need migrating", async () => {
      expect(await workspacesNeedingTaxonomyMigration(connection.db)).toEqual([]);
      await seedLegacyTaxonomy(PERSONAL);
      expect(await workspacesNeedingTaxonomyMigration(connection.db)).toEqual([PERSONAL]);
    });
  });
});
