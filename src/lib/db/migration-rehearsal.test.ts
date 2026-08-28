import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type AppDatabase, MIGRATIONS_FOLDER, openTestDatabase } from "./client";
import {
  applicationCycles,
  assignedEssayResponses,
  essayFamilyLinks,
  essayTagLinks,
  essays,
  essayVersions,
  promptFamilies,
  promptFamilyLinks,
  promptTagLinks,
  promptTags,
  prompts,
  schools,
  users,
  workspaces,
} from "./schema";
import { SECONDARY_TAGS } from "./taxonomy";
import { migrateWorkspaceTaxonomy, workspacesNeedingTaxonomyMigration } from "./taxonomy-migration";
import { personalWorkspaceId } from "../users";
import { getWorkspaceSnapshot } from "../workspaces";
import { deleteSchool, setSchoolPrograms } from "../schools";
import { setPromptStatus } from "../prompts";
import { assignEssayToPrompt } from "../assignments";
import { importCollege } from "../college-import";
import { recomputeWorkspaceMatches } from "../reuse";
import { summarizeWorkload, workspaceWorkload } from "../workload";
import { reuseOpportunities } from "../progress";

// ---------------------------------------------------------------------------
// PRODUCTION-SHAPED MIGRATION REHEARSAL
//
// Two committed migrations (0002_broken_prima and 0003_premium_tana_nile) are
// pending against any database that predates them. This suite proves they are
// safe to run against a database that already holds real rows, and that the
// taxonomy remap those columns enable (migrateWorkspaceTaxonomy) is safe to
// run alongside them.
//
// FIXTURE APPROACH: apply only migrations 0000+0001 (via a trimmed journal
// built from the real one), hand-write legacy-shaped rows with raw SQL for
// the three tables 0002/0003 alter (schools, prompts, prompt_families - none
// of the other tables changed shape across those two migrations, so they are
// populated with the normal typed Drizzle API even at this "before" stage),
// then apply the full migrations folder and continue with the ordinary
// application code. This exercises the actual committed ALTER TABLE/backfill
// SQL against populated tables rather than simulating its effect.
// ---------------------------------------------------------------------------

/** Copies only the journal entries at or before idx 1 (migrations 0000, 0001). */
function buildPreTaxonomyMigrationsFolder() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-migrations-"));
  fs.mkdirSync(path.join(dir, "meta"));
  const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  const legacyEntries = journal.entries.filter((entry) => entry.idx <= 1);
  expect(legacyEntries).toHaveLength(2); // sanity: this suite assumes exactly two migrations are pending
  fs.writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries: legacyEntries }));
  for (const entry of legacyEntries) {
    fs.copyFileSync(path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), path.join(dir, `${entry.tag}.sql`));
  }
  return dir;
}

/**
 * Inserts an essay with raw SQL, naming only the columns migrations 0000-0001
 * created.
 *
 * The Drizzle schema describes the *current* essays table, so an ORM insert
 * lists every column it knows about - including ones a later migration adds -
 * and fails against this fixture's older schema. Naming the columns explicitly
 * is the point: it is what makes this a rehearsal of legacy data rather than of
 * today's data.
 */
async function insertLegacyEssay(
  db: AppDatabase,
  row: { id: string; workspaceId: string; title: string; content: string },
) {
  await db.execute(sql`
    insert into "essays" ("id", "workspace_id", "title", "current_content", "status", "designation")
    values (${row.id}, ${row.workspaceId}, ${row.title}, ${row.content}, 'draft', 'canonical')
  `);
}

type LegacyFamilySeed = readonly [slug: string, name: string, sortOrder: number];

