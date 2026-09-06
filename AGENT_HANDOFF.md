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

> **This file is stale for the three most recent sessions.** The workload bands,
> availability states, published logos, the deploy through `5c0aed9`, and the
> **Essay Editor / My Essays dashboard** are all recorded in
> [HANDOFF.md](HANDOFF.md), which is authoritative for UI matters. The Essay
> Editor - including the reuse-as-copy change, Mark complete, and the
> sentence-case pass - sits in the working tree, uncommitted (HANDOFF.md §9
> and §10). **Reuse now copies an essay into a new prompt-specific document
> rather than attaching one essay to a second prompt**; `assignEssayAction`
> was deleted because nothing called it any more.

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

**Two distinct workspaces**, both reachable from the account menu at the top
right:

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

**Rebuilt by the UI/UX redesign.** The plan is
`~/.claude/plans/plan-mode-only-do-majestic-koala.md`; the durable record is the
"The interface" section of [README.md](README.md) and
[docs/school-photos.md](docs/school-photos.md). No product logic changed —
`git diff --stat src/lib/` over the whole redesign shows only the additive
`school-photos.ts` and its test.

Navigation is a **horizontal top bar** (`src/app/(app)/layout.tsx`): the
wordmark leads to Overview, then five tabs — **Your Prompts / Categories /
My Essays / Essay Editor / Reuse** — then a Plans link and an avatar button opening an account
menu built on the native `popover` attribute (workspace switch, photo credits,
sign out). The 248px left sidebar is gone; its school list was a navigation
shortcut duplicating the filter's school select, and the at-a-glance view of
colleges now lives on Overview as cards.

`src/app/nav-link.tsx` is no longer the only client component: `pending-button.tsx`
and, since the Essay Editor, `(app)/editor/[essayId]/document-surface.tsx` are
the other two. The editor's surface exists for a live word count and an idle
autosave, which a server component cannot do; the writing textarea is still the
version form's real `content` field, so the page works with JavaScript off.
`nav-link.tsx` marks the
current section, and now also keeps a section current on its own sub-routes.

Routes kept their paths; only their labels and presentation changed:

| Route | Role |
|---|---|
| `/` | **Overview**: six stat tiles, then every college as a card with its identity mark, progress ring and catalogue-state pill, then progress-by-category and top reuse opportunities as row panels. |
| `/schools` | **Your Prompts**: one card per college, its prompts as compact hairline-separated rows. `?school=&family=&status=&q=` filter it — unchanged behaviour — via a toolbar whose active selections appear as removable chips. `?edit=<promptId>` opens one edit form. |
| `/families` | **Categories**: the same rows grouped by the eleven-category taxonomy, reusing the group card rather than a per-prompt card. |
| `/essays` | **My Essays**: one card per essay, carrying the **reuse ribbon** — college marks ringed by reuse band showing where that essay can actually go. The Write disclosure is a writing surface: the reading face at a real measure, with the essay's origin prompt sticky above it. |
| `/reuse` | **Reuse** per essay, consuming the same band pills and score marks. |
| `/plans` | Reads the local markdown plans in `~/.claude/plans` (developer surface; the directory does not exist on a deployed server, which shows the empty state). |
| `/photo-credits` | Photograph attribution and the independence notice. |

`src/app/prompt-ui.tsx` still holds the one shared prompt row used by the
college and category views: a `<details>` whose `<summary>` is a seven-column
grid (status dot · school+requirement · prompt · limit · category · status ·
essay · chevron) and whose body holds full prompt text, assignment/reuse
actions, a status control, categories, and source metadata. Column alignment
was deliberately kept — it is what makes a hundred prompts scannable — but the
visible table head is gone, since the values label themselves. Two constraints
carry over unchanged:

- **Previous-cycle warnings stay on the collapsed row**, never behind
  disclosure — the spec requires that statement to be prominent.
- **The full edit form is fetched via `?edit=<id>`, not inlined per row.**
  107 inlined copies made `/schools` a 4 MB document.

