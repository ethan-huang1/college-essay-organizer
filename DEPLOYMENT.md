# Deployment handoff — trustworthiness release

Verdict: **READY WITH SPECIFIED MANUAL CHECKS.**

Five real defects were found and repaired during pre-production verification, one
of them a blocker. Nothing outstanding blocks the migration or the deploy, but
the sequence below is not optional: two steps have ordering constraints that
cannot be recovered by re-running them.

Nothing in this run touched Neon, Vercel, or any remote. No push, no deploy.

---

## 1. State

| | |
|---|---|
| Branch | `main` |
| HEAD | `a369e22` |
| Baseline | `pre-trust-run` (`48bc303`) |
| Commits since baseline | **19** (11 implementation + 8 verification) |
| Working tree | clean |
| Remote | 19 commits unpushed |
| Pending migrations | `drizzle/0002_broken_prima.sql`, `drizzle/0003_premium_tana_nile.sql` |

### Commits added by this verification run

| Commit | What |
|---|---|
| `c4e54fd` | **BLOCKER** — fan out prompt status across canonical siblings on edit |
| `6a88198` | **HIGH** — stop reading a sentence-opening word as a school mention |
| `36cc0b2` | **HIGH** — make the taxonomy migration atomic; keep manual provenance |
| `80fb444` | MEDIUM — tolerate unassigning a vanished prompt; deterministic group counts |
| `879357f` | MEDIUM — remove control characters that made a source file binary to git |
| `b60dd0e` | docs — remove stale ten-family references from MVP_SPEC |
| `48dbbfd` | tests — regression coverage for the five repairs |
| `a369e22` | tests — the production-shaped migration rehearsal |

Each behavioural fix has a regression test verified to fail before it and pass
after. The two most serious:

- **`updatePrompt` did not fan out.** `setPromptStatus`, `assignEssayToPrompt`
  and `unassignPrompt` all kept canonical siblings in lockstep; `updatePrompt`
  did not, and it writes `status` because the Edit form carries a Status select.
  A student marking a shared UC prompt complete at one campus left its siblings
  `not-started`, so every aggregate count silently became ordering-dependent —
  which is precisely the invariant that lets the read path pick an arbitrary
  instance. No existing test covered it.
- **The taxonomy remap read outside its transaction.** It snapshotted link rows,
  then deleted this workspace's links wholesale and reinserted from the snapshot.
  A link committed by the running app in between was deleted and never restored,
  losing a classification with no error and no way to recover by re-running.

---

## 2. Test commands and results

```
./run_tests.sh                                        exit 0 — 12 files, 191 tests
npx vitest run src/lib/db/migration-rehearsal.test.ts exit 0 — 12 tests
npx vitest run src/lib/db/persistence.test.ts         exit 0 — 37 tests
npm run typecheck                                     clean
npm run lint                                          clean
next build                                            succeeds
```

Baseline before this run was 170 tests; 191 now. The gate was run green at the
start (to establish the baseline) and again at the end.

---

## 3. What the migration rehearsal proved

`src/lib/db/migration-rehearsal.test.ts` applies **only** migrations 0000+0001
through a trimmed journal, writes legacy-shaped rows with raw SQL into the three
tables 0002/0003 alter, and only then runs the real migrations folder. It
therefore exercises the committed `ALTER TABLE` and backfill SQL against
populated tables rather than simulating the outcome.

Fixture: two users with separate personal workspaces, schools and prompts in
both, an essay with two versions, assignments, varied prompt statuses, the
ten-category taxonomy with a hand-classified (`source: 'manual'`) link, two UC
campuses sharing canonical prompts, a choose-2-of-3 group, and conditional and
previous-cycle prompts.

All twelve checks pass:

1. Both migrations apply to a populated database; the new columns and the
   `NOT NULL` slug land (asserted against `information_schema`).
2. Users, workspaces, essay text, version history, assignments, prompt statuses
   and school membership are byte-identical afterwards.
3. Slugs backfill correctly and survive a display-name rename with identical
   match scores; 0003's name-fallback branch is exercised by a row whose id
   predates the `:family:slug` convention.
4. The remap drops no link, keeps exactly one primary per owner, dedupes a real
   two-secondaries-collapse, and preserves `manual` provenance.
