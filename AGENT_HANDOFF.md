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

> **Current objective supersedes the list below.** The active work is the
> reuse-scoring redesign in [docs/reuse-scoring.md](docs/reuse-scoring.md);
> the exact next task and its traps are under **Overnight Run State**. The items
> below remain accurate as the wider P0 backlog and should be picked up only
> after Stages 1–4 of the current objective are done or explicitly blocked.


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

- Disposition: continue
- Objective: implement the reuse-scoring redesign in
  [docs/reuse-scoring.md](docs/reuse-scoring.md). That document is the single
  source of truth; [OVERNIGHT_TASK.md](OVERNIGHT_TASK.md) holds the five stages
  and the rules.
- Last verified commit: see below. Working tree clean, full gate green.

### Where this objective came from

A product-owner review of all 255 catalogue prompts
(`Essay_Prompt_Category_Review_Claude.csv`, 207 rows) replaced the keyword
classifier's output with hand judgements, and that changed the scoring problem
rather than merely improving its inputs. The shipped formula gave a shared
primary category 60 points, and `baseline 20 + 60 = 80` was exactly the
"ready to reuse" threshold — so two prompts sharing a broad category were
called ready to submit unchanged, with 106 of 255 prompts in one category and
the essay text never read.

### Completed in this run

| Commit | What |
|---|---|
| `35870eb` | `docs/prompt-labels.md` — the worksheet the review was built from |
| `2723d5c` | `src/lib/retrieval/category-review.ts` + test — the 255-prompt reviewed classification |
| (this one) | `docs/reuse-scoring.md` — authoritative design; new objective and handoff |

**`category-review.ts` is irreplaceable.** It was transcribed from a CSV pasted
into a chat session, not from anything in the repo, and the CSV is not
committed. It cannot be regenerated. `category-review.test.ts` guards it:
255/255 prompts reviewed, no stale rows, no duplicate keys, no undeclared
vocabulary, and the exact primary distribution.

### The distribution that drives everything downstream

| Primary | Prompts | Share |
|---|---|---|
| **Other** | **94** | **36.9%** |
| Why Major | 61 | 23.9% |
| Background & Identity (`diversity`) | 30 | 11.8% |
| Challenge & Growth | 23 | 9.0% |
| Why Us | 22 | 8.6% |
| Short Answer | 13 | 5.1% |
| Community | 7 | 2.7% |
| Personal Statement | 2 | 0.8% |
| Roommate | 2 | 0.8% |
| Reading List | 1 | 0.4% |

### Exact next task

**Stage 1 — taxonomy expansion.** In `src/lib/db/taxonomy.ts`:

1. Add three primaries to `PROMPT_FAMILIES`: `challenge-growth`,
   `reading-list`, `roommate`. Keep `other` last (its comment explains why).
2. Rename two display names only: `Community & Contribution` → `Community`,
   `Short Answers` → `Short Answer`. **Do not touch slugs** — they are join
   keys referenced by `LEGACY_FAMILY_SLUG_MAP` and by
   `essay_family_links.family_id`.
3. Add five tags to `SECONDARY_TAGS`: `academic context`, `collaboration`,
   `contribution`, `course`, `goals & future`. The review's other seven tag
   secondaries already exist.
4. Extend `src/lib/db/taxonomy-migration.ts` to re-expand 7 → 10 by
   re-importing from `category-review.ts`, preserving every `source: "manual"`
   link. The `manualFamilies` set at `taxonomy-migration.ts:89` is the existing
   pattern — a previous defect there lost a student's hand classification by
   choosing purely on `isPrimary`.
5. `sortOrder` collides on re-seed. The migration already deletes **all**
   family rows before reseeding for exactly this reason (see its comment); keep
   that.

Then `./run_tests.sh` must be green before Stage 2.

### Traps that have already cost time in this codebase

1. **Do not add a word-count penalty.** The design removes it entirely and
   replaces it with band ceilings. But removing it without adding
   `fill < 0.25 → new-response` reintroduces a fixed bug: a 15-word note scored
   80 against a 650-word prompt and was recommended as ready to reuse
   (`matching.ts:74-79`).
2. **`Other` is 37% of the catalogue and `matching.ts:41` excludes it from
   matching by construction** (`NOT_A_SHARED_THEME`). Importing the review
   without the `Other` weight vector tells students 94 prompts match nothing
   they have written. This is the single largest risk in the objective.
3. **Drizzle `text(..., {enum:[...]})` emits plain `text` with no CHECK
   constraint** (verified: `drizzle/0000:142-143`, `drizzle/0002:8`). Status and
   action vocabularies grow by editing a TypeScript union — **no migration**.
   The `RecommendedAction` rename therefore needs none, though stored values go
   stale until the reimport recomputes them.
4. **Three `why`-matching patterns once lacked the `i` flag**, so lowercase
   "why" never matched "Why Davidson" and Why Us held 0 of 255 prompts. If a
   classification count looks impossible, check regex flags first.
5. **`prompt_tag_links` holds 0 rows in production** owing to an ordering defect
   fixed in `e08247c`. Nothing can be recovered from it; re-import from
   `category-review.ts` instead.
6. **Scripts in `scripts/*.mts` need explicit file extensions** or a
   `registerHooks` resolve hook — `node --experimental-strip-types` will not
   resolve the repo's extensionless TS imports, and `node --check` does not
   resolve imports at all, so it cannot prove a script runs.

### Not authorized for an autonomous run

- **Stage 5 (semantic similarity).** It adds a dependency and downloads an ONNX
  model. Record a `HUMAN-REQUIRED:` blocker and stop. Stages 1–4 must leave the
  no-provider path working, which is what makes deferring it safe.
- **Tuning weights to improve evaluation numbers.** If Part 1 shows `Other`
  falling below the floor or false-positive top-band matches, that is a finding
  to report, not a number to fix.
- Anything in [OVERNIGHT_TASK.md](OVERNIGHT_TASK.md) rules 6 and 10: no push, no
  deploy, no Neon/Vercel change, no API key.

### Superseded — do not reimplement

The 60-point primary bonus · the 80-point Ready threshold · `ready-to-reuse` ·
`minor-adaptation` · `major-adaptation` · the corroboration gate · `sizeFactor`
and the static weight table · `confidenceFactor` · the rank/badge split · every
word-count penalty. Acceptance criterion 9 is a grep assertion over `src/` so
none of it can half-survive.

- Test/build status: full canonical gate green — lint, strict typecheck,
  **218 Vitest tests** (up from 211; +7 for the review data), production build,
  103 orchestration assertions.
- Last agent: Claude

## Last Verified Commit

`699b187` — "docs: specify the reuse-scoring redesign and set it as the
overnight objective". The full canonical gate (lint, strict typecheck, 218
Vitest tests, production build, 103 orchestration assertions) passed immediately
before this checkpoint. The working tree is clean.

Note for whoever edits this next: `validate_state` in
`scripts/overnight_handoff.sh` only tolerates post-checkpoint changes to
AGENT_HANDOFF.md, OVERNIGHT_TASK.md, CLAUDE.md, AGENTS.md and MVP_SPEC.md.
Anything under `docs/` counts as a non-doc change, so a commit touching
`docs/` must be recorded here rather than left trailing the verified commit.

Production is deployed from `09a9804` plus the reuse hotfixes through `2373f8f`;
nothing in this run has been deployed, and nothing in it changes runtime
behaviour yet — `category-review.ts` is committed data that no code path reads.