Styling is `src/app/globals.css` as a short list of imports over
`styles/tokens.css`, `styles/base.css`, `styles/primitives.css` and one
`styles/features/*.css` per view. The 2311-line monolith and the `legacy.css`
that carried it through the migration are both gone. `src/app/contrast.test.ts`
asserts WCAG AA on every token pair and fails if a colour is added without
being checked.

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

Rebuilt from the 2026–27 research master on 2026-09-01 (branch
`dataset-import-qa`). All 100 records live under `src/lib/retrieval/sources/`
and are registered in `registry.ts`, but they are now **generated** rather
than hand-written:

```
docs/catalogue/master-supplemental-2026-27.json   the research master (provenance)
docs/catalogue/previous-catalogue.json            the pre-rebuild catalogue, frozen
scripts/catalogue-transform.mts                   every human judgement
scripts/build-catalogue.mts                       the mechanical transform -> sources/*.ts
scripts/sync-category-review.mts                  prunes dead review rows, writes the worksheet
scripts/qa-catalogue.mts                          deterministic QA gate (exit 1 on any finding)
```

**553 prompts across 100 schools** (was 255). The breakdown:

- **83 `officially-verified`** — the school publishes the prompts itself.
- **12 `common-app-verified`** — corroborated across independent current-cycle
  sources rather than read off the school's own page (the master's
  `CORROBORATED`).
- **5 `no-supplement-confirmed`** — Colby, Middlebury, Tulane (which dropped
  "Why Tulane?" this cycle), Georgia, Wesleyan.
- **0 `needs-review`**, **0 `previous-cycle`**, **0 unresearched**.

Requirement mix: 125 `required`, 194 `optional`, 234 `conditional`, of which
**231 carry a `programKey`** and **only 3 are unresolved** (Pittsburgh, UMass
Amherst, Wisconsin–Madison — each gated on something the app cannot model,
e.g. "required unless you apply through the UW application").

**Choose-N sets are groups, not conditionals.** 28 schools declare a
`promptGroups` entry (135 prompts), so the app counts the essays a school
actually asks for: UC's eight PIQs are 4, Dartmouth's six longer responses
are 1, Caltech's Scientific Drive is 2 of 3. A set that only applies to one
programme keeps `requirement: "conditional"` **and** a `groupKey`, so the
programme gate is evaluated before the group — the pre-existing Washington
and Lee Johnson Scholarship encoding, preserved exactly (0 required until
Johnson is selected, then 1 of 5).

**Nine rows in the master are deliberately not prompts** and are dropped by
name in `catalogue-transform.mts`: four Purdue Honors rows the master itself
marks `not_applicable` and contradicted, two "no public prompt text exists"
records (UConn BA Art, Villanova PSP), two Georgia Tech requirement
statements, and one Northeastern portal field label.

**Limits the schema cannot hold stay null.** Pages, paragraphs, sentences,
"13 words per stem", "25 characters per word": 41 prompts carry the exact
constraint in `prompts.notes` instead of a converted word count, because a
page count turned into a word count is a number the student would write to.
Ohio State's malformed `"350-500"` became min 350 / max 500.

Previous-cycle prompts no longer come from the catalogue; they are produced
by pruning (below). The UI still labels them "2025–26 — 2026–27 not
confirmed" and excludes them from current-cycle completion statistics.

### Pruning: what happens to a prompt the catalogue drops

`pruneStalePrompts` (in `college-import.ts`) runs on every import, scoped to
rows with an `externalRef` so a student's own prompts are never touched:

- **Nothing invested** (not started, no assignment, no essay claiming it as
  origin) → **deleted**, so it disappears.
- **Anything invested** → **re-filed under the previous cycle** and marked
  `previous-cycle`. It counts toward nothing, carries the existing "do not
  treat as a current requirement" warning, and the essay, its versions and
  the assignment all survive. Deleting it would cascade the assignment away
  and null the essay's `originPromptId` — the student's own record of what
  they wrote it for.