5. Re-running the remap is a no-op.
6. One UC assignment satisfies the shared requirement without deleting the
   sibling campus's own prompt row.
7. Deleting one campus keeps the shared assignment on the survivor.
8. A choose-2-of-3 group completes at 2, not 3.
9. Unresolved and unselected conditionals stay out of required work; answering
   the program question flips one in, proving the gate is live.
10. A previous-cycle prompt with a genuinely `ready-to-reuse` match is absent
    from both workload and reuse — not a vacuous check.
11. A full mutate sequence in workspace A leaves workspace B's snapshot
    byte-identical.

Independently reviewed and found sound: workspace isolation across every changed
mutation path (no cross-account leak; every Server Action derives `workspaceId`
server-side, never from form data), the max-achievable-score arithmetic, and the
empty-essay case (an empty or near-empty essay can never reach
`ready-to-reuse`).

---

## 4. Remaining uncertainty

1. **The rehearsal models legacy production, it is not a production snapshot.**
   It reconstructs the pre-migration shape from the committed migration history
   in PGlite. Real Neon data could contain rows no code path in this repo
   produces. The 0003 backfill is defensive about that (id-derived, then
   name-mapped, then slugified-with-hash) but it was verified against a
   reconstruction.
2. **No authenticated browser verification.** There is no local Postgres or
   Docker on this machine and PGlite is in-process only, so a signed-in session
   would have required production credentials. Everything was verified through
   PGlite integration tests, typecheck, lint and the production build instead.
   The manual UI checks in step 6 below are consequently unperformed and are
   yours to run.
3. **The taxonomy remap's concurrency window is narrowed, not closed.** Reads
   now happen inside the transaction under a per-workspace advisory lock, but
   Postgres defaults to READ COMMITTED, so a concurrent commit is still visible
   mid-transaction. **Run the reimport before traffic resumes.**
4. **Production migrates with drizzle-kit; the rehearsal used the ORM
   migrator.** Same SQL, same journal; the entry point differs. drizzle-kit
   delegates to the ORM migrator, so migrations are transactional — but take the
   restore point in step 1 regardless.
5. **54 conditional prompts across 16 schools are still unencoded.** They render
   as *unresolved* — visible, excluded from required, never silently counted.
   Correct but incomplete.

---

## 5. Production sequence

Do these in order. Do not skip step 1.

### Step 1 — Restore point
Create a Neon branch or confirm a point-in-time restore target, and record the
timestamp.
**Stop condition:** if you cannot create one, stop. Steps 2 and 5 are not
reversible by re-running.

### Step 2 — Migrate
```
npm run db:migrate      # applies 0002 then 0003
```
**Stop condition:** any error. Migrations are transactional, so a failure rolls
back rather than half-applying — but verify with the post-migration invariants
below before continuing, and do not proceed on a partial result.

### Step 3 — Deploy
```
git push origin main    # Vercel redeploys on push
```
Must come **after** step 2: HEAD reads `prompt_families.slug`,
`schools.catalogue_status`, `schools.selected_programs` and seven new `prompts`
columns. Deploying first breaks every page that loads a workspace.

**Rollback constraint — read this before you need it.** Rolling the *code* back
after step 2 is only partly safe. Old code ignores the new nullable columns, so
existing users keep working, but old `seedTaxonomy` inserts `prompt_families`
without `slug`, which is now `NOT NULL` with no default — so **new sign-ups
would fail**. Prefer rolling forward. If you must roll back, expect sign-up to
be broken until you roll forward again.

### Step 4 — Dry-run the reimport
```
node --env-file-if-exists=.env.local --experimental-strip-types \
  scripts/reimport-catalogue.mts --dry-run
```
Read-only: the taxonomy remap is gated behind `if (!dryRun)` and the import
behind an early `continue`. Verified.
**Stop condition:** unexpected workspace or school count. Investigate before
step 5.

### Step 5 — Real reimport
```
node --env-file-if-exists=.env.local --experimental-strip-types \
  scripts/reimport-catalogue.mts
```
This is what migrates each workspace's taxonomy from ten categories to seven and
re-imports every college so the group/program metadata lands. **Without it,
existing workspaces keep their old families and every newly imported prompt
silently classifies as nothing**, because the import resolves the new
seven-category slugs.

