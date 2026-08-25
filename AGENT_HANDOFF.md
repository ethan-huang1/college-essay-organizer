# Agent Handoff

Live source of truth for **current state, decisions, blockers, and next
steps**. Git holds history and rollback points — don't repeat commit-by-
commit detail here; `git log --oneline` and the commit bodies already have
it. Keep this file to roughly current-state-and-what's-next, not a diary.

Update in place after each meaningful milestone, and always before stopping
or handing off. `HUMAN-REQUIRED:` under Blockers halts the automated
pipeline (OVERNIGHT_TASK.md rule 7). Record failed approaches under Failed
Approaches (rule 9) instead of silently retrying.

See [OVERNIGHT_TASK.md](OVERNIGHT_TASK.md) for rules, [MVP_SPEC.md](MVP_SPEC.md)
for the product spec.

## Current Status

The core loop works end-to-end: **add a college (top-100 picker or manual) →
its cited prompt record imports → prompts are classified → matching essays
are suggested → a response is assigned → Categories shows the cross-school
picture.** P0 Phases 1–3 are substantially complete. Phase 4 has essay
editing, immutable versions, comparison, restoration, and filtering, but
not the deterministic accept/reject suggestion workflow. Phase 5 (JSON
backup round trip, Playwright, final documentation/layout verification) has
not started.

**The UI was rebuilt as an information architecture** (see "UI architecture"
below). No retrieval, classification, matching, essay-CRUD, versioning, or
workspace-isolation behavior changed; the only data-layer additions are one
narrow status mutation and a pure derived-progress module.

**Two distinct workspaces**, both reachable from the sidebar's Workspace
panel:

- **My workspace** (personal) starts genuinely empty. The student adds their
  own colleges through the always-visible **Add a college** form on
  `/schools#add-college`, which runs the existing `importCollege` pipeline;
  the Overview / All prompts / Categories / My essays / Reuse views then
  populate from that real data. Each school header carries **Edit details**
  (rename/notes) and **Remove**; removal is a two-step confirmation via
  `?remove=<schoolId>` that names the college, states how many prompts go
  with it, and says what survives, so no single click can destroy work.
- **Example workspace** (demo) is a reproducible seed built by running the
  *same* import pipeline over 19 real schools, plus 7 clearly labelled sample
  essays: ~112 prompts, all ten categories, 7 assignments, 784 computed
  matches. "Reset example" rebuilds it and touches no personal record.

Supplemental-prompt research is now complete for the existing top-100
picker. Commit `a717720` added the 87 previously missing school records,
registered all 100 schools, and made the full-coverage assertion mandatory.
No school remains `unresearched`.

## UI architecture

Navigation lives in the persistent sidebar (`src/app/layout.tsx`, which now
reads the workspace snapshot): Overview, All prompts, Categories, My essays,
Reuse, followed by every school with its `complete/total` progress, and the
workspace switcher. `src/app/nav-link.tsx` is the app's only client
component — it marks the active section/school.

Routes kept their paths; only their role changed:

| Route | Role |
|---|---|
| `/` | Overview dashboard: real stat tiles, progress by school and by category, top reuse opportunities. Replaced the old workspace-picker hero (switching moved to the sidebar). |
| `/schools` | **All prompts**, grouped by school, with compact school headers. `?school=&family=&status=&q=` filter it; `?edit=<promptId>` opens one edit form. |
| `/families` | **Essay categories** — the same prompt rows grouped by the existing ten-family taxonomy, each group headed by the schools asking it. |
| `/essays` | Essay library (largely unchanged, plus "answering N prompts / N more possible"). |
| `/reuse` | Reuse grouped per essay: prompts it already answers vs. prompts it still could. |

`src/app/prompt-ui.tsx` holds the one shared prompt row used by both the
school and category views: a `<details>` whose `<summary>` is a table row
(status dot, school · prompt, limit, category, status, essay) and whose body
holds full prompt text, assignment/reuse actions, a quick status control,
categories, and source/verification metadata. Two deliberate constraints:

- **Previous-cycle warnings stay on the collapsed row**, never behind
  disclosure — the spec requires that statement to be prominent.