`ImportCollegeResult.counts` gained `retired` and `removed`;
`scripts/reimport-catalogue.mts` reports both per school.

### Classification: all 553 records reviewed

Every catalogue prompt now has a hand-assigned primary category, uncapped
secondaries and a prompt function. `category-review.test.ts` asserts zero
unreviewed prompts and fails until a catalogue rebuild's new prompts are
covered.

The worksheet is **`docs/evaluation/prompt-review.csv`**, one row per unique
prompt text (502 rows for 553 records; a row fans out to every record sharing
its text, so the eight UC Personal Insight Questions are one decision applied
to seven campuses). It replaced `source-review.csv` and `new-prompt-review.csv`,
which had different schemas, three secondary slots each and a precedence rule
between them. Both originals are in git history at `7104142`.

The pipeline:

| Script | Does |
|---|---|
| `build-prompt-review.mts` | (Re)builds the worksheet. Never overwrites a filled `Final *` cell. |
| `apply-review-decisions.mts` | Merges a TSV of decisions, validating every value against the vocabulary first. |
| `audit-review-consistency.mts` | Worklist: the `Other` census, secondary counts, vocabulary use, and near-duplicate prompts classified differently. |
| `regenerate-category-review.mts` | Worksheet → `category-review.ts`. Refuses to write if any row lacks a primary or a function. |

**The near-duplicate check is a review flag, never an assertion.** Prompts above
cosine 0.75 that got different primaries or functions are printed for a human to
re-read. Highly similar prompts can legitimately differ - Brown's "Why
medicine?" and "Why PLME?" are the most similar pair in the whole corpus and
need opposite categories - so nothing may force a cluster to agree.

What the pass changed, at record grain:

| | Before | After |
|---|---|---|
| Unclassified | 303 (55%) | 0 |
| Effective `other` | 232 (42%) | 136 (24.6%) |
| No secondary at all | 375 (68%) | 82 (15%) |
| Two or more secondaries | 40 | 271 |
| `community` | 7 | 33 |
| No prompt function | 224 (40.5%) | 0 |

`Other` is now mostly what it should be: portfolio instructions, graded-paper
submission requirements, audition scenarios and UChicago's riddles.

### Reuse scoring: two factors and three ceilings

`contentFitScore = category(35) + semantic(45) + function(20)`, nothing
subtracted, bands unchanged at 70/60/50. The design is
[docs/reuse-scoring.md](docs/reuse-scoring.md); the configuration was chosen by
`scripts/sweep-scoring.mts` against a 29-case calibration set and reported in
[docs/evaluation/scoring-sweep.md](docs/evaluation/scoring-sweep.md).

Result on the specification case - one activity-and-service story framed four
ways - all twelve ordered pairs now clear the reuse floor, where four were
"New response recommended":

| pair | before | after |
|---|---|---|
| Princeton → Harvard | 34 new-response | 61 reusable-edits |
| Princeton → Stanford | 39 new-response | 66 reusable-edits |
| Harvard → Princeton | 40 new-response | 67 reusable-edits |
| Stanford → Princeton | 46 new-response | 73 slight-edits |
| Georgetown → Stanford | 58 significant-edits | 76 slight-edits |

Precision held: 5.51% of pairs in the top band, 18.26% at or above the floor,
all nine calibration negatives passing on score *and* band.

**Three things measurement reversed, and they are the ones to know before
editing `matching.ts`:**

1. **Function could not be removed from the score.** The plan was to make it a
   band ceiling only. With just two function groups that hands full marks to
   50.2% of pairs, inflating the share at or above the floor from 18% to 32%,
   and drops the calibration negatives from 9 of 9 to between 0 and 5 - because
   same-topic-different-ask pairs are exactly what it was catching.
   All-or-nothing fails the other way, costing two positives. Within-group
   credit is 0.25.
2. **`Other` is not a missing category.** A missing primary means nobody
   looked - neutral. `Other` means a reviewer read the prompt and found nothing
   fits - a finding, and it takes the floor rung. Conflating them gave a free
   half-weight to 42% of all pairs.
