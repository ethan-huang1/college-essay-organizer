# Agent Handoff

This file is the live source of truth for **context, discoveries, blockers,
verification status, and next steps** during an overnight run. It is a
continuously maintained document, not a log to append to or overwrite blindly
— edit each section in place so it always reflects current reality.

- **Git** is the source of truth for code state and rollback points.
- **This file** is the source of truth for what's going on and what's next.

Update the relevant section(s) after any meaningful milestone, discovery,
blocker, verification result, or decision — and always right before a
session ends or control passes to another agent (Codex ↔ Claude). If you hit
something that needs a human decision, add a line starting with exactly
`HUMAN-REQUIRED:` under Blockers instead of guessing (see OVERNIGHT_TASK.md
rule 7) — the automated pipeline halts when it sees that marker. If you
attempt something and it fails, record it under Failed Approaches (rule 9)
rather than silently retrying.

See [OVERNIGHT_TASK.md](OVERNIGHT_TASK.md) for the rules and
[MVP_SPEC.md](MVP_SPEC.md) for the real objective (the College Essay
Organizer MVP product spec).

## Current Status

P0 Phase 1 (Foundation) is complete with verified application, persistence, and
workspace-integration checkpoints.
The interrupted Claude run left a partially transferred `create-next-app`
scaffold and a complete local dependency installation despite its final log
claiming the scaffold had been removed. Codex audited and preserved that work,
restored the missing App Router layout and pages, added the required canonical
test runner and setup notes, and committed the tested code at `1a34260`.

The application provides a responsive editorial shell and navigation, explicit
personal/demo workspace actions, cookie-scoped active workspace state, useful
personal empty states, and real views of seeded schools, prompts,
essays, families, and reuse examples. The SQLite schema, migration, taxonomy,
isolated seed services, and database tests are complete. Phase 2 now has
verified workspace-scoped school and prompt CRUD, including editable primary
and secondary prompt families and manual classification overrides. Essay CRUD,
filtering, and search remain unfinished.

## Completed

- Layer 1: repo-based handoff protocol (`OVERNIGHT_TASK.md`,
  `AGENT_HANDOFF.md`, `CLAUDE.md`).
- Layer 2: manual end-to-end Claude → Codex handoff test, independently
  verified; cleaned up by human authorization (history preserved in git
  log, commits `ae586f2`..`280835d`).
- Layer 3: `scripts/overnight_handoff.sh` — Codex-then-Claude, strictly
  sequential, never concurrent. Fail-closed subscription-only auth
  preflight (`run_auth_preflight`) runs before each real agent call:
  rejects `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` presence, requires Claude
  `claude auth status --json` to show `loggedIn:true`,
  `authMethod:"claude.ai"`, `apiProvider:"firstParty"`, and an allowlisted
  `subscriptionType` (`pro|max|team|enterprise`), requires Codex
  `codex login status` to say exactly "Logged in using ChatGPT". Lock is
  acquired *before* the auth preflight so a held lock blocks even the
  auth-status calls. Codex ending nonzero does not auto-abort the run — the
  orchestrator judges safety from repo/handoff state
  (`validate_state()`: clean tree, no conflicts, valid non-stale Last
  Verified Commit, no `HUMAN-REQUIRED:` marker) and continues to Claude if
  Codex's checkpoint is safe, reporting exit code 12 ("degraded but
  recovered") rather than silently claiming success. Claude runs with
  `--permission-mode auto` (not `acceptEdits`, not `bypassPermissions`).
  Full exit-code table in CLAUDE.md.
- `scripts/test_overnight_handoff.sh`: 80 deterministic assertions against
  disposable scratch repos with fake `claude`/`codex` executables (no real
  API, auth, or model calls) — the full auth allowlist and every rejection
  case, lock-before-auth ordering, the safe-continuation logic and all its
  exit codes, and every regression case from Layers 1-3. All passing.
- `MVP_SPEC.md` (new): the full College Essay Organizer product spec
  (mission, taxonomy, data model, UX, matching architecture, demo
  workspace, tech/visual direction, phases, verification, P0 DoD).
- `OVERNIGHT_TASK.md`: Objective now points to MVP_SPEC.md; gained a
  bounded-effort/retry-limit rule, an expanded no-external-spend rule, a
  usage-limit/degraded-run-not-a-failure rule, and a spec-change-
  invalidates-stale-verification rule.
- `CLAUDE.md`: documents the zero-spend design, the manual Claude Settings
  usage-credits/auto-reload prerequisite (not verifiable from the repo),
  corrected `CLAUDE_BUDGET_USD` framing, and the exit-code table.
- Real CLI facts confirmed read-only (zero-cost, no model calls) during
  planning: `claude auth status --json` field shapes, `claude --help`'s
  `--permission-mode` choices including `"auto"`, `codex login status`'s
  exact output string. No real Claude/Codex smoke call was made during any
  part of this implementation or its testing, per explicit instruction.
- Audited the interrupted run completely: all required documents, tracked and
  untracked changes, dependency tree, and every file in
  `logs/overnight/20260824T035205Z`. The run ended with orchestrator exit `5`
  because Claude reached its usage limit; the filesystem nevertheless retained
  a usable Next.js 16.3.2/React 19.2.8 install and partial scaffold.
