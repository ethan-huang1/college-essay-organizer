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

The real MVP objective is staged and ready. Nothing has been built yet —
this repo still contains only the handoff protocol, the orchestrator, and
the product spec. Tonight's automated run is scoped to exactly **one Codex
phase, then one Claude phase, then stop** (see CLAUDE.md's pipeline
section) — Codex goes first because the human's interactive Claude session
usage is nearly exhausted, and a fresh `claude -p` process shares the same
account-level usage pool, not a reset one.

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

## In Progress

None. Waiting on a human to run `./scripts/overnight_handoff.sh` for the
first real Codex → Claude round against the actual MVP objective.

## Next Steps

1. Human confirms the manual prerequisite: Claude Settings → Usage has
   **Usage credits** and **auto-reload** disabled (CLAUDE.md's "Zero
   incremental spend" section — the script cannot check this itself).
2. Human picks a `CLAUDE_BUDGET_USD` value and runs
   `CLAUDE_BUDGET_USD=<value> ./scripts/overnight_handoff.sh` from the repo
   root.
3. Codex begins MVP_SPEC.md's P0 Phase 1 (Foundation): application setup,
   database schema/migrations, seeded prompt-family taxonomy, demo-data
   system, base design system, navigation, `run_tests.sh` and setup docs.
4. Whatever Codex completes and verifies, Claude picks up from next and
   continues into subsequent P0 phases per MVP_SPEC.md's priority order,
   then stops.
5. After that run: read the exit code (CLAUDE.md's table) and this file's
   updated state to decide whether to re-run the pipeline again, continue
   manually, or address a blocker.

## Failed Approaches

None yet — no implementation work has started.

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
- The MVP objective itself has **not** been run for real yet — that is the
  explicit next step, deliberately not performed automatically per
  instruction not to launch a real run during this staging work.

## Last Verified Commit

`006158b` — "Stage the real MVP objective; make Layer 3 zero-spend,
auth-gated, Codex-first". Working tree is clean at this commit; the
deterministic test suite (80/80) passed immediately before it, and no
application code exists yet beyond the handoff protocol, the orchestrator,
and the product spec.