3. **Why Us could not simply be excluded.** Treated as an ordinary category it
   was involved in 27.8% of every top-band pair. Excluded outright, an essay
   written for Brown's Open Curriculum stopped ranking Brown's own prompt first.
   The condition is the *institution*, read off the school-specific phrases
   already detected in the essay's prose.

A hand-maintained related-category table (Community ↔ Activities and so on) was
built and then deleted: once every prompt had real secondaries it stopped
earning its place, and the sweep prefers it off.

**Word count is still never in the score.** `adaptationEffort` is a separate
axis - Minimal / Some / Significant shortening required / Expansion required -
derived at render, so no migration. Georgetown's essay scores 76 against
Stanford's 50-word prompt and reads "Significant shortening required".

### Embedding model: benchmarked, and kept

`scripts/benchmark-embeddings.mts` scores candidates against the frozen scorer.
`Xenova/all-MiniLM-L6-v2` wins: 29/29 calibration and 8/8 holdout, against
29/29 + 7/8 for bge-small with its instruction prefix and worse for everything
else. See [docs/evaluation/embedding-benchmark.md](docs/evaluation/embedding-benchmark.md).

I had called the model upgrade the next lever with the highest expected gain. It
was not the lever at all on this corpus. **Two caveats before treating that as
final:** every pair in the benchmark is prompt-against-prompt, while production
embeds a long essay against a short prompt; and the instruction prefix decides
the answer, so any future candidate must be run in the form its model card
specifies.

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

HUMAN-REQUIRED: decide what to do about `Other`. All five stages of the
reuse-scoring objective are complete, and the evaluation
([docs/evaluation/reuse-scoring.md](docs/evaluation/reuse-scoring.md)) locates
the remaining coverage gap in one place: `Other` is 94 of 255 catalogue prompts
(37%) and only 16.7% of its prompts on a ten-college list have any reusable
material, the worst of any category where reuse is expected. That is a taxonomy
question - whether 37% of the corpus belongs in a category defined as "fits
nowhere else" - and retuning the scoring weights would only disguise it. Options
are to split `Other` into real categories, or to accept that bespoke prompts are
genuinely less reusable. Not an autonomous call: it changes what the product
claims about a third of the catalogue.

HUMAN-REQUIRED: read a sample of real recommendations before release. Every
number in the evaluation uses catalogue prompts as stand-ins for essays, so they
bound the answer rather than settle it. `semantic-matching.test.ts` now pins the
qualitative behaviour on the demo workspace and the results read well - a
roommate note tops the ranking for another school's roommate prompt, an
institution-specific essay identifies its own school - but demo essays are not a
student's essays.

Note for whoever runs `scripts/overnight_handoff.sh`: `validate_state` greps for
`HUMAN-REQUIRED:` and fails preflight while these lines are present. That is
intended - both remaining items are product decisions - but they must be resolved
or removed before the pipeline will start on anything else.

The 36 `needs-review` catalogue outcomes remain known data-source limitations
with precise follow-up notes, not blockers.

## Tests/Verification Performed

### Reuse scoring, end to end on a real database

PGlite, six colleges imported, one real 149-word essay about the Inkstone
Project (grandparents teaching calligraphy at a senior centre, eleven
volunteers, intergenerational service), classified Activities & Impact by the
student. Top suggestions, read as a student would see them:

```
 79  Reusable with slight edits   Minimal adaptation               Princeton   Your Voice: service and civic engagement
 75  Reusable with slight edits   Minimal adaptation               Harvard     Activities, employment, travel, or family responsibilities
 70  Reusable with edits          Significant shortening required  Stanford    An extracurricular, job, or responsibility
 66  Reusable with edits          Minimal adaptation               Georgetown  Most significant activity
 ...
 45  New response recommended     Minimal adaptation               Duke        Viewpoints and experiences
 44  New response recommended     Minimal adaptation               Georgetown  A differing viewpoint
 42  New response recommended     Minimal adaptation               Harvard     A strong disagreement
```

