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
 * Also renames school rows whose name is not the canonical spelling, because a
 * non-canonical name never matches the retrieval registry: the school imports
 * as "manual" with zero prompts and reads "No verified prompts on file" while
 * the catalogue holds its whole question set under the full name. A rename is
 * skipped (and logged loudly) when the canonical name is already taken in that
 * workspace - merging two schools' work is a human decision, not a script's.
 *
 * --dry-run writes nothing and prints the full drift report: every rename
 * candidate, and every prompt row whose cycle or verification status disagrees
 * with the catalogue. Read it before running for real.
 *
 * This is a deliberate, human-run operation against whatever DATABASE_URL
 * points at. It is not wired into the app, the build, or the test suite.
 *
 *   node --env-file-if-exists=.env.local --experimental-strip-types \
 *     scripts/reimport-catalogue.mts [--dry-run]
 */
import { eq } from "drizzle-orm";

import { openDatabase } from "../src/lib/db/client.ts";
import { applicationCycles, prompts, schools, workspaces } from "../src/lib/db/schema.ts";
import { importCollege } from "../src/lib/college-import.ts";
import { migrateWorkspaceTaxonomy } from "../src/lib/db/taxonomy-migration.ts";
import { recomputeWorkspaceMatches } from "../src/lib/reuse.ts";
import { lookupSchoolSource } from "../src/lib/retrieval/registry.ts";
import { canonicalizeUniversityName } from "../src/lib/top-universities.ts";

const dryRun = process.argv.includes("--dry-run");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Refusing to guess at a database.");
  process.exit(2);
}

const { db, close } = openDatabase();

// Tallied by reportDrift, printed once at the end of a dry run.
const drift = { renames: 0, blockedRenames: 0, cycle: 0, status: 0, noRecord: 0 };

/**
 * Read-only: prints everything a real run would change about a school's
 * identity and its prompts' cycle/verification columns.
 *
 * It reports the same two comparisons the import itself makes, so a clean
 * report is a genuine prediction that the run is a no-op. It cannot predict
 * prompt-text updates or prunes - those are upsertPrompts' own business - so
 * it says nothing about them rather than guessing.
 */
async function reportDrift(
  workspace: { id: string; name: string },
  school: { id: string; name: string },
  canonical: string,
  siblings: readonly { id: string; name: string }[],
) {
  const where = `${school.name} (${workspace.name})`;

  const rows = await db.select({
    externalRef: prompts.externalRef,
    verificationStatus: prompts.verificationStatus,
    cycleLabel: applicationCycles.label,
  })
    .from(prompts)
    .innerJoin(applicationCycles, eq(prompts.cycleId, applicationCycles.id))
    .where(eq(prompts.schoolId, school.id));

  if (canonical !== school.name) {
    const taken = siblings.find((other) => other.id !== school.id && other.name === canonical);
    if (taken) {
      drift.blockedRenames += 1;
      console.log(`  RENAME BLOCKED  ${where}: "${canonical}" already exists in this workspace - needs a hand-merge, will be skipped.`);
    } else {
      drift.renames += 1;
      console.log(`  RENAME  ${where} -> "${canonical}" (${rows.length} prompt row(s) on the misnamed record)`);
    }
  }

  const source = lookupSchoolSource(canonical);
  if (!source) {
    drift.noRecord += 1;
    console.log(`  NO CATALOGUE RECORD  ${where}: stays manual, keeps its ${rows.length} prompt row(s) untouched.`);
    return;
  }

  const statusByRef = new Map(source.prompts.map((raw) => [raw.externalRef, raw.verificationStatus ?? source.verificationStatus]));
  for (const row of rows) {
    // No externalRef means a hand-typed prompt, which no catalogue record
    // can claim; an unmatched ref is the prune's business, not ours.
    if (!row.externalRef) continue;
    const wantStatus = statusByRef.get(row.externalRef);
    if (wantStatus === undefined) continue;
    if (row.cycleLabel !== source.cycleLabel) {
      drift.cycle += 1;
      console.log(`  CYCLE   ${where} ${row.externalRef}: ${row.cycleLabel} -> ${source.cycleLabel}`);
    }
    if (row.verificationStatus !== wantStatus) {
      drift.status += 1;
      console.log(`  STATUS  ${where} ${row.externalRef}: ${row.verificationStatus} -> ${wantStatus}`);
    }
  }
}

