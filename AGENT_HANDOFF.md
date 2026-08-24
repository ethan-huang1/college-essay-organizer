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

P0 Phase 1 is in progress with a verified Next.js application checkpoint.
The interrupted Claude run left a partially transferred `create-next-app`
scaffold and a complete local dependency installation despite its final log
claiming the scaffold had been removed. Codex audited and preserved that work,
restored the missing App Router layout and pages, added the required canonical
test runner and setup notes, and committed the tested code at `1a34260`.

The application currently provides a responsive editorial shell, navigation,
clearly separated personal/demo entry states, the ten-family overview, and
honestly labeled placeholders for unfinished sections. Persistence, schema and
migrations, seeded data, and real organization workflows remain unfinished.

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

## In Progress

P0 Phase 1 (Foundation). Application setup, the base design system,
navigation, canonical test runner, and scaffold setup documentation are
complete. The local persistence layer is the next highest-priority item.

## Next Steps

1. Complete P0 Phase 1's local persistence foundation: choose the lightweight
   typed SQLite ORM within the spec, add the schema for all required core
   entities and many-to-many relationships, and create migrations.
2. Seed the editable ten-family taxonomy and secondary tags, then add a
   synthetic demo-data system that cannot silently mix with personal data.
3. Add focused unit/integration tests for schema constraints, taxonomy seeding,
   and personal/demo isolation; include them in `run_tests.sh`.
4. Continue with P0 Phase 2 only after the full Phase 1 foundation is verified.

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
- No browser automation or database tests exist yet; both remain later P0 work.

## Last Verified Commit

`1a34260822a2ab58cd23703187fbc58403ba6131` — "Checkpoint verified Next.js
application scaffold". `./run_tests.sh` passed immediately before this code
commit, and a production runtime smoke check passed. The next commit changes
only this handoff document to record the checkpoint accurately.