Reads correctly on all four counts that matter:

- **All four target prompts surface**, and Princeton's - the one that scored 34
  and "New response recommended" before any of this - is now the single best
  suggestion at 79.
- **Stanford's 50-word prompt scores 70 and says "Significant shortening
  required"**, which is the whole point of separating the two axes: the
  substance fits, the length is work.
- **The disagreement prompts correctly sit at 42–45 and "New response
  recommended".** An intergenerational-service story is not a story about
  disagreeing with someone, however much category vocabulary they share.
- **Format guards hold**: Wake Forest's five-book list scores 18 and Harvard's
  roommate note 16, both `new-response`.

One finding, recorded under Next Steps rather than fixed: Princeton's "submit a
graded written paper" instruction appears at 60. It is not a prompt.


### 2026–27 catalogue rebuild (2026-09-01, branch `dataset-import-qa`)

`./run_tests.sh` equivalents all green on the rebuilt catalogue:
**lint clean, typecheck clean, 716 tests / 25 files passing, `next build`
successful.** Baseline before the rebuild was 693 tests; the difference is
three new tests (prune outcomes, student-authored prompts left alone, the
corroborated tier) plus splits within the retrieval suites.

`scripts/qa-catalogue.mts` is the deterministic gate and passes with zero
findings. It re-checks, on what actually landed in the source records rather
than on the master: 100 unique schools matching `TOP_UNIVERSITIES` exactly;
no `needs-review` record and no note still reading as unresolved research;
`validateRecord` clean for all 100; unique refs and no duplicate text+scope
within a school; **every one of the 553 prompt texts identical to the master
after whitespace collapse** (which is what proves nothing was truncated or
reworded in transform); positive integer limits only; every conditional
prompt carrying a note; at most 5 unresolved conditionals; no choose-N member
individually required; every review row pointing at a live prompt; one
committed embedding per prompt; and the review worksheet covering exactly the
unreviewed set.

Rehearsed end to end against a throwaway PGlite database (never
`DATABASE_URL`), importing the hardest eleven schools:

| school | prompts | required | optional | awaiting programs |
|---|---|---|---|---|
| Cornell | 26 | 0/0 | 0 | 26 (14 programmes, no university-wide supplement) |
| Michigan | 25 | 0/2 | 1 | 22 |
| UC Berkeley | 9 | 0/4 | 0 | 1 (M.E.T.) |
| UC Los Angeles | 8 | 0/4 | 0 | 0 |
| Georgetown | 10 | 0/3 | 0 | 7 (one per undergraduate school) |
| Washington and Lee | 10 | 0/0 | 5 | 5 (Johnson) |
| Dartmouth | 9 | 0/3 | 0 | 0 |
| Villanova | 5 | 0/1 | 0 | 0 |
| Tulane | 0 | 0/0 | 0 | 0 (no-supplement) |
| Colgate | 3 | 0/0 | 3 | 0 |
| Yale | 10 | 0/5 | 3 | 0 |

Berkeley and UCLA import 17 rows but the aggregate reports **one** group,
"Personal Insight Questions (choose four): 4 of 8 across UC Berkeley, UC Los
Angeles" — 4 essays of work, not 16. Selecting Johnson at W&L moves it from
0 required to 1 of 5, matching the pre-rebuild behaviour exactly.

Two misfiles were caught by that rehearsal and fixed, both worth knowing
about because the same shape will recur next cycle:

1. **Program-gated choose-N sets must stay `conditional`.** Marking members
   `optional` (correct for an applicant-choice set) made `conditionalState`
   short-circuit to "active", so W&L's Johnson set required an essay of every
   applicant. Members of a set with a `programKey` keep `requirement:
   "conditional"`.
2. **A scope that matches every applicant is not a gate.** Yale's three short
   takes carried `undergraduate_school: "Yale College"`, which every Yale
   applicant belongs to, and their real condition is the application platform.
   They sat as "depends on your programs" behind a gate nobody could ever
   fail. Now `required`, with the QuestBridge carve-out in the note.