- **The full edit form is fetched via `?edit=<id>`, not inlined per row.**
  107 inlined copies made `/schools` a 4 MB document; it is now ~1.5 MB raw
  / ~155 KB gzipped, and the remaining bulk is Next's RSC payload.

## Workspace modes

`src/lib/db/demo-workspace.ts` owns the example workspace: `DEMO_SCHOOLS`
(19 real names), `DEMO_ESSAYS` (7 sample essays, 2 of which declare a second
immutable version), a two-entry manual-reclassification list, and
`resetDemoWorkspace`, which returns a `DemoWorkspaceSummary` counted from the
database rather than from what the seed intended. `src/lib/db/seed.ts` now
holds only workspace ids, `seedTaxonomy`, and `initializePersonalWorkspace`.

Deliberate decisions worth knowing:

- **MVP_SPEC §6 asks for *fictional* schools; the repo owner overrode that**
  in favour of the real retrieval pipeline, because a demo made of invented
  prompts cannot show the product at 19 schools and 112 prompts. Registry
  data therefore stays real and cited. Only the essays are written for the
  demo, and each carries a "not your writing" note, so the spec's "never
  imply that synthetic essays belong to the user" rule still holds.
- The spec's other demo requirements are met deliberately, not by accident,
  and a test enforces each: all ten categories represented; `ready-to-reuse`,
  `major-adaptation`, and a **high** school-specificity risk all present;
  complete / in-progress / not-started all present; ≥2 essays with multiple
  versions; one essay answering prompts at two different schools.
- **The deterministic classifier never assigns "Why This School / Program".**
  Its keywords are organizer-side phrasing ("why us", "our campus"), while
  real supplements say "Why are you applying to Nursing" or "what aspects of
  our location". Two genuinely institution-fit demo prompts are corrected via
  the product's own manual-override path instead, which also demonstrates
  that feature. Widening the shared heuristic would change classifications in
  every real workspace, so it is left as a decision for a human — see Next
  Steps.
- `resetDemoWorkspace` runs its teardown in one transaction and then calls
  `importCollege` / `createEssay` / `recomputeWorkspaceMatches` outside it,
  because better-sqlite3 will not nest their transactions.

Both `?edit=<promptId>` and `?remove=<schoolId>` follow the same pattern:
state the intent in the URL, keep the current filters via `withFilters`, and
render the heavier UI only for the one record being acted on. No client
JavaScript is involved, so the confirmation works with forms alone;
`deleteSchoolAction` revalidates every view a cascade touches and redirects to
`/schools`, since the page the student was on may have been filtered to the
school that no longer exists.

`src/lib/progress.ts` derives every number the UI shows (`workState`,
`reuseCandidate`, `summarizePrompts`, `reuseOpportunities`) from a snapshot.
`reuseOpportunities` returns three buckets per essay — `inUse` (actual
assignments, regardless of match strength), `open`, and `risky` (high
school-specificity risk on an unanswered prompt, which the Reuse page renders
as "Do not reuse here" so MVP_SPEC's institution-specific warning stays
visible even though such matches score below the reuse threshold).
Nothing is persisted or hardcoded, completion counts stay current-cycle-only
per the existing policy, and "reusable" means the deterministic matcher
returned `ready-to-reuse` or `minor-adaptation`. Its parameter types are
structural, so snapshot rows satisfy them with no casting.

## Coverage (prompt retrieval)

All 100 records live under `src/lib/retrieval/sources/` and are registered
in `registry.ts`. The enforced breakdown is:

- **46 `officially-verified`** for 2026–27. This includes all seven picker
  UC campuses sharing the university's canonical eight PIQs.
- **12 `no-supplement-confirmed`**, each with an official source and a
  school-specific explanation.
- **6 `previous-cycle`** official 2025–26 sets: Carnegie Mellon, Harvard,
  Harvey Mudd, Pomona, Illinois Urbana-Champaign, and UMass Amherst.
- **36 `needs-review`**, each with zero imported prompts plus the official
  sources checked and the specific unresolved issue (usually portal-only
  wording, an omitted cycle label, or incomplete conditional-program
  coverage).
- **0 `unresearched`**.