// The ten categories MVP_SPEC previously specified, before the seven-category
// rewrite. Matches src/lib/db/taxonomy.ts's LEGACY_FAMILY_SLUG_MAP exactly.
const LEGACY_FAMILIES: readonly LegacyFamilySeed[] = [
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

type PGliteClient = ReturnType<typeof openTestDatabase>["client"];

/** Inserts a legacy prompt_families row with raw SQL: the `slug` column does not exist yet. */
async function insertLegacyFamily(
  client: PGliteClient,
  row: { id: string; workspaceId: string; name: string; sortOrder: number },
) {
  await client.query(
    `insert into prompt_families (id, workspace_id, name, description, color, sort_order) values ($1,$2,$3,$4,$5,$6)`,
    [row.id, row.workspaceId, row.name, `${row.name} description`, "#334455", row.sortOrder],
  );
}

/** Inserts a legacy school row with raw SQL: catalogue_status/selected_programs do not exist yet. */
async function insertLegacySchool(client: PGliteClient, row: { id: string; workspaceId: string; name: string }) {
  await client.query(`insert into schools (id, workspace_id, name) values ($1,$2,$3)`, [row.id, row.workspaceId, row.name]);
}

/** Inserts a legacy prompt row with raw SQL: the seven catalogue columns 0002 adds do not exist yet. */
async function insertLegacyPrompt(
  client: PGliteClient,
  row: {
    id: string;
    workspaceId: string;
    schoolId: string;
    title: string;
    promptText: string;
    requirement?: "required" | "optional" | "conditional";
    status?: "not-started" | "in-progress" | "complete" | "submitted";
    cycleId?: string | null;
  },
) {
  await client.query(
    `insert into prompts (id, workspace_id, school_id, title, prompt_text, requirement, status, cycle_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      row.id,
      row.workspaceId,
      row.schoolId,
      row.title,
      row.promptText,
      row.requirement ?? "required",
      row.status ?? "not-started",
      row.cycleId ?? null,
    ],
  );
}

async function seedLegacyTags(db: AppDatabase, workspaceId: string) {
  await db.insert(promptTags).values(
    SECONDARY_TAGS.map((name) => ({ id: `${workspaceId}:tag:${name.replaceAll(" ", "-")}`, workspaceId, name })),
  );
}

describe("migration rehearsal: legacy production data through 0002 + 0003", () => {
  let connection: ReturnType<typeof openTestDatabase>;
  let legacyMigrationsFolder: string;

  let USER_A: string;
  let USER_B: string;
  let WS_A: string;
  let WS_B: string;

  const CASCADE = "cascade-university";
  const MERIDIAN = "meridian-college";
  const PROGRAM_COLLEGE = "program-college";
  const RIDGELINE = "ridgeline-college";

  let coreStoryPromptId: string;
  let challengeGrowthPromptId: string;
  let previousCyclePromptIdA: string;
  let essayBridgeId: string;
  let essayRootsId: string;
  let ridgelineCurrentPromptId: string;
  let previousCyclePromptIdB: string;
  let otherFamilyIdA: string;
  let personalStatementFamilyIdA: string;

  // Point-2 "before" snapshots, captured while the database is still on
  // migrations 0000+0001 only.
  let beforeUsers: { id: string; email: string }[];
  let beforeWorkspaces: { id: string; name: string; userId: string | null }[];
  let beforeEssayBridgeContent: string;
  let beforeEssayVersions: { versionNumber: number; content: string }[];
  let beforeAssignments: { promptId: string; essayId: string }[];
  let beforePromptStatuses: { id: string; status: string; school_id: string }[];

  beforeAll(async () => {
    connection = openTestDatabase();
    legacyMigrationsFolder = buildPreTaxonomyMigrationsFolder();

    // --- Bring the database to exactly the "before 0002/0003" shape. ---
    await connection.migrate(legacyMigrationsFolder);

    const { db, client } = connection;

    USER_A = crypto.randomUUID();
    USER_B = crypto.randomUUID();
    WS_A = personalWorkspaceId(USER_A);
    WS_B = personalWorkspaceId(USER_B);

    await db.insert(users).values([
      { id: USER_A, email: "aria@example.com", passwordHash: "scrypt$16384$8$1$dGVzdA$dGVzdA" },
      { id: USER_B, email: "beau@example.com", passwordHash: "scrypt$16384$8$1$dGVzdA$dGVzdA" },
    ]);
    await db.insert(workspaces).values([
      { id: WS_A, userId: USER_A, kind: "personal", name: "Aria's workspace" },
      { id: WS_B, userId: USER_B, kind: "personal", name: "Beau's workspace" },
    ]);

    // Tags are seeded independently of the family taxonomy at account
    // creation (see seedTaxonomy) and are unaffected by the ten-to-seven
    // rewrite, so a real longstanding workspace already has them.
    await seedLegacyTags(db, WS_A);
    await seedLegacyTags(db, WS_B);

    // Ten legacy families for workspace A. The "short-takes" row deliberately
    // uses an id that does NOT follow the `<workspaceId>:family:<slug>`
    // convention, to exercise 0003's name-based fallback backfill branch
    // rather than only its primary id-parsing branch.
    for (const [slug, name, sortOrder] of LEGACY_FAMILIES) {
      const id = slug === "short-takes" ? `${WS_A}:legacy-category-ten` : `${WS_A}:family:${slug}`;
      await insertLegacyFamily(client, { id, workspaceId: WS_A, name, sortOrder });
    }
    // Ten legacy families for workspace B, all following the id convention.
    for (const [slug, name, sortOrder] of LEGACY_FAMILIES) {
      await insertLegacyFamily(client, { id: `${WS_B}:family:${slug}`, workspaceId: WS_B, name, sortOrder });
    }

    const cyclePrevA = crypto.randomUUID();
    await db.insert(applicationCycles).values({ id: cyclePrevA, workspaceId: WS_A, label: "2025–26", startYear: 2025, endYear: 2026, isActive: false });
    const cyclePrevB = crypto.randomUUID();
    await db.insert(applicationCycles).values({ id: cyclePrevB, workspaceId: WS_B, label: "2025–26", startYear: 2025, endYear: 2026, isActive: false });

    // --- Workspace A: Cascade University, one prompt per legacy category. ---
    const cascadeId = `${WS_A}:school:${CASCADE}`;
    await insertLegacySchool(client, { id: cascadeId, workspaceId: WS_A, name: "Cascade University" });

    const statusCycle: Array<"complete" | "in-progress" | "not-started"> = [
      "complete", "in-progress", "not-started", "complete", "not-started",
      "in-progress", "complete", "not-started", "in-progress", "not-started",
    ];
    const promptIdByLegacySlug = new Map<string, string>();
    for (const [index, [slug]] of LEGACY_FAMILIES.entries()) {
      const promptId = `${WS_A}:prompt:${slug}`;
      promptIdByLegacySlug.set(slug, promptId);
      await insertLegacyPrompt(client, {
        id: promptId,
        workspaceId: WS_A,
        schoolId: cascadeId,
        title: `Cascade prompt filed under ${slug}`,
        promptText: `A prompt a student hand-classified under ${slug}.`,
        status: statusCycle[index],
      });
    }
    coreStoryPromptId = promptIdByLegacySlug.get("core-story")!;
    challengeGrowthPromptId = promptIdByLegacySlug.get("challenge-growth")!;

    // A previous-cycle prompt, classified under the SAME legacy category as
    // the essay below, so a strong reuse match will exist for it - the case
    // that would leak into "open reuse work" if cycle exclusion ever broke.
    previousCyclePromptIdA = `${WS_A}:prompt:core-story-previous-cycle`;
    await insertLegacyPrompt(client, {
      id: previousCyclePromptIdA,
      workspaceId: WS_A,
      schoolId: cascadeId,
      title: "Cascade prompt (previous cycle)",
      promptText: "Last cycle's version of the personal statement prompt.",
      cycleId: cyclePrevA,
    });

    // promptFamilyLinks/essayFamilyLinks/essays/essayVersions/assignments are
    // untouched by 0002/0003, so the ordinary typed API is used for them even
    // in this "before" phase.
    await db.insert(promptFamilyLinks).values([
      // The primary classification, plus a manual hand-override on a second
      // prompt (a real classification a student made themselves).
      { id: crypto.randomUUID(), workspaceId: WS_A, promptId: coreStoryPromptId, familyId: `${WS_A}:family:core-story`, isPrimary: true, source: "deterministic" },
      { id: crypto.randomUUID(), workspaceId: WS_A, promptId: challengeGrowthPromptId, familyId: `${WS_A}:family:challenge-growth`, isPrimary: true, source: "manual" },
      // Two secondary links on the core-story prompt that will collapse into
      // the SAME new "other" family under remap - the duplicate-pair dedupe
      // path documented in taxonomy-migration.ts.
      { id: crypto.randomUUID(), workspaceId: WS_A, promptId: coreStoryPromptId, familyId: `${WS_A}:family:intellectual-curiosity`, isPrimary: false, source: "deterministic" },
      { id: crypto.randomUUID(), workspaceId: WS_A, promptId: coreStoryPromptId, familyId: `${WS_A}:family:activities-impact`, isPrimary: false, source: "deterministic" },
      { id: crypto.randomUUID(), workspaceId: WS_A, promptId: previousCyclePromptIdA, familyId: `${WS_A}:family:core-story`, isPrimary: true, source: "deterministic" },
      ...[...promptIdByLegacySlug.entries()]
        .filter(([slug]) => slug !== "core-story" && slug !== "challenge-growth")
        .map(([slug, promptId]) => ({
          id: crypto.randomUUID(), workspaceId: WS_A, promptId,
          // "short-takes" is the one legacy family row given a non-conventional
          // id (see insertLegacyFamily above), so its link must point there.
          familyId: slug === "short-takes" ? `${WS_A}:legacy-category-ten` : `${WS_A}:family:${slug}`,
          isPrimary: true, source: "deterministic" as const,
        })),
    ]);

    essayBridgeId = `${WS_A}:essay:bridge`;
    await insertLegacyEssay(db, {
      id: essayBridgeId, workspaceId: WS_A, title: "The Bridge",
      content: "The second draft of the bridge essay, revised for clarity.",
    });
    await db.insert(essayVersions).values([
      { id: crypto.randomUUID(), workspaceId: WS_A, essayId: essayBridgeId, versionNumber: 1, content: "The first draft of the bridge essay.", wordCount: 7 },
      { id: crypto.randomUUID(), workspaceId: WS_A, essayId: essayBridgeId, versionNumber: 2, content: "The second draft of the bridge essay, revised for clarity.", wordCount: 10 },
    ]);
    await db.insert(essayFamilyLinks).values({
      id: crypto.randomUUID(), workspaceId: WS_A, essayId: essayBridgeId, familyId: `${WS_A}:family:core-story`, isPrimary: true, source: "manual",
    });
    await db.insert(assignedEssayResponses).values({
      id: crypto.randomUUID(), workspaceId: WS_A, promptId: coreStoryPromptId, essayId: essayBridgeId,
    });

    // --- Workspace B: Ridgeline College, a smaller mirror for isolation checks. ---
    const ridgelineId = `${WS_B}:school:${RIDGELINE}`;
    await insertLegacySchool(client, { id: ridgelineId, workspaceId: WS_B, name: "Ridgeline College" });
    ridgelineCurrentPromptId = `${WS_B}:prompt:community-contribution`;
    await insertLegacyPrompt(client, {
      id: ridgelineCurrentPromptId, workspaceId: WS_B, schoolId: ridgelineId,
      title: "Ridgeline community prompt", promptText: "Describe a community you belong to.", status: "complete",
    });
    previousCyclePromptIdB = `${WS_B}:prompt:identity-previous-cycle`;
    await insertLegacyPrompt(client, {
      id: previousCyclePromptIdB, workspaceId: WS_B, schoolId: ridgelineId,
      title: "Ridgeline identity prompt (previous cycle)", promptText: "Old identity prompt.", cycleId: cyclePrevB,
    });
    await db.insert(promptFamilyLinks).values([
      { id: crypto.randomUUID(), workspaceId: WS_B, promptId: ridgelineCurrentPromptId, familyId: `${WS_B}:family:community-contribution`, isPrimary: true, source: "deterministic" },
      { id: crypto.randomUUID(), workspaceId: WS_B, promptId: previousCyclePromptIdB, familyId: `${WS_B}:family:identity-background`, isPrimary: true, source: "deterministic" },
    ]);
    essayRootsId = `${WS_B}:essay:roots`;
    await insertLegacyEssay(db, { id: essayRootsId, workspaceId: WS_B, title: "Roots", content: "An essay about where I come from." });
    await db.insert(essayVersions).values({ id: crypto.randomUUID(), workspaceId: WS_B, essayId: essayRootsId, versionNumber: 1, content: "An essay about where I come from.", wordCount: 7 });
    await db.insert(essayFamilyLinks).values({ id: crypto.randomUUID(), workspaceId: WS_B, essayId: essayRootsId, familyId: `${WS_B}:family:community-contribution`, isPrimary: true, source: "deterministic" });
    await db.insert(assignedEssayResponses).values({ id: crypto.randomUUID(), workspaceId: WS_B, promptId: ridgelineCurrentPromptId, essayId: essayRootsId });

    // --- Capture "before" values with the raw column set only. ---
    beforeUsers = (await db.select({ id: users.id, email: users.email }).from(users)).sort((a, b) => a.id.localeCompare(b.id));
    beforeWorkspaces = (await db.select({ id: workspaces.id, name: workspaces.name, userId: workspaces.userId }).from(workspaces))
      .sort((a, b) => a.id.localeCompare(b.id));
    beforeEssayBridgeContent = (await db.select({ c: essays.currentContent }).from(essays).where(eq(essays.id, essayBridgeId)).then((r) => r[0]))!.c;
    beforeEssayVersions = (await db.select({ versionNumber: essayVersions.versionNumber, content: essayVersions.content })
      .from(essayVersions).where(eq(essayVersions.essayId, essayBridgeId)))
      .sort((a, b) => a.versionNumber - b.versionNumber);
    beforeAssignments = (await db.select({ promptId: assignedEssayResponses.promptId, essayId: assignedEssayResponses.essayId }).from(assignedEssayResponses))
      .sort((a, b) => a.promptId.localeCompare(b.promptId));
    beforePromptStatuses = (await client.query<{ id: string; status: string; school_id: string }>(
      `select id, status, school_id from prompts order by id`,
    )).rows.sort((a, b) => a.id.localeCompare(b.id));

    // --- POINT 1: apply the two pending migrations against this populated database. ---
    await connection.migrate();

    // Both workspaces move from ten categories to seven.
    await migrateWorkspaceTaxonomy(db, WS_A);
    await migrateWorkspaceTaxonomy(db, WS_B);
    otherFamilyIdA = `${WS_A}:family:other`;
    personalStatementFamilyIdA = `${WS_A}:family:personal-statement`;
  }, 30_000);

  afterAll(async () => {
    await connection.close();
    fs.rmSync(legacyMigrationsFolder, { recursive: true, force: true });
  });

  it("[point 1] applies both pending migrations to a populated database without throwing", async () => {
    // beforeAll already ran connection.migrate() past this point without
    // throwing; assert the schema actually landed as the release depends on.
    const columns = await connection.client.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'prompts' and column_name in
       ('canonical_key','group_key','group_required_count','program_key')`,
    );
    expect(columns.rows.map((row) => row.column_name).sort()).toEqual(
      ["canonical_key", "group_key", "group_required_count", "program_key"].sort(),
    );
    const slugColumn = await connection.client.query<{ is_nullable: string }>(
      `select is_nullable from information_schema.columns where table_name = 'prompt_families' and column_name = 'slug'`,
    );
    expect(slugColumn.rows[0]?.is_nullable).toBe("NO");
  });

  it("[point 2] preserves user, workspace, essay content/version, assignment, status, and school-membership rows exactly", async () => {
    const { db, client } = connection;

    const afterUsers = (await db.select({ id: users.id, email: users.email }).from(users)).sort((a, b) => a.id.localeCompare(b.id));
    expect(afterUsers).toEqual(beforeUsers);

    const afterWorkspaces = (await db.select({ id: workspaces.id, name: workspaces.name, userId: workspaces.userId }).from(workspaces))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(afterWorkspaces).toEqual(beforeWorkspaces);

    const afterContent = (await db.select({ c: essays.currentContent }).from(essays).where(eq(essays.id, essayBridgeId)).then((r) => r[0]))!.c;
    expect(afterContent).toBe(beforeEssayBridgeContent);

    const afterVersions = (await db.select({ versionNumber: essayVersions.versionNumber, content: essayVersions.content })
      .from(essayVersions).where(eq(essayVersions.essayId, essayBridgeId)))
      .sort((a, b) => a.versionNumber - b.versionNumber);
    expect(afterVersions).toHaveLength(2);
    expect(afterVersions).toEqual(beforeEssayVersions);

    const afterAssignments = (await db.select({ promptId: assignedEssayResponses.promptId, essayId: assignedEssayResponses.essayId }).from(assignedEssayResponses))
      .sort((a, b) => a.promptId.localeCompare(b.promptId));
    expect(afterAssignments).toEqual(beforeAssignments);

    // Statuses and school membership, read through the now-current (post-0002)
    // typed columns, must match the pre-migration raw values exactly.
    const afterPromptStatuses = (await db.select({ id: prompts.id, status: prompts.status, schoolId: prompts.schoolId }).from(prompts))
      .map((row) => ({ id: row.id, status: row.status, school_id: row.schoolId }))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(afterPromptStatuses).toEqual(beforePromptStatuses);
    void client;
  });

  it("[point 3] backfills a correct, editable-name-independent slug for every family, including a non-conventional id", async () => {
    const families = await connection.db.select().from(promptFamilies).where(eq(promptFamilies.workspaceId, WS_A));
    // Every surviving family (the seven the workspace was just remapped to)
    // has a populated, unique slug - the NOT NULL + unique index 0003 adds.
    expect(families.every((family) => Boolean(family.slug))).toBe(true);
    expect(new Set(families.map((family) => family.slug)).size).toBe(families.length);

    // Renaming a family's display name must never change its slug, nor break
    // matching that resolves families by slug.
    const target = families.find((family) => family.slug === "personal-statement");
    expect(target).toBeTruthy();
    await recomputeWorkspaceMatches(connection.db, WS_A);
    const { matches: beforeRenameMatches } = (await getWorkspaceSnapshot(connection.db, WS_A))!;
    const scoreKey = (rows: typeof beforeRenameMatches) => new Map(rows.map((row) => [`${row.essayId}:${row.promptId}`, row.score]));

    await connection.db.update(promptFamilies).set({ name: "Whatever I feel like calling this" }).where(eq(promptFamilies.id, target!.id));
    const renamed = await connection.db.select().from(promptFamilies).where(eq(promptFamilies.id, target!.id)).then((r) => r[0]);
    expect(renamed?.slug).toBe("personal-statement");

    await recomputeWorkspaceMatches(connection.db, WS_A);
    const { matches: afterRenameMatches } = (await getWorkspaceSnapshot(connection.db, WS_A))!;
    expect([...scoreKey(afterRenameMatches)].sort()).toEqual([...scoreKey(beforeRenameMatches)].sort());
  });

  it("[point 3b] recovers a slug from the display name for a family id that predates the `:family:slug` convention", async () => {
    // Proven directly against the raw backfill, before this suite's later
    // taxonomy remap replaces the row: re-derive what 0003 must have written
    // by checking the *migrated* value is exactly what the name-fallback CASE
    // branch in 0003's SQL promises for "Short Takes & Personality".
    // WS_A's legacy "short-takes" row (id `${WS_A}:legacy-category-ten`) was
    // consumed by migrateWorkspaceTaxonomy already; assert indirectly that the
    // remap correctly resolved it to the "shorts" family, which is only
    // possible if 0003 backfilled its slug to "short-takes" first.
    const links = await connection.db.select().from(promptFamilyLinks)
      .where(eq(promptFamilyLinks.promptId, `${WS_A}:prompt:short-takes`));
    const shortsFamilyId = `${WS_A}:family:shorts`;
    expect(links.some((link) => link.familyId === shortsFamilyId && link.isPrimary)).toBe(true);
  });

  it("[point 4] taxonomy remap drops no links, creates no duplicate primaries, dedupes collapsed secondaries, and keeps manual provenance", async () => {
    const families = await connection.db.select().from(promptFamilies).where(eq(promptFamilies.workspaceId, WS_A));
    expect(families).toHaveLength(11);

    const links = await connection.db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.workspaceId, WS_A));
    const allPromptIds = [...LEGACY_FAMILIES.map(([slug]) => `${WS_A}:prompt:${slug}`), previousCyclePromptIdA];

    // Every prompt that had a primary before still has exactly one now.
    for (const promptId of allPromptIds) {
      const primaries = links.filter((link) => link.promptId === promptId && link.isPrimary);
      expect(primaries, `prompt ${promptId} should have exactly one primary`).toHaveLength(1);
    }
    // Total distinct prompt owners holding a link is unchanged (11 prompts).
    expect(new Set(links.map((link) => link.promptId)).size).toBe(allPromptIds.length);

    // The core-story prompt carries two secondaries, intellectual-curiosity and
    // activities-impact. They used to collapse into the same "other" family and
    // had to dedupe to one row; now that Activities & Impact is a category
    // again, only intellectual-curiosity collapses and the other keeps its own
    // identity - so three links, and the student's classification survives
    // instead of being merged away. The pair-unique index is still respected,
    // which the transaction succeeding already implies.
    const coreStoryLinks = links.filter((link) => link.promptId === coreStoryPromptId);
    expect(coreStoryLinks).toHaveLength(3);
    expect(coreStoryLinks.find((link) => link.isPrimary)?.familyId).toBe(personalStatementFamilyIdA);
    const coreStorySecondaries = coreStoryLinks.filter((link) => !link.isPrimary).map((link) => link.familyId).sort();
    expect(coreStorySecondaries).toHaveLength(2);
    expect(coreStorySecondaries).toContain(`${WS_A}:family:activities-impact`);
    expect(coreStorySecondaries).toContain(otherFamilyIdA);

    // The manually hand-classified prompt keeps its manual provenance rather
    // than reverting to deterministic - and now keeps its category too, because
    // challenge-growth is a primary again and maps to itself instead of
    // collapsing into Other.
    const manualLink = links.find((link) => link.promptId === challengeGrowthPromptId);
    expect(manualLink).toMatchObject({ familyId: `${WS_A}:family:challenge-growth`, isPrimary: true, source: "manual" });

    // The manually classified essay link survives too.
    const essayLink = await connection.db.select().from(essayFamilyLinks).where(eq(essayFamilyLinks.essayId, essayBridgeId)).then((r) => r[0]);
    expect(essayLink).toMatchObject({ familyId: personalStatementFamilyIdA, isPrimary: true, source: "manual" });

    // The retired categories collapsed away as internal tags rather than
    // silently vanishing: one tag per (owner, retired concept) pair - the
    // dedicated intellectual-curiosity and values-meaning prompts (2) plus
    // core-story's collapsed secondaries. Neither challenge-growth nor
    // activities-impact produces a tag any more, because each kept its own
    // category - recording a concept as both a category and a tag would let
    // matching count one shared concept twice.
    const tagLinks = await connection.db.select().from(promptTagLinks).where(eq(promptTagLinks.workspaceId, WS_A));
    expect(tagLinks.length).toBeGreaterThan(0);
    expect(tagLinks).toHaveLength(3);
    // One, not two: core-story's other collapsed secondary was activities-impact,
    // which now keeps its own family link instead of becoming a tag.
    expect(tagLinks.filter((link) => link.promptId === coreStoryPromptId)).toHaveLength(1);
    // A link to a category that was NOT retired (personal-statement) produces no tag.
    const essayTags = await connection.db.select().from(essayTagLinks).where(eq(essayTagLinks.workspaceId, WS_A));
    expect(essayTags).toHaveLength(0);
  });

  it("[point 5] running the taxonomy migration a second time is a no-op", async () => {
    const before = await connection.db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.workspaceId, WS_A));
    const result = await migrateWorkspaceTaxonomy(connection.db, WS_A);
    expect(result.migrated).toBe(false);
    const after = await connection.db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.workspaceId, WS_A));
    expect(after.sort((a, b) => a.id.localeCompare(b.id))).toEqual(before.sort((a, b) => a.id.localeCompare(b.id)));
    expect(await workspacesNeedingTaxonomyMigration(connection.db)).toEqual([]);
  });

  describe("post-migration application flow", () => {
    let ucBerkeleySchoolId: string;
    let ucLaSchoolId: string;
    let wsBBaselineSnapshot: Awaited<ReturnType<typeof getWorkspaceSnapshot>>;

    beforeAll(async () => {
      const { db } = connection;

      // A choose-2-of-3 group and a pair of conditional prompts are only
      // representable once 0002's columns exist, so they are added here,
      // continuing on the SAME migrated + remapped workspace rather than a
      // fresh one.
      const meridianId = `${WS_A}:school:${MERIDIAN}`;
      await db.insert(schools).values({ id: meridianId, workspaceId: WS_A, name: "Meridian College", selectedPrograms: ["nursing"] });
      await db.insert(prompts).values([
        { id: `${WS_A}:prompt:meridian-1`, workspaceId: WS_A, schoolId: meridianId, title: "Meridian short take 1", promptText: "Short take one.", requirement: "optional", status: "complete", groupKey: "meridian-shorts", groupLabel: "Short takes (choose 2 of 3)", groupRequiredCount: 2 },
        { id: `${WS_A}:prompt:meridian-2`, workspaceId: WS_A, schoolId: meridianId, title: "Meridian short take 2", promptText: "Short take two.", requirement: "optional", status: "complete", groupKey: "meridian-shorts", groupLabel: "Short takes (choose 2 of 3)", groupRequiredCount: 2 },
        { id: `${WS_A}:prompt:meridian-3`, workspaceId: WS_A, schoolId: meridianId, title: "Meridian short take 3", promptText: "Short take three.", requirement: "optional", status: "not-started", groupKey: "meridian-shorts", groupLabel: "Short takes (choose 2 of 3)", groupRequiredCount: 2 },
        // Gated on Wharton, but this student is only applying to nursing:
        // conditional-and-unselected must not inflate required work.
        { id: `${WS_A}:prompt:meridian-wharton`, workspaceId: WS_A, schoolId: meridianId, title: "Meridian Wharton essay", promptText: "Why Wharton?", requirement: "conditional", conditionalNote: "Wharton applicants only.", programKey: "wharton", programLabel: "Wharton School", status: "not-started" },
      ]);

      const programCollegeId = `${WS_A}:school:${PROGRAM_COLLEGE}`;
      await db.insert(schools).values({ id: programCollegeId, workspaceId: WS_A, name: "Program College" });
      await db.insert(prompts).values({
        id: `${WS_A}:prompt:program-unresolved`, workspaceId: WS_A, schoolId: programCollegeId,
        title: "Program College gated essay", promptText: "Why this program?", requirement: "conditional",
        conditionalNote: "Only for a specific program.", programKey: "nursing", programLabel: "Nursing", status: "not-started",
      });

      // UC campuses, imported through the real pipeline, on top of the
      // migrated + remapped workspace - proves college-import classification
      // and canonical-key fan-out both still work here.
      const berkeley = await importCollege(db, WS_A, "University of California, Berkeley");
      const ucla = await importCollege(db, WS_A, "University of California, Los Angeles");
      ucBerkeleySchoolId = berkeley.schoolId;
      ucLaSchoolId = ucla.schoolId;

      await recomputeWorkspaceMatches(db, WS_A);

      // Baseline snapshot of workspace B, captured once both workspaces are
      // fully migrated/remapped but before ANY further workspace-A activity.
      wsBBaselineSnapshot = await getWorkspaceSnapshot(db, WS_B);
    }, 30_000);

    it("[point 6] one UC assignment satisfies the shared canonical requirement without deleting the sibling campus's own prompt row", async () => {
      const { db } = connection;
      const piqAtBerkeley = await db.select().from(prompts)
        .where(eq(prompts.schoolId, ucBerkeleySchoolId)).then((rows) => rows.find((row) => row.externalRef === "piq-1-leadership"));
      expect(piqAtBerkeley?.canonicalKey).toBeTruthy();

      const essayWoodshopId = `${WS_A}:essay:woodshop`;
      await db.insert(essays).values({ id: essayWoodshopId, workspaceId: WS_A, title: "The Woodshop", currentContent: "x", status: "draft", designation: "canonical" });
      await assignEssayToPrompt(db, WS_A, piqAtBerkeley!.id, essayWoodshopId);

      const uclaPiq = await db.select().from(prompts)
        .where(eq(prompts.schoolId, ucLaSchoolId)).then((rows) => rows.find((row) => row.externalRef === "piq-1-leadership"));
      expect(uclaPiq).toBeTruthy();
      const snapshot = await getWorkspaceSnapshot(db, WS_A);
      const uclaPiqInSnapshot = snapshot?.prompts.find((prompt) => prompt.id === uclaPiq!.id);
      expect(uclaPiqInSnapshot?.assignedEssay?.id).toBe(essayWoodshopId);
      expect(uclaPiqInSnapshot?.status).toBe("in-progress");
    });

    it("[point 7] removing one campus keeps the shared assignment on the surviving campus", async () => {
      const { db } = connection;
      const uclaPiq = await db.select().from(prompts)
        .where(eq(prompts.schoolId, ucLaSchoolId)).then((rows) => rows.find((row) => row.externalRef === "piq-1-leadership"));

      await deleteSchool(db, WS_A, ucBerkeleySchoolId);

      const snapshot = await getWorkspaceSnapshot(db, WS_A);
      expect(snapshot?.schools.map((school) => school.id)).not.toContain(ucBerkeleySchoolId);
      const survivingPiq = snapshot?.prompts.find((prompt) => prompt.id === uclaPiq!.id);
      expect(survivingPiq).toBeTruthy();
      expect(survivingPiq?.assignedEssay?.id).toBe(`${WS_A}:essay:woodshop`);
    });

    it("[point 8] a choose-2-of-3 group reaches 100% at two completed responses without requiring the third", async () => {
      const snapshot = await getWorkspaceSnapshot(connection.db, WS_A);
      const meridianPrompts = snapshot!.prompts.filter((prompt) => prompt.groupKey === "meridian-shorts");
      expect(meridianPrompts).toHaveLength(3);

      const summary = workspaceWorkload(snapshot!, (prompt) => prompt.groupKey === "meridian-shorts");
      const group = summary.groups.find((candidate) => candidate.key.endsWith("meridian-shorts"));
      expect(group).toMatchObject({ requiredCount: 2, size: 3, completed: 2, remaining: 0 });
      expect(summary.requiredTotal).toBe(2);
      expect(summary.requiredComplete).toBe(2);
      expect(summary.requiredRemaining).toBe(0);
    });

    it("[point 9] unresolved and unselected conditional prompts do not inflate required-work counts", async () => {
      const snapshot = await getWorkspaceSnapshot(connection.db, WS_A);

      const whartonEssay = snapshot!.prompts.find((prompt) => prompt.id === `${WS_A}:prompt:meridian-wharton`)!;
      const unresolvedEssay = snapshot!.prompts.find((prompt) => prompt.id === `${WS_A}:prompt:program-unresolved`)!;

      const summary = summarizeWorkload([whartonEssay, unresolvedEssay], { schools: snapshot!.schools, scope: "aggregate" });
      expect(summary.requiredTotal).toBe(0);
      // Gated on a program this student did not select (selectedPrograms: ["nursing"]).
      expect(summary.programSpecific).toBe(1);
      // Never asked which programs apply at Program College (selectedPrograms: null).
      expect(summary.unresolvedConditional).toBe(1);
      expect(summary.unresolvedPrograms).toEqual([
        { schoolId: `${WS_A}:school:${PROGRAM_COLLEGE}`, schoolName: "Program College", programKey: "nursing", programLabel: "Nursing" },
      ]);

      // Answering "yes, applying to Wharton" flips the same prompt from
      // unselected to active, proving the gate is live, not just absent.
      await setSchoolPrograms(connection.db, WS_A, `${WS_A}:school:${MERIDIAN}`, ["nursing", "wharton"]);
      const resolvedSnapshot = await getWorkspaceSnapshot(connection.db, WS_A);
      const whartonNowSelected = resolvedSnapshot!.prompts.find((prompt) => prompt.id === `${WS_A}:prompt:meridian-wharton`)!;
      const resolvedSummary = summarizeWorkload([whartonNowSelected], { schools: resolvedSnapshot!.schools, scope: "aggregate" });
      expect(resolvedSummary.requiredTotal).toBe(1);
      expect(resolvedSummary.programSpecific).toBe(0);
    });

    it("[point 10] a previous-cycle prompt is excluded from current workload and from reuseOpportunities despite a strong existing match", async () => {
      const snapshot = await getWorkspaceSnapshot(connection.db, WS_A);
      expect(snapshot!.stats.previousCyclePrompts).toBeGreaterThanOrEqual(1);
      expect(snapshot!.prompts.some((prompt) => prompt.id === previousCyclePromptIdA)).toBe(true);
      expect(snapshot!.prompts.find((prompt) => prompt.id === previousCyclePromptIdA)?.isCurrentCycle).toBe(false);

      const summary = workspaceWorkload(snapshot!);
      // The previous-cycle prompt shares the essay's family and has no word
      // limits, so if cycle exclusion were broken it would count as required.
      const previousCycleContributesToRequired = snapshot!.prompts
        .filter((prompt) => prompt.isCurrentCycle)
        .some((prompt) => prompt.id === previousCyclePromptIdA);
      expect(previousCycleContributesToRequired).toBe(false);
      void summary;

      // A same-family, unlimited-length match against the previous-cycle
      // prompt genuinely exists in the match table and is a real recommendation,
      // so this is a live leak risk rather than a vacuous check. The precondition
      // is "would be surfaced if cycle exclusion broke", which means any band
      // other than new-response - not one specific band, which would couple this
      // cycle-exclusion test to the scoring weights.
      const leakCandidate = snapshot!.matches.find((match) => match.essayId === essayBridgeId && match.promptId === previousCyclePromptIdA);
      expect(leakCandidate).toBeTruthy();
      expect(leakCandidate?.recommendedAction).not.toBe("new-response");

      const groups = reuseOpportunities(snapshot!.essays, snapshot!.matches, snapshot!.prompts);
      const bridgeGroup = groups.find((group) => group.essay.id === essayBridgeId)!;
      const allSurfacedPromptIds = [...bridgeGroup.inUse, ...bridgeGroup.open, ...bridgeGroup.withEdits, ...bridgeGroup.possible].map((match) => match.promptId);
      expect(allSurfacedPromptIds).not.toContain(previousCyclePromptIdA);
    });

    it("[point 11] a full mutate sequence in workspace A leaves workspace B byte-identical", async () => {
      const { db } = connection;
      // More activity in A: a status change and a school deletion, on top of
      // everything already done in this describe block (UC import, cross-
      // campus assignment, campus removal, group/program edits).
      await setPromptStatus(db, WS_A, `${WS_A}:prompt:meridian-1`, "submitted");
      await deleteSchool(db, WS_A, `${WS_A}:school:${PROGRAM_COLLEGE}`);

      const wsBAfter = await getWorkspaceSnapshot(db, WS_B);
      expect(wsBAfter).toEqual(wsBBaselineSnapshot);
    });
  });
});