**The live database has not been touched.** To apply:
`node --env-file-if-exists=.env.local --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/reimport-catalogue.mts`
(`--dry-run` first; it reports `+created ~updated -removed retired N` per
school and recomputes matches per workspace).


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

### Owner action

1. **Apply the catalogue and the classification to the live database** with
   `scripts/reimport-catalogue.mts`. **Nothing has been applied yet** - the
   2026–27 rebuild, the full classification and the rescoring are all committed
   on `main` and none of them has touched Neon. The reimport rewrites the
   category links and recomputes every match, so it changes what every existing
   workspace sees.
2. **Read the recommendations and judge them.** This is the one check none of
   the above replaces, and it is still outstanding: every number in
   `docs/evaluation/` uses catalogue prompts as stand-ins for essays. An
   end-to-end run with a real 149-word essay is in the verification section and
   reads correctly, but that is one essay.
3. **Decide what to do about procedural rows.** The end-to-end run surfaced
   Princeton's "submit a graded written paper" instruction as a 60-point reuse
   suggestion. It is not a prompt at all: it is filed `Other`, so the category
   ladder gives it the floor, but its long paragraph of instructions reads as
   semantically similar to a long essay. `catalogue-transform.mts` already drops
   nine "not a prompt" rows by name; the graded-paper requirements, portfolio
   instructions and AI-disclosure fields are the same kind of thing and there
   are perhaps twenty of them. Dropping them is a data judgement for the owner,
   not a scoring change.

> **Both recent objectives are complete**: the reuse-scoring redesign
> ([docs/reuse-scoring.md](docs/reuse-scoring.md)) and the UI/UX redesign (see
> **UI architecture** and **Overnight Run State**). Neither has been deployed.
> The list below is the wider P0 backlog and is the next thing to pick up.
>
> Item 3's "verify desktop/mobile overflow" is now done for the four main views
> at 1440px, 2880px and 390px; what remains of it is the Playwright workflow.
> Mobile beyond the no-horizontal-scroll floor is deliberately deferred.


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
   suggestion workflow. The Essay Editor is the surface it belongs on, and its
   Shorten & adapt panel is the place to put it — length guidance is already
   live there (`src/app/essay-guidance.ts`), the matcher's per-prompt notes are
   labelled with the version they came from, and accept/reject would slot in
   beside them. **No AI, no automated rewriting** without an explicit decision:
   the panel deliberately only surfaces guidance today. Implement prompt-fit, clarity, concision, and
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

- Disposition: complete
- Objective: **UI/UX redesign — complete.** Both phases of
  `~/.claude/plans/plan-mode-only-do-majestic-koala.md` are done: top
  navigation, card/row vocabulary, tokens and split stylesheets, school marks,
  Overview, Your Prompts, My Essays and the reuse ribbon, Categories, Reuse,
  the essay editor surface, empty states, the photography machinery and the
  credits page, plus the parity, contrast and dead-rule sweeps.
- The previous objective (the reuse-scoring redesign) remains complete and
  deployed; its record is [docs/reuse-scoring.md](docs/reuse-scoring.md).
- Working tree clean, full canonical gate green (377 Vitest tests).

### Redesign verification

- `git diff --stat src/lib/` over the whole redesign shows only the additive
  `school-photos.ts` and its test. No product logic changed.
- `src/app/redesign-parity.test.ts` pins the filter predicates (moved to
  `filtering.ts` so they are testable) and the 30 form field names every
  Server Action reads by string, where a rename is invisible to TypeScript.
- `src/app/contrast.test.ts` asserts WCAG AA on 29 token pairs and the 12 mark
  colours, and fails if a colour is added without being checked.
- Verified in Chrome at 1440px, 2880px and 390px: exactly one
  `aria-current="page"` and it is the nav tab; filter chips are named removal
  links carrying neither `aria-pressed` nor `aria-current`; no unlabelled form
  control; visible focus everywhere, light on the dark nav; keyboard order
  follows visual order; the account popover opens and closes; no horizontal
  scroll at any of the three widths.
