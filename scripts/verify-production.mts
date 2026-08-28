/**
 * Read-only production check, before and after a migration.
 *
 * SELECTs only. Prints no connection string, secret, email address, or essay
 * content: identity comes from the database name and the host's public suffix,
 * and correctness from counts and invariants.
 *
 *   node --env-file-if-exists=.env.local --experimental-strip-types \
 *     --import ./scripts/ts-resolve.mjs scripts/verify-production.mts
 */
import { sql } from "drizzle-orm";

import { openDatabase } from "../src/lib/db/client.ts";

/**
 * `db.execute` is typed as `unknown` for raw SQL in this drizzle version, so the
 * row shape is asserted once here instead of at every call site.
 */
async function query<T>(text: ReturnType<typeof sql>): Promise<T[]> {
  return ((await db.execute(text)) as { rows: T[] }).rows;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Refusing to guess at a database.");
  process.exit(2);
}
const parsed = new URL(url);
console.log(`host suffix : …${parsed.hostname.slice(-28)}`);
console.log(`database    : ${parsed.pathname.replace(/^\//, "").split("?")[0]}\n`);

const { db, close } = openDatabase();
try {
  const counts = await query<{ t: string; n: number }>(sql`
    select 'users' as t, count(*)::int as n from users
    union all select 'workspaces', count(*)::int from workspaces
    union all select 'schools', count(*)::int from schools
    union all select 'prompts', count(*)::int from prompts
    union all select 'essays', count(*)::int from essays
    union all select 'essay_versions', count(*)::int from essay_versions
    union all select 'essay_family_links', count(*)::int from essay_family_links
    union all select 'prompt_family_links', count(*)::int from prompt_family_links
    union all select 'prompt_tag_links', count(*)::int from prompt_tag_links
    union all select 'assigned_essay_responses', count(*)::int from assigned_essay_responses
    union all select 'essay_prompt_matches', count(*)::int from essay_prompt_matches
    order by t`);
  console.log("row counts");
  for (const row of counts) console.log(`  ${String(row.n).padStart(6)}  ${row.t}`);

  const families = await query<{ workspace_id: string; n: number }>(sql`
    select workspace_id, count(*)::int as n from prompt_families group by workspace_id order by workspace_id`);
  console.log("\ncategories per workspace (7 = pre-release, 11 = current)");
  for (const row of families) console.log(`  ${String(row.n).padStart(3)}  ${row.workspace_id.slice(0, 30)}…`);

  const slugs = await query<{ slug: string }>(sql`select distinct slug from prompt_families order by slug`);
  console.log(`\nseeded slugs (${slugs.length}): ${slugs.map((r) => r.slug).join(", ")}`);

  const primaries = await query<{ slug: string; n: number }>(sql`
    select f.slug, count(*)::int as n from prompt_family_links l
    join prompt_families f on f.id = l.family_id
    where l.is_primary group by f.slug order by n desc`);
  console.log("\nprimary classifications, all workspaces");
  for (const row of primaries) console.log(`  ${String(row.n).padStart(4)}  ${row.slug}`);

  const manual = await query<{ n: number }>(sql`
    select count(*)::int as n from prompt_family_links where source = 'manual'`);
  console.log(`\nhand-classified prompt links preserved: ${manual[0].n}`);

  const actions = await query<{ recommended_action: string; n: number }>(sql`
    select recommended_action, count(*)::int as n from essay_prompt_matches
    group by recommended_action order by n desc`);
  console.log("\nstored recommended_action");
  for (const row of actions) console.log(`  ${String(row.n).padStart(6)}  ${row.recommended_action}`);

  const scores = await query<{ lo: number; hi: number; n: number }>(sql`
    select min(score)::int as lo, max(score)::int as hi, count(*)::int as n from essay_prompt_matches`);
  console.log(`\nscores: ${scores[0].n} rows, range ${scores[0].lo}..${scores[0].hi} (valid is 0..100)`);

  const origin = await query<{ total: number; with_prompt: number; with_text: number }>(sql`
    select count(*)::int as total, count(origin_prompt_id)::int as with_prompt,
           count(origin_prompt_text)::int as with_text from essays`);
  const o = origin[0];
  console.log(`essays: ${o.total} total, ${o.with_prompt} with a catalogue origin, ${o.with_text} with pasted origin text`);

  const invariants = await query<{ orphans: number; two_primaries: number; stale_actions: number }>(sql`
    select
      (select count(*)::int from prompt_family_links l
         left join prompt_families f on f.id = l.family_id where f.id is null) as orphans,
      (select count(*)::int from (select prompt_id from prompt_family_links
         where is_primary group by prompt_id having count(*) > 1) x) as two_primaries,
      (select count(*)::int from essay_prompt_matches
         where recommended_action not in
           ('reusable-slight-edits','reusable-edits','reusable-significant-edits','new-response')) as stale_actions`);
  const inv = invariants[0];
  console.log(`\ninvariants — orphaned links: ${inv.orphans}, prompts with two primaries: ${inv.two_primaries}, stale action values: ${inv.stale_actions}`);
} finally {
  await close();
}