try {
  const allWorkspaces = await db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces);
  console.log(`${allWorkspaces.length} workspace(s) to visit${dryRun ? " (dry run)" : ""}.`);

  const totals = {
    schools: 0, created: 0, updated: 0, unchanged: 0, reconciled: 0,
    flagged: 0, retired: 0, removed: 0, renamed: 0, failed: 0, recomputed: 0,
  };

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
      const canonical = canonicalizeUniversityName(school.name);

      if (dryRun) {
        await reportDrift(workspace, school, canonical, workspaceSchools);
        continue;
      }

      if (canonical !== school.name) {
        const taken = workspaceSchools.find((other) => other.id !== school.id && other.name === canonical);
        if (taken) {
          console.error(`  SKIPPED rename ${school.name} -> ${canonical} (${workspace.name}): that name already exists here. Merge by hand.`);
          totals.failed += 1;
          continue;
        }
        await db.update(schools).set({ name: canonical }).where(eq(schools.id, school.id));
        school.name = canonical;
        totals.renamed += 1;
        console.log(`  renamed ${workspace.name}: -> ${canonical}`);
      }

      try {
        // importCollege resolves the school by name and reuses the existing
        // row, so this updates in place rather than duplicating anything.
        const result = await importCollege(db, workspace.id, school.name);
        totals.created += result.counts.created;
        totals.updated += result.counts.updated;
        totals.unchanged += result.counts.unchanged;
        totals.reconciled += result.counts.reconciled;
        totals.flagged += result.counts.flagged;
        // Retired/removed are the prune's two outcomes for a prompt the
        // catalogue no longer carries - reported per school because a large
        // number at one school is worth a human look before it ships.
        totals.retired += result.counts.retired;
        totals.removed += result.counts.removed;
        const changed = result.counts.created + result.counts.updated + result.counts.reconciled
          + result.counts.retired + result.counts.removed;
        if (changed > 0) {
          console.log(`  ${school.name}: +${result.counts.created} ~${result.counts.updated} =${result.counts.reconciled} -${result.counts.removed} retired ${result.counts.retired}`);
        }
      } catch (error) {
        // One bad school must not abandon the rest half-done.
        totals.failed += 1;
        console.error(`  FAILED ${school.name} (${workspace.name}):`, error instanceof Error ? error.message : error);
      }
    }

    // Recompute the whole workspace's matches, once, after its schools are in.
    //
    // Mandatory rather than tidy-up. essay_prompt_matches stores a score and a
    // recommendedAction, and both are outputs of code that this deployment
    // changes: the four-factor weights, and a renamed set of band values. Left
    // alone, every stored row would hold an action string the current
    // ACTION_LABELS map has no key for, and the reuse UI would render a blank
    // where the recommendation should be - not a crash, which is worse, because
    // nothing would report it.
    //
    // Skipped in a dry run, which is why the dry run cannot prove this step.
    if (!dryRun) {
      try {
        await recomputeWorkspaceMatches(db, workspace.id);
        totals.recomputed += 1;
      } catch (error) {
        totals.failed += 1;
        console.error(`  FAILED recompute (${workspace.name}):`, error instanceof Error ? error.message : error);
      }
    }
  }

  if (dryRun) {
    console.log("\nDrift report totals:", drift);
    console.log("Nothing was written. Re-run without --dry-run to apply.");
  } else {
    console.log("Done:", totals);
  }
  if (totals.failed > 0) process.exitCode = 1;
} finally {
  await close();
}