- `scripts/audit-production-scores.mts` (read-only) reports **1130/1156
  identical (97.8%)**, not the 1156/1156 the plan expected. The 26
  disagreements are all **±1 point** and every one sampled keeps the same reuse
  band, so no recommendation changes. **The redesign cannot be the cause:**
  `git diff 059f7f1..HEAD --stat src/lib/` shows only the two additive
  `school-photos` files, and the audit imports neither. The likely explanation
  is that the stored scores were computed by the ONNX runtime on Vercel's
  linux/x64 while this audit runs on darwin/arm64, so the semantic factor
  differs in the last decimal before rounding. Worth confirming before anyone
  treats a ±1 drift as a regression.
- **`axe` was not run** — it is not a dependency. Instead the specific rules the
  plan named were checked directly in the page: see the bullet above.
- Before/after performance measured against a production build of `059f7f1` in
  a worktree: [docs/evaluation/redesign-performance.md](docs/evaluation/redesign-performance.md).
  CLS 0.00 both. **Two honest negatives recorded there:** warm LCP is +57 ms,
  and first-load bytes are +63% because the two real typefaces cost 85 KB.

### Two traps for the next agent

1. **A bare `"@"` alias in `vitest.config.mts` is a prefix match** and also
   rewrites `@huggingface/transformers` to `src/huggingface/transformers`,
   which fails a semantic-matching test with a confusing message. It is
   anchored on `/^@\//` now; do not "simplify" it back to a string key.
2. **Local dev points `DATABASE_URL` at the production Neon database.** UI work
   was done against a throwaway PGlite-over-socket server instead
   (`@electric-sql/pglite-socket`, `maxConnections` above 1 — the default of 1
   gives `ECONNRESET` because `openDatabase` uses a 5-connection pool). Do not
   sign up test accounts against production.

### Completed

| Commit | Stage | What |
|---|---|---|
| `2723d5c` | — | `category-review.ts`: the 255-prompt hand-reviewed classification |
| `699b187` | — | `docs/reuse-scoring.md`, the authoritative design |
| `8ca4ed7` | 1+2 | taxonomy 7 -> 10; review wired into the import path |
| `4d2aa9f` | 3 | four-factor score, four bands, band ceilings, `Other` vector |
| `7b5297a` | 4 | first evaluation (bounds only) |
| `df76f50` | — | word-count recalibration + root-cause tests for two earlier fixes |
| `c6bf55e` | 5 | local ONNX embeddings, committed prompt vectors |
| `b2a613d` | 4 | evaluation rerun with real embeddings |
| `b03da7d` | — | end-to-end semantic matching test |

Scoring weights are **25 / 35 / 20 / 20** and were not retuned.

### The results

Full report: [docs/evaluation/reuse-scoring.md](docs/evaluation/reuse-scoring.md),
regenerated by
`node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/evaluate-reuse-scoring.mts`.

| Measure | No provider | **With semantic** |
|---|---|---|
| Portfolio coverage, all prompts, ≥50 | 40.4% | 36.2% |
| Portfolio coverage, reuse-expected prompts, ≥50 | — | **45.5%** |
| Coverage ≥60 | 19.1% | **29.8%** |
| Coverage ≥70 | 14.9% | **21.3%** |
| Top-band pairs (of 65,025) | 774 | **1,478** |

**A previous conclusion in this file was wrong and is retracted.** The first
evaluation bracketed semantic similarity by pinning it at its ceiling for every
pair and read 89.4% coverage off that bound as a forecast. An upper bound assumes
every pair is maximally similar, which no corpus is; the real figure is 36.2%
aggregate. Coverage at ≥50 *fell* when the model landed, because with no provider
the factor hands every pair a free neutral 18 of 35 and weak pairs were living on
those points. Fewer, better recommendations.

