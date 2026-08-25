/**
 * Re-runs the normal college import for every school in every workspace, so
 * rows that predate the group/program/canonical columns pick them up.
 *
 * Why this exists: importCollege only touches a school when someone adds it, so
 * newly encoded catalogue metadata would otherwise reach an existing workspace
 * only if the student happened to re-add the college. Everything here goes
 * through the ordinary upsert path - it writes no SQL of its own, invents no
 * data, and an identical re-import is still a no-op.
 *
 * Also backfills schools.catalogue_status, which is NULL for any school added
 * before that column existed, and migrates any workspace still on the
 * ten-category taxonomy to the seven. The taxonomy has to move first: the
 * import classifies against the new slugs, so re-importing into a workspace
 * that still holds the old families would leave every prompt unclassified.
 *
 * This is a deliberate, human-run operation against whatever DATABASE_URL
 * points at. It is not wired into the app, the build, or the test suite.
 *
 *   node --env-file-if-exists=.env.local --experimental-strip-types \
 *     scripts/reimport-catalogue.mts [--dry-run]
 */
import { eq } from "drizzle-orm";

import { openDatabase } from "../src/lib/db/client.ts";
import { schools, workspaces } from "../src/lib/db/schema.ts";
import { importCollege } from "../src/lib/college-import.ts";
import { migrateWorkspaceTaxonomy } from "../src/lib/db/taxonomy-migration.ts";

const dryRun = process.argv.includes("--dry-run");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Refusing to guess at a database.");
  process.exit(2);
}

const { db, close } = openDatabase();

try {
  const allWorkspaces = await db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces);
  console.log(`${allWorkspaces.length} workspace(s) to visit${dryRun ? " (dry run)" : ""}.`);

  const totals = { schools: 0, created: 0, updated: 0, unchanged: 0, flagged: 0, failed: 0 };

  for (const workspace of allWorkspaces) {
    if (!dryRun) {
      const taxonomy = await migrateWorkspaceTaxonomy(db, workspace.id);
      if (taxonomy.migrated) {
        console.log(`  ${workspace.name}: taxonomy migrated (${taxonomy.promptLinks} prompt links, ${taxonomy.essayLinks} essay links, ${taxonomy.tags} tags)`);
      }
    }

    const workspaceSchools = await db.select({ id: schools.id, name: schools.name })
      .from(schools)
      .where(eq(schools.workspaceId, workspace.id));

    for (const school of workspaceSchools) {
      totals.schools += 1;
      if (dryRun) {
        console.log(`  would re-import ${school.name} (${workspace.name})`);
        continue;
      }
      try {
        // importCollege resolves the school by name and reuses the existing
        // row, so this updates in place rather than duplicating anything.
        const result = await importCollege(db, workspace.id, school.name);
        totals.created += result.counts.created;
        totals.updated += result.counts.updated;
        totals.unchanged += result.counts.unchanged;
        totals.flagged += result.counts.flagged;
        const changed = result.counts.created + result.counts.updated;
        if (changed > 0) console.log(`  ${school.name}: +${result.counts.created} ~${result.counts.updated}`);
      } catch (error) {
        // One bad school must not abandon the rest half-done.
        totals.failed += 1;
        console.error(`  FAILED ${school.name} (${workspace.name}):`, error instanceof Error ? error.message : error);
      }
    }
  }

  console.log("Done:", totals);
  if (totals.failed > 0) process.exitCode = 1;
} finally {
  await close();
}
