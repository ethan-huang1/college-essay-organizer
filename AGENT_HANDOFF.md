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

`src/lib/progress.ts` derives every number the UI shows (`workState`,
`reuseCandidate`, `summarizePrompts`, `reuseOpportunities`) from a snapshot.
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

**UI redesign (this session).** Replaced the school-page layout whose large
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

Full canonical `./run_tests.sh` passed immediately before the UI-redesign
commit:

- ESLint: pass, no warnings.
- Strict typecheck (`next typegen && tsc --noEmit`): pass.
- Vitest: **67/67 pass** (59 existing + 8 new `progress.ts` tests),
  including the required 100/100 unique-school coverage assertion; no
  skipped tests.
- Coverage report: 46 current official, 12 no supplement, 36 needs review,
  6 previous cycle, 0 unresearched.
- Production build (`next build --webpack`): pass; all routes generated.
- Overnight orchestration suite: **80/80 pass**.
- Whitespace/trailing-space and `git diff --check`: pass.

The earlier established runtime tests for prompt import, conditional notes,
change detection, history preservation, and no-duplicate refresh behavior
remain covered by the existing verified commits and test suite.

Browser verification of the redesign (Chrome DevTools against `next dev`,
using a local personal workspace built through the real import path — 18
schools, 112 prompts, 6 essays, 672 computed matches; `data/` is gitignored,
so this is local-only fixture data, not committed):

- Every route returns 200 with an empty console (no errors or warnings).
- Assigning a suggested essay, changing work status (classification source
  stayed `deterministic`, i.e. not falsely marked a manual override), and
  "start a new essay for this prompt" (creates a `school-adaptation` essay
  with version 1, prompt's category and word target, then assigns it) were
  each clicked and confirmed in SQLite.
- `?edit=<id>` renders exactly one edit form and keeps the active filters.
- Workspace switching from the sidebar works both ways; the fictional demo
  still resets to its own curated records.
- Empty-workspace path checked against a temporary blank database: the
  overview shows the Add-a-college CTA, and adding a real school imported and
  classified its 8 prompts. The original database was restored afterwards.
- Layout checked at 1440 / 1200 / 1024 / 768 px with no horizontal overflow
  and no clipped category labels. **390 px was not directly verified** —
  Chrome would not go below a ~500 px layout viewport in this environment and
  the CDP viewport override did not take effect; the ≤620 px rules that would
  apply were exercised at ~500 px, and fixed minimums were hardened with
  `minmax(min(Xpx, 100%), 1fr)`.

## Next Steps

0. **Redesign follow-ups worth a look:** (a) 390 px was not directly
   verified — see above; (b) the fictional demo's three hand-curated matches
   contain no *open* reuse opportunity, so the demo's Reuse page shows one
   "already answering" row and zero open ones. Making the demo demonstrate
   open reuse means either recomputing its matches on reset or adding curated
   rows, and `persistence.test.ts` asserts exactly three demo matches — a
   human should decide before that test changes.
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

## Last Verified Commit

`a4fc7a6` — "Rebuild the UI as an essay-management information
architecture". Full canonical
verification above (`./run_tests.sh`: lint, typecheck, 67 vitest tests,
production build, 80 orchestration tests) passed immediately before it,
alongside the browser verification listed above.