Previous-cycle prompts remain usable for planning and classification, but
the UI labels them **“2025–26—2026–27 not confirmed”** and excludes them
from current-cycle completion statistics. `needs-review` and confirmed
no-supplement outcomes remain distinguishable from an absent record.

## Completed Work

**Overnight orchestrator reliability redesign.** Replaced the fixed
Codex-first/two-process wrapper with a durable bounded state machine:
Claude primary → one Codex reserve cycle by default → one Claude retry by
default. It classifies normal exit, usage/rate limit, crash/error, timeout,
and stall separately; independently validates the repo before every
handoff; writes per-phase stdout/stderr/exit/outcome/handoff files plus a
morning `summary.md`; persists `logs/overnight/resume.state`; recovers only
provably stale locks; and refuses to erase dirty or ambiguous state. The
default Codex limit is an explicit one-cycle proxy because neither CLI
exposes a trustworthy usage percentage. `--max-budget-usd` was removed,
Codex now uses the installed CLI's reviewed `--approve-for-me` path while
remaining in `workspace-write`, and Claude is no longer constrained by the
old package-command-blocking allowlist. Deterministic disposable-repo tests
cover completion, all failure classes, bounded exhaustion, handoffs, auth,
resume, lock safety, and morning logs.

**Personal-vs-example workspace restoration (this session, after the
redesign).** The redesign had left the Add College form collapsed behind a
disclosure and the personal workspace polluted with 18 throwaway fixture
schools, so the app opened looking pre-populated. Nothing had actually been
deleted — `git diff ac6e2b2..HEAD -- src/lib src/app/*-actions.ts` was
additions only, and `openPersonalWorkspace` / `loadDemoWorkspace` /
`addCollegeAction` / `updateSchoolAction` / `deleteSchoolAction` were all
still wired up. Fixed by: converting the fixture data into the reproducible
example-workspace seed above; wiping the personal workspace empty (owner's
explicit choice, including the pre-existing Brown import); restoring
Add-a-college to an always-visible panel with a `#add-college` anchor and a
sidebar "+ Add college" link; relabelling the workspace switcher as *My
workspace* / *Example workspace*; renaming each school's "Edit" to "Manage";
and hiding the filter bar on an empty workspace. Two seed defects found by
verification were fixed: the school-specific essay was overwriting another
essay's assignment, and the returned summary counted intended rather than
actual assignments. One redesign regression was found and fixed: high
school-specificity risks had stopped being visible anywhere.

**Confirmed college removal (this session).** Removing a college existed but
fired on a single click inside "Manage", and `deleteSchoolAction` only
revalidated `/` and `/schools` even though the cascade also empties
`/families`, `/essays`, and `/reuse`. Removal is now a visible **Remove** link
per school leading to a confirmation panel, the stale-revalidation bug is
fixed, and the action redirects to `/schools`.