Run it with the app not serving writes (see uncertainty 3). A per-school failure
is caught and does not abort the loop, and both halves are idempotent, so a
partial run is safely resumable by re-running.
**Stop condition:** any `FAILED` line. Re-running is safe; investigate first.

### Step 6 — Smoke checks
Unperformed here, so these are the ones that matter most:

- Sign in; the Overview loads without a 500.
- Create an essay: the writing box is full-width and ~320px tall, not 176×48.
- A college with no supplement (e.g. Colby) is **visible** and says
  "No supplemental essay" rather than vanishing or claiming a filter.
- Add two UC campuses: All Prompts shows a **Shared prompts** section with 8
  rows naming both campuses, and the header reads 4 required, not 16.
- Assign an essay to a UC PIQ through one campus; confirm the other campus reads
  assigned and the prompt leaves "Not started".
- Reuse shows length guidance ("248 words → cut to 150"), and a 15-word stub is
  not offered as ready-to-reuse.
- At 500px: the Reuse nav tab is reachable and the add-college input is
  full-width.
- Sign up as a new user (this is the path the rollback constraint would break).

---

## 6. Invariants to verify

### Before migrating — record these numbers
```sql
select count(*) from users;
select count(*) from workspaces;
select count(*) from schools;
select count(*) from prompts;
select count(*) from essays;
select count(*) from essay_versions;
select count(*) from assigned_essay_responses;
select workspace_id, count(*) from prompt_families group by 1 order by 1;
select count(*) from prompt_family_links;
select count(*) from essay_family_links;
select count(distinct prompt_id) from prompt_family_links;
select count(distinct essay_id)  from essay_family_links;
```

### After step 2, before step 3
```sql
-- every new column present
select column_name from information_schema.columns
 where (table_name='prompts' and column_name in
        ('shared_application_key','canonical_key','group_key','group_label',
         'group_required_count','program_key','program_label'))
    or (table_name='schools' and column_name in ('catalogue_status','selected_programs'))
    or (table_name='prompt_families' and column_name='slug');   -- expect 10 rows

select count(*) from prompt_families where slug is null;        -- MUST be 0
select is_nullable from information_schema.columns
 where table_name='prompt_families' and column_name='slug';     -- MUST be 'NO'
```
Every count from the previous block must be **unchanged**, including the
per-workspace family counts — 0003 backfills a column, it does not add or remove
families.
**Stop condition:** any count moved, or any slug null.

### After step 5
```sql
-- seven categories per workspace
select workspace_id, count(*) from prompt_families group by 1 order by 1;

-- nobody has two primaries  (both MUST return 0 rows)
select prompt_id from prompt_family_links where is_primary group by 1 having count(*) > 1;
select essay_id  from essay_family_links  where is_primary group by 1 having count(*) > 1;

-- canonical lockstep: shared prompts agree on status  (MUST be 0 rows)
select canonical_key from prompts
 where canonical_key is not null
 group by workspace_id, canonical_key having count(distinct status) > 1;

-- nobody lost their classifications entirely
select count(distinct prompt_id) from prompt_family_links;   -- >= the pre-migration value
select count(distinct essay_id)  from essay_family_links;     -- >= the pre-migration value

-- hand classifications survived
select count(*) from prompt_family_links where source = 'manual';
```
`users`, `workspaces`, `essays`, `essay_versions` and
`assigned_essay_responses` counts must all be unchanged from before step 2.
**Stop condition:** a duplicate primary, a divergent canonical status, or a drop
in distinct classified owners. Restore from step 1.

---

## 7. Still outstanding

- **`qa-local@example.com` needs deliberate cleanup.** A throwaway account in
  production Neon — user row and empty personal workspace only, no college,
  prompt or essay. It was deliberately not touched during this run. Deleting the
  user cascades the workspace; that cascade is covered by tests.
- During this verification a stale browser session for that account caused a few
  read-only page loads to reach production Neon through the local dev server
  before it was noticed and the session closed. No writes, no mutations.
- The 54 unencoded conditional prompts (uncertainty 5).
- The responsive and density polish deliberately left undone, listed in
  `AGENT_HANDOFF.md`.