- Recovered and verified the Next.js App Router foundation: strict TypeScript,
  Tailwind CSS, ESLint, pinned lockfile, production scripts, responsive base
  design system, navigation, home page, and static section routes.
- Added executable root `run_tests.sh` as the canonical verification command
  and `SCAFFOLD_README.md` with local install/start/test instructions. The app
  requires no API keys or external resources.
- Verified application code commit:
  `1a34260822a2ab58cd23703187fbc58403ba6131` — "Checkpoint verified Next.js
  application scaffold".
- Added the P0 local persistence foundation with pinned Drizzle ORM and
  better-sqlite3 dependencies, 14 core tables, generated migration metadata,
  database constraints, and repo-local migration commands.
- Seeded all ten editable prompt families and 21 optional tags per workspace.
  The explicit demo reset creates three fictional schools, prompts covering all
  ten families, six synthetic essays, multiple versions of two essays, safe and
  dangerous reuse examples, and cross-school essay assignments without
  changing personal records.
- Added five Vitest integration tests that apply the real migration in memory
  and verify core tables/foreign keys, taxonomy idempotency, primary and
  secondary families plus manual override, personal/demo isolation, and
  multi-school essay relationships.
- Verified persistence code commit:
  `dd4753f97636ed6fe7e8480e0ff178f008583a38` — "Add local SQLite persistence
  foundation".
- Added a server-only database lifecycle boundary that applies migrations and
  initializes the personal workspace on first use; better-sqlite3 remains
  external to the browser bundle.
- Made personal/demo choice explicit through server actions and an HTTP-only,
  same-site active-workspace cookie. Loading the demo resets demo-owned records
  only; switching back leaves personal data untouched.
- Replaced all four static placeholders with workspace-scoped views: school and
  prompt lists, essay/version/link summaries, family coverage, and transparent
  reuse examples with missing requirements and school-specific risk.
- Added a sixth database integration test for strictly scoped workspace read
  models and verified code commit
  `2467657a621fb4a35716517c20fb000d38f91bc4` — "Connect workspace selection to
  local data".
- Added workspace-scoped school services and server actions for create, rename,
  and delete. Names are normalized and validated; attempts to mutate a school
  through another workspace fail; the UI explicitly warns that delete cascades
  the school-owned prompts.
- Added compact create/edit/delete forms to the Schools page and a seventh
  integration test covering validation, workspace isolation, update, delete,
  and prompt cascade behavior. Verified code commit:
  `122f13818d563e29840698d754476a48722ba3fe` — "Add workspace-scoped school
  CRUD".
- Added workspace-scoped prompt create, edit, and delete services plus server
  actions. The service validates that both the selected school and every
  selected family belong to the active workspace, normalizes duplicate family
  choices, and applies prompt and family-link changes atomically.
- Extended the Schools page with compact prompt create/edit/delete workflows
  using the existing visual language. Each prompt supports one optional primary
  family, multiple secondary families, word-count bounds, requirement,
  application status, deadline, notes, and visible deterministic/manual
  provenance. Saving a family edit records a manual override without changing
  the existing taxonomy or migration.
- Preserved existing prompt text during classification-only edits, including
  paragraph breaks. Manual overrides replace stale family links, mark every
  current link as manual, and reset deterministic confidence to zero. Prompt
  deletion uses existing foreign-key cascades for family links, matches, and
  response assignments.
- Expanded persistence coverage from seven to ten tests for prompt CRUD,
  primary/secondary assignments and enriched reads, deterministic-to-manual
  overrides, cross-workspace school/family rejection without partial writes,
  scoped deletion, and relationship cascades. Verified code commit:
  `52add4368f9cf60b5a46dbec62e599c1f6cdc534` — "Add workspace-scoped prompt
  CRUD".

## In Progress

P0 Phase 2 (Core Organization). School and prompt CRUD are complete. Essay CRUD
with immutable content versions is the highest-priority unfinished slice,
followed by filtering, search, and browser workflow coverage.

## Next Steps

1. Implement essay CRUD, search, status/family filters, and canonical versus
   school-adaptation labels using immutable versions for content changes.
2. Add Playwright coverage for workspace selection and one complete
   organization workflow before moving into Phase 3 matching work.
3. Continue Phase 3 with editable many-to-many essay/prompt relationships and
   deterministic reuse scoring after Phase 2 organization is verified.

## Failed Approaches

- During the automated Codex phase, offline npm version lookup returned
  `ENOTCACHED`, and the first registry-backed install made no progress for 90
  seconds. Codex removed its unverified draft as required. These attempts did
  not consume the retry allowance because they were environment limitations.
- The following Claude phase successfully installed a temporary
  `create-next-app` scaffold, but its transfer/cleanup was interrupted by Git
  permission denials and the Claude session usage limit. Its final report said
  the scaffold was removed, while the subsequent filesystem audit found the
  dependency tree, configuration, assets, and partial `src/` transfer intact.