Factor contributions, across all pairs: semantic earns 64% of the points awarded
and discriminates on 86% of pairs; function earns 17% overall but 27% among
top-band pairs, acting as a gate on the strong end; primary is at its floor on
91% of pairs, which is arithmetic with ten categories; **secondary is the weak
factor** at a mean of 1.4 of 20, most likely because the review gives most
prompts only one or two secondaries. Recorded, not acted on.

Ceilings: the function ceiling is present on 45.7% of pairs and *binds* on 5 of
65,025 - forfeiting its 20 points already drops mismatched pairs below 70, so it
is a guarantee rather than a mechanism.

Ranking: mean top-10 overlap with the superseded formula is 28.9%; the previously
top-ranked suggestion survives in the top 10 for 25.1% of prompts. Intended, and
needs a release note.

### Bugs found by measurement, not by report

1. **Embedding batching.** Passing several texts at once pads them to the longest
   and mean-pools over the padding, so a text's vector depends on its batch -
   cosine 0.991 between the same prompt in two batches, against 1.000000 twice
   alone. Committed vectors and runtime essay vectors are produced in different
   passes, so this would have put an error the size of the real between-prompt
   differences into every comparison. Fixed by embedding one text per call, which
   is also faster.
2. **Quantisation scale.** A fixed int8 scale maps a typical component (~1/√384)
   onto ~6 of 127 levels: cosine 0.988 against the original. Per-vector scaling
   costs four characters per row and brings it under 0.01%.
3. **`migrateWorkspaceTaxonomy` completeness** (in `8ca4ed7`) - it only asked "is
   any slug retired?", so a workspace already on the seven categories reported
   "already migrated" and would never have gained the three new families. That is
   every existing production workspace.
4. **Tag vocabulary** (in `4d2aa9f`) - prompt tags are seeded display names and
   `classifyText` emitted slugs, so they could never intersect and the secondary
   factor scored zero for every pair in every workspace.
5. **Word-count ceilings** - `fill < 0.60` fired on most of the demo workspace. A
   300-word essay against a 650-word maximum is a legitimate answer.

### Pathological case worth knowing

Semantic similarity alone is fooled by shared vocabulary: an essay about
rebuilding a free library ranks "list five books you have read" second of ten
prompts because it is full of the word *books*. The composite handles it -
Reading List is a different category and a different function, so factors 1 and 4
both score zero - and this is the concrete argument against letting semantic
similarity dominate the formula.

### If you are picking this up

- **Do not retune the weights** without a product decision. The evaluation shows
  the gap is `Other`, not arithmetic.
- The test suite runs with `DISABLE_LOCAL_EMBEDDINGS=1` so it is hermetic;
  `embedding.test.ts` and `semantic-matching.test.ts` opt back in and skip when
  the model is absent. Do not remove that: a test whose result depends on whether
  a 25MB download happened is flaky, not passing.
- Re-run `scripts/precompute-prompt-vectors.mts` after any catalogue change or a
  change to `EMBEDDING_MODEL`. Embeddings are only comparable to others from the
  same model.
- Nothing has been deployed.

- Test/build status: full canonical gate green - lint, strict typecheck,
  **260 Vitest tests**, production build, 103 orchestration assertions.
- Last agent: Claude
## Last Verified Commit

`103f030` — "docs: benchmark two stronger embedding models, and keep the one we
have". The full gate passed on it: lint clean, strict typecheck clean, **909
Vitest tests in 43 files** plus the 8 sealed-holdout cases via
`REUSE_HOLDOUT=1`, production build successful, `scripts/qa-catalogue.mts`
passing with zero findings.

**Nothing is deployed** (`git push origin main` deploys) and **the live database
has not been touched**. Everything through `5c0aed9` is what production runs.

The 2026–27 catalogue rebuild landed as a fast-forward of `dataset-import-qa`
into `main` at `72ed32f`, after the uncommitted Essay Editor and AI-coach work
was committed on its own at `15c0442` so the rebuild could land on a clean tree
rather than being merged into a dirty one. The persistence-test conflict the old
handoff warned about did not materialise: the two change sets touch different
regions of the file and git resolved it.