**UI redesign (earlier this session).** Replaced the school-page layout whose large
left column went empty on schools with many prompts. Added the sidebar
navigation with per-school progress, the overview dashboard, category-first
browsing, and the compact scannable prompt row; demoted classification
confidence and verification detail into the expanded row; added
`src/lib/progress.ts` (+8 unit tests), `setPromptStatus` for the row's quick
status control, and `draftEssayForPromptAction` ("start a new essay for this
prompt", pre-classified from the prompt and assigned). All server actions now
also revalidate `/` since the dashboard depends on their data. The three
suggestion "Use this" buttons share one form (submitter name/value), verified
by clicking through the running app.


- Audited the clean starting checkpoint, recent commits/reflog/stashes,
  ignored and untracked paths, and overnight logs before researching. No
  unpublished Claude research artifact existed; the later UC commit
  `a537ecc` was the true starting code state despite this handoff having
  been stale.
- Researched every unprocessed picker school against official institution
  pages, preserving uncertainty instead of importing consultant-blog text.
- Added 87 typed school records, including exact current prompts where
  officially available and detailed negative/unresolved outcomes elsewhere.
- Registered all 100 picker schools and retained the existing validator,
  stable `externalRef` deduplication, change history, current/previous-cycle
  policy, taxonomy, and import architecture.
- Unskipped the top-100 completion test and strengthened it to require
  exactly 100 unique registry records, not merely successful lookups.
- Removed two obsolete ESLint suppression comments; lint is warning-free.

## Important Decisions

- Overnight execution is intentionally finite. Defaults are one Claude
  primary, one Codex reserve invocation, and one Claude retry after a
  five-minute backoff. Raising cycle counts is explicit configuration;
  exhausted durable state will not restart until a human deliberately sets
  `OVERNIGHT_RESET_STATE=1`.
- Codex reserve usage is bounded by invocation count, not a fabricated
  percentage. The CLI exposes no exact quota meter suitable for enforcing
  the requested approximate 20% reserve.
- Agent exit codes and repository safety are separate judgments. A limit or
  crash can hand off only if the working tree, handoff commit, conflicts,
  blockers, and canonical suite all validate.
- `AGENTS.md` now forwards Codex to the canonical `CLAUDE.md` instructions
  instead of maintaining a drifting machine-replaced copy.

- Official school sources remain the only basis for current-cycle claims.
  Authenticated Common App content and secondary/consultant sources were
  not used to fill gaps.
- A school with an incomplete official set (for example a known scholarship
  supplement whose exact wording is hidden) is conservatively
  `needs-review`, even when one general prompt is public. This avoids
  presenting partial coverage as complete.
- Previous-cycle prompt sets are imported as planning material with their
  actual `2025–26` cycle and warning; they are never relabeled current.
- Verification can still be overridden per prompt where one official page
  mixes exact and summarized content (the established Georgetown case).
- UC's seven picker campuses share one canonical prompt array because the
  university-wide PIQs are identical.

## Failures / Failed Approaches

- The 2026-08-24 overnight log explains the unexpectedly short first phase:
  Codex exited `0` after about seven minutes despite making no progress
  because `workspace-write` could neither install the then-missing packages
  nor create `.git/index.lock`. The old wrapper treated any zero exit as a
  successful phase. Claude then returned a JSON 429/session-limit result,
  but the wrapper collapsed it into generic exit 5. The new wrapper fixes
  the permission path and classifies progress/outcomes independently.
- The first final canonical rerun hit one existing PGlite `beforeEach`
  30-second timeout while the long-lived Next dev server was still consuming
  resources. The timeout was not raised or weakened. After stopping that
  project-local server, the persistence file passed 23/23 and a second full
  canonical run passed 95/95. Treat recurrence as resource contention first,
  then investigate PGlite startup if it reproduces under a clean load.

- One isolated `tsx` validation invocation hit a sandbox IPC `EPERM` while
  creating its temporary socket. The same records were validated through a
  safe loader and then by the canonical typecheck/vitest/build suite; this
  was a tooling-path failure, not an application failure.
- Many official sites do not expose exact 2026–27 wording publicly. Those
  cases are deliberately recorded as `needs-review`; no retries against
  unofficial sources or authenticated portals were attempted.
- Historical migration warning remains relevant: drizzle-kit once emitted
  an invalid SQLite table-rebuild migration. Inspect generated table-rebuild
  SQL before accepting future migrations.

## Blockers

None active. The 36 `needs-review` outcomes are known data-source
limitations with precise follow-up notes, not blockers to the application
or to the completed one-outcome-per-school requirement.

## Tests/Verification Performed

Orchestrator redesign checkpoints `c82deac` and `b65467e`:

- Shell syntax checks for both orchestration scripts: pass.
- Disposable-repository orchestration suite: **103/103 assertions pass**.
  Scenarios include primary completion; Claude → Codex → Claude; usage
  limits; crashes; normal exits; distinct stall and timeout outcomes;
  repeated no-progress termination; dirty and `HUMAN-REQUIRED` stops;
  bounded exhaustion; resume state; dead/live/ambiguous locks;
  stale handoffs; agent-specific subscription auth; secret redaction; and
  complete morning log artifacts.
- The final two assertions verify that a Codex fallback is not started when
  the installed CLI does not advertise the reviewed `--approve-for-me`
  capability.
- Full canonical `./run_tests.sh`: ESLint pass; strict typecheck pass;
  Vitest **95/95 pass**; production Next.js build pass; embedded
  orchestration suite 103/103 pass.
- The five authentication/session files that were uncommitted at the start
  were preserved and independently landed as `864e181`; they were not
  included in the orchestrator commit.

Full canonical `./run_tests.sh` passed immediately before the UI-redesign
commit:

- ESLint: pass, no warnings.
- Strict typecheck (`next typegen && tsc --noEmit`): pass.
- Vitest: **72/72 pass** (59 original + 12 `progress.ts` tests + 1 new demo
  coverage test), including the required 100/100 unique-school coverage
  assertion; no skipped tests.
- The demo assertions in `persistence.test.ts` were rewritten, not loosened:
  because the example workspace is now built through the real import pipeline
  its rows carry generated ids, so the tests resolve their anchors by name
  and assert the seed summary against actual database counts, exact
  `DEMO_SCHOOLS` / `DEMO_ESSAYS` lengths, a >80-prompt scale floor, distinct
  assignment targets, and the spec-required category/action/status coverage.
- Coverage report: 46 current official, 12 no supplement, 36 needs review,
  6 previous cycle, 0 unresearched.
- Production build (`next build --webpack`): pass; all routes generated.
- Overnight orchestration suite: **80/80 pass**.
- Whitespace/trailing-space and `git diff --check`: pass.

The earlier established runtime tests for prompt import, conditional notes,
change detection, history preservation, and no-duplicate refresh behavior
remain covered by the existing verified commits and test suite.

Both workspace paths were verified independently in the browser (Chrome
DevTools against `next dev`):

1. **Empty personal workspace → first college.** Personal workspace wiped to
   0 schools / 0 prompts / 0 essays; Overview showed the Add-a-college CTA;
   typing "Brown University" imported 8 officially-verified prompts with
   citations, 9 category links, and the 2026–27 cycle, and the sidebar, nav
   counts, and filter bar all appeared. A second college (Rice) was added and
   then removed via **Manage → Delete school**, cascading its prompts and
   leaving Brown's 8 intact.
2. **Example workspace.** "Example workspace" rebuilt to 19 schools / 112
   prompts / 7 essays / 9 versions / 7 assignments / 784 matches, all ten
   categories populated, 12 complete and 12 in progress, and a Reuse page
   showing 39 open opportunities plus the "Do not reuse here" warning for the
   Brown-specific essay. Personal data was untouched throughout (checked in
   SQLite after every switch), and "Reset example" is idempotent.
3. **Removing a college.** Verified on a throwaway school added for the
   purpose (the owner's own colleges were left untouched): the confirmation
   panel names the college and its prompt count; "Keep this college" changed
   nothing and preserved the active filters; confirming deleted the school and
   its 4 prompts with no orphaned category links, then redirected to
   `/schools` with the sidebar and nav counts updated. Also checked in the
   school-focused view (`?school=&status=&remove=`) and at 768 px with no
   overflow and a clean console.

Earlier browser verification of the redesign itself, against a 18-school /
112-prompt / 6-essay / 672-match local workspace (`data/` is gitignored, so
none of this fixture data was committed):

- Every route returns 200 with an empty console (no errors or warnings).
- Assigning a suggested essay, changing work status (classification source
  stayed `deterministic`, i.e. not falsely marked a manual override), and
  "start a new essay for this prompt" (creates a `school-adaptation` essay
  with version 1, prompt's category and word target, then assigns it) were
  each clicked and confirmed in SQLite.
- `?edit=<id>` renders exactly one edit form and keeps the active filters.
- Workspace switching from the sidebar works both ways; the fictional demo
  still resets to its own curated records.
- Layout checked at 1440 / 1200 / 1024 / 768 px with no horizontal overflow
  and no clipped category labels. **390 px was not directly verified** —
  Chrome would not go below a ~500 px layout viewport in this environment and
  the CDP viewport override did not take effect; the ≤620 px rules that would
  apply were exercised at ~500 px, and fixed minimums were hardened with
  `minmax(min(Xpx, 100%), 1fr)`.

## Next Steps

0. **Open decisions for a human:** (a) 390 px was never directly verified —
   see above. (b) **The classifier cannot recognise real "why us" prompts.**
   `FAMILY_KEYWORDS["why-school"]` matches organizer-side phrasing that no
   real supplement uses, so genuine fit prompts land in
   Community & Contribution instead, and no *personal* workspace will ever
   populate the Why This School / Program category. Adding phrasings such as
   "why are you applying", "aspects of our", "our mission" would fix it but
   changes classifications for every existing prompt in every workspace, so
   it was deliberately left alone. (c) Adding a school not in the registry
   still silently produces a school with zero prompts plus a note; worth a
   clearer UI affordance.
1. **Exact next priority:** finish P0 Phase 4's deterministic editing-
   suggestion workflow. Implement prompt-fit, clarity, concision, and
   word-limit suggestions with understandable before/after text; individual
   accept must create a new immutable version, while reject must leave essay
   content and version history unchanged. Add unit/integration coverage.
2. P0 Phase 5: JSON export and re-import preserving core relationships.
3. Add at least one complete Playwright workflow, then verify desktop/mobile
   overflow and browser console cleanliness.
4. Finish README/architecture/limitations/future-AI documentation and run
   the full P0 Definition-of-Done audit.
5. Periodically revisit the 36 `needs-review` and 6 `previous-cycle`
   records as schools publish additional official 2026–27 material; this is
   maintenance, not a prerequisite for the next product milestone.

## Overnight Run State

- Disposition: **complete for this run.** Every phase in the approved plan is
  committed and green, including both stretch phases. What remains is listed
  under Human Follow-Up and Deliberately Not Done.
- Objective: make the MVP trustworthy for student testing.
- Completed phases, in plan order:
  | Phase | Commit | What it fixed |
  |---|---|---|
  | 0 baseline | `48bc303` (tag `pre-trust-run`) | rollback point, gate verified green |
  | 1 essay editor | `a6d8ed3` | the 176x48px writing box |
  | 2 zero-prompt colleges | `c18a796` | colleges vanishing; prose-derived state |
  | 3 workload engine | `4f3e1c7` | counting rows instead of required essays |
  | 4 catalogue encoding | `0c3872f` | group/program rules that lived only in prose |
  | 5 reuse correctness | `3c9e56a` | four defects making reuse advice wrong |
  | 6a family slugs | `315dfab` | a rename silently collapsing every score |
  | 6b seven categories | `d4b888d` | ten overlapping categories; empty Why Us |
  | 7 pending states | `c4afeaf` | ~10s actions with no feedback at all |
  | 8 two responsive fixes | `17ffc7e` | clipped Reuse tab; collapsed input |

### Measured effect, on real catalogue data

| Measure | Before | After |
|---|---|---|
| Essay writing box at 1440px | 176x48px | 1087x320px |
| Whole catalogue: prompt rows -> required essays | 255 counted as work | 207 canonical rows, **94 required** |
| Seven UC campuses | 56 rows, 0 required, 100% unreachable | **8 rendered rows, 4 required** |
| Demo workspace (19 schools) | 112 counted as work | **51 required essays** |
| Prompts classified as Why Us | **0 of 255** | 39 of 255 |
| Catalogue unclassified / needs review | 112 (44%) | **0 (0%)** |
| Previous-cycle prompts leaking into reuse | yes | zero |
| 15-word essay vs a 650-word prompt | scored 80, "ready to reuse" | penalised, not reusable |
| Vitest tests | 95 | **170** |

### Human follow-up required (not blockers)

1. **Apply the migrations and redeploy.** `drizzle/0002_broken_prima.sql`
   (additive: 9 ADD COLUMN, 2 indexes, 1 check) and
   `drizzle/0003_premium_tana_nile.sql` (adds `prompt_families.slug`, nullable
   -> backfilled -> NOT NULL). Both were read before accepting; drizzle-kit
   emitted a bare `ADD COLUMN ... NOT NULL` for 0003, which fails on a table
   with rows, so it was hand-edited. Neither Neon nor Vercel was touched during
   this run (OVERNIGHT_TASK.md rules 6 and 10).
2. **Then run `scripts/reimport-catalogue.mts`.** It migrates each workspace's
   taxonomy and re-imports every college, in that order - the order matters,
   because the import classifies against the new slugs. Human-run only, refuses
   to start without `DATABASE_URL`, and goes through the ordinary import path.
   Try `--dry-run` first.
3. **Authenticated end-to-end and responsive verification at
   1440/1024/768/390px is unperformed**, by deliberate instruction: there is no
   local Postgres or Docker on this machine, so a signed-in session would have
   meant using the production database. Only one datapoint was captured before
   that instruction landed (the essay textarea, above). Everything else was
   verified through PGlite integration tests, the full canonical gate, strict
   typecheck, lint, and the production build.
4. **A throwaway account `qa-local@example.com` exists in production Neon.** It
   was created moments before the no-production instruction arrived - user row
   and empty personal workspace only, no college, prompt, or essay. Left in
   place rather than issuing another production write. Safe to delete; cascade
   deletion is covered by tests.

### Deliberately not done, with reasons

- **54 conditional prompts across 16 schools are still unencoded.** They render
  as *unresolved* - visible, excluded from required, never silently counted.
  `coverage.test.ts` names the encoded schools explicitly, so a half-finished
  file cannot pass quietly, and prints the outstanding count.
- **Duke, Northwestern, Bowdoin and W&L's optional prompt sets are not
  grouped.** The plan listed Duke, Northwestern and Bowdoin as group files, but
  that was an error in the plan rather than a gap in the work: Duke's,
  Northwestern's and W&L's sets are genuinely "you may answer one of these", so a
  required group would overstate the work, and Bowdoin publishes two optional
  essays with no choose-N rule at all. Their required counts are already right;
  only the optional tally reads "3" rather than "up to 1 of 3".
- **The rest of Phase 8's responsive and density polish.** Judgement-based
  visual work, and authenticated browser verification was unavailable - a CSS
  change nobody can see is where a regression hides. The two defects with
  precisely located causes were fixed; the rest is untouched.

### Decisions worth knowing before changing this code

- **Canonical siblings share response state.** Prompts sharing a `canonical_key`
  are one question. Assignment and status writes fan out across siblings, inside
  `lib/assignments.ts` and `lib/prompts.ts` rather than the Server Actions, so
  every caller inherits it. That invariant is what lets every read path pick any
  instance, and why removing one UC campus cannot orphan a shared assignment.
  A new campus inherits its siblings' state on import.
- **`workload.ts` is the only place required work is counted**, and
  `canonicalPromptGroups` the only place aggregate collections are built. Seven
  count sites and four render sites route through them; that is what stops the
  sidebar, school headers and overview disagreeing.
- **Omitting `secondaryFamilyIds` means "keep them", `[]` means "clear them".**
  The picker is gone from both forms, so a save carries no secondaries and must
  not wipe importer-derived links.
- **`Other` is a real seventh category, never a queue.** Needs-review is a
  separate signal, from `classificationConfidence`. The four retired concepts
  are internal tags in `prompt_tag_links` / `essay_tag_links` with no UI.
- **Family identity is the slug, never the display name.** Names are
  user-editable; joining on them collapsed every score in the workspace.
- **A conditional prompt resolves three ways, not two.** Unresolved is a real
  state and must stay visible.

- **Pre-production verification complete.** See [DEPLOYMENT.md](DEPLOYMENT.md)
  for the verdict, the migration rehearsal results, the exact production
  sequence, the invariants to check at each step, and the rollback constraints.
  Five real defects were found and repaired (one blocker: `updatePrompt` did not
  fan status out to canonical siblings). Verdict: READY WITH SPECIFIED MANUAL
  CHECKS.
- Test/build status: full canonical gate green - lint, strict typecheck,
  **191 Vitest tests**, production build, 103 orchestration assertions.
- Last agent: Claude

## Last Verified Commit

`17ffc7e` — "fix: stop the nav clipping Reuse and the add-college input
collapsing". Every commit in this run is independently green; the full canonical
gate (lint, strict typecheck, 170 Vitest tests, production build, 103
orchestration assertions) passed immediately before each checkpoint and again at
this one. The working tree is clean.