- `next build` with Turbopack passed on the empty partial scaffold but failed
  after real routes were restored because the sandbox denied PostCSS's local
  port binding (`EPERM`). The supported `next build --webpack` path avoided the
  restricted mechanism and passed repeatedly; the canonical build script now
  uses webpack.
- The first file-backed `drizzle-kit migrate` attempt failed because Drizzle
  does not create the configured parent `data/` directory. The project-local
  script now creates that ignored directory before migrating; the same command
  then applied the migration successfully.
- The first database test run passed four of five tests and correctly exposed a
  synthetic fixture error: both intended cross-school assignments pointed to
  prompts at the same school. The fixture was corrected to use two schools; the
  unchanged assertion and all other tests then passed.
- The first runtime port choice (`127.0.0.1:3100`) was already occupied by an
  unidentified listener, likely from the earlier interrupted smoke run. No
  process was killed; the verification used port 3101 and stopped only its own
  server session.
- The first school-CRUD staging command used the literal App Router path
  `src/app/[section]/page.tsx` without shell quoting, so zsh rejected the glob
  before Git ran. Quoting the same repository path resolved it; no files or Git
  state were changed by the failed command.
- No new command or verification failures occurred during the prompt CRUD
  checkpoint. Diff review found and corrected a draft implementation issue
  that would have collapsed multiline prompt text during an edit; focused and
  canonical verification passed after the correction.

## Blockers

None.

## Tests/Verification Performed

- Layer 2 manual handoff: verified independently (see git history).
- Layer 3 orchestrator: `bash scripts/test_overnight_handoff.sh` — 80/80
  assertions passing, run immediately before this commit. Zero real
  Claude/Codex invocations (verified by construction — stub binaries only).
- The real `claude`/`codex` CLIs were inspected read-only (`--help`,
  `auth status --json`, `login status`) to confirm exact flag/field names
  before relying on them — no model calls, no auth-state changes.
- Recovered dependency verification: `npm ls --depth=0` completed with the
  expected Next.js 16.3.2, React 19.2.8, Tailwind 4.3.3, ESLint 9.39.5, and
  TypeScript 5.9.3 dependency tree and no missing/extraneous packages.
- Pre-repair baseline: `npm run lint` passed; `npm run build` passed but emitted
  only framework route `/_not-found`, confirming the partial scaffold had no
  usable application page; `bash scripts/test_overnight_handoff.sh` passed
  80/80 assertions.
- Final canonical verification: `./run_tests.sh` passed. It ran ESLint, Next
  route type generation plus strict `tsc --noEmit`, a webpack production build
  that prerendered `/`, `/schools`, `/essays`, `/families`, and `/reuse`, and
  the existing overnight suite (80/80 assertions).
- Runtime smoke verification: the built production server reached ready state;
  HTTP checks confirmed `/` rendered the separate "Personal · empty" and
  "Fictional · demo preview" entry states, and `/reuse` rendered the labeled
  foundation placeholder. The server was then stopped.
- Persistence verification: `npm run db:generate` created a 14-table migration;
  `npx drizzle-kit check` reported the migration history consistent;
  `npm run db:migrate` created a repo-local database and applied the migration;
  a read-only SQLite query confirmed all 14 application tables.
- `npm test` — 5/5 persistence integration tests passed. `./run_tests.sh` then
  passed end to end with ESLint, strict route/type generation, those five tests,
  the production build, and the existing 80/80 overnight assertions.
- `npm audit --omit=dev` — zero production dependency vulnerabilities. The
  install reported four moderate advisories in development-only transitive
  packages; no risky forced upgrade was attempted.
- Workspace integration verification: `npm test` — 6/6 tests passed;
  `./run_tests.sh` passed ESLint, strict route/type generation, all six database
  tests, a dynamic-route production build, and the existing 80/80 assertions.
- Production runtime smoke: personal `/schools` showed the isolated empty state;
  the demo action then rendered three fictional schools and reuse scores
  91/58/35 including the Northstar danger warning; switching back restored the
  unchanged personal empty state. Curl posts lacked a browser `Origin` header,
  causing two expected server warnings; page responses and actions succeeded.
- School CRUD verification: `npm test` — 7/7 integration tests passed. The full
  `./run_tests.sh` checkpoint passed ESLint, strict type generation, all seven
  tests, the dynamic production build, and 80/80 overnight assertions.
- Prompt CRUD focused verification: `npm run lint`, `npm run typecheck`, and
  `npm test` passed after integration, then passed again after the multiline
  preservation/manual-confidence correction; the final Vitest result was 10/10.
- Prompt CRUD canonical verification: `./run_tests.sh` passed immediately
  before commit `52add4368f9cf60b5a46dbec62e599c1f6cdc534` with ESLint, Next
  route type generation plus strict `tsc --noEmit`, all 10 integration tests,
  a successful optimized Next.js webpack production build, and 80/80 overnight
  orchestration assertions.
- Browser automation does not exist yet and remains P0 verification work.

## Last Verified Commit

`52add4368f9cf60b5a46dbec62e599c1f6cdc534` — "Add workspace-scoped prompt
CRUD". `./run_tests.sh` passed immediately before this code commit. The next
commit changes only this handoff document to record the checkpoint.
