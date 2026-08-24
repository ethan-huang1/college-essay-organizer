# Agent Handoff

This file is the live source of truth for **context, discoveries, blockers,
verification status, and next steps** during an overnight run. It is a
continuously maintained document, not a log to append to or overwrite blindly
— edit each section in place so it always reflects current reality.

- **Git** is the source of truth for code state and rollback points.
- **This file** is the source of truth for what's going on and what's next.

Update the relevant section(s) after any meaningful milestone, discovery,
blocker, verification result, or decision — and always right before a
session ends or control passes to another agent (Claude ↔ Codex). If you hit
something that needs a human decision, add a line starting with exactly
`HUMAN-REQUIRED:` under Blockers instead of guessing (see OVERNIGHT_TASK.md
rule 7) — the automated pipeline halts when it sees that marker.

See [OVERNIGHT_TASK.md](OVERNIGHT_TASK.md) for the objective and rules.

## Current Status

Layer 3 (automated pipeline) is built and ready for its first real,
controlled test run. A small throwaway Objective is staged in
`OVERNIGHT_TASK.md` (`scripts/layer3_smoke.py`, `multiply`/`divide`) for a
human to trigger via `./scripts/overnight_handoff.sh`. No agent has run
against it yet.

## Completed

- Layer 1: repo-based handoff protocol (`OVERNIGHT_TASK.md`,
  `AGENT_HANDOFF.md`, `CLAUDE.md`).
- Layer 2: manual end-to-end Claude → Codex handoff test, independently
  verified; cleaned up by human authorization (history preserved in git log).
- Layer 3: `scripts/overnight_handoff.sh` — runs Claude then Codex
  non-interactively and sequentially, with narrowly-scoped permissions
  (Claude: `-p` + `--permission-mode acceptEdits` + explicit allow/disallow
  tool lists; Codex: `exec --sandbox workspace-write`, no
  `--dangerously-*` flags on either). Validates git/handoff state before
  Claude, before Codex, and after Codex; aborts on a dirty tree, merge
  conflict, missing/stale/unresolvable handoff commit, or a `HUMAN-REQUIRED:`
  marker. Timestamped logs + exit codes per run in `logs/overnight/<run-id>/`.
  A lock directory prevents concurrent runs in this checkout.
- `scripts/test_overnight_handoff.sh`: 27 deterministic assertions against
  disposable scratch repos with fake `claude`/`codex` executables (no real
  API calls) — happy path plus every abort condition above. All passing.
- CLAUDE.md documents exact start/monitor/recover/cancel commands for the
  pipeline.
- Staged a tiny Layer 3 test Objective in `OVERNIGHT_TASK.md`
  (`scripts/layer3_smoke.py`) for the first real automated run.

## In Progress

None. Waiting on a human to run `./scripts/overnight_handoff.sh` for the
first real (small, controlled) end-to-end test.

## Next Steps

1. Run `./scripts/overnight_handoff.sh` from the repo root.
2. Watch `logs/overnight/<run-id>/orchestrator.log` (see CLAUDE.md's
   "Monitor" command).
3. If it succeeds: confirm `scripts/layer3_smoke.py` has both functions,
   both covered by its self-check, tree clean, and this file's Last Verified
   Commit matches `git rev-parse HEAD`.
4. Once confirmed, a human can authorize cleaning up `scripts/layer3_smoke.py`
   and the temporary Objective section (same pattern as the Layer 2 cleanup),
   and start using this pipeline for real work by replacing the Objective.

## Blockers

None.

## Tests/Verification Performed

- Layer 2 manual handoff: verified independently (see git history,
  commits `ae586f2`..`280835d`).
- Layer 3 orchestrator: `bash scripts/test_overnight_handoff.sh` — 27/27
  assertions passing, run just before this commit. Covers: happy path
  (sequential, non-concurrent execution confirmed via ordering check),
  Claude-phase failure, Codex-phase failure, dirty working tree, no
  objective set, stale handoff (code changed without a new verified commit),
  a docs-only commit correctly *not* counting as stale, a pre-existing
  `HUMAN-REQUIRED:` marker, a marker raised mid-run, a real merge conflict,
  lock-already-held, and log/exit-code preservation.
- The real `claude` and `codex` CLIs were smoke-tested manually (trivial
  "reply OK" prompts) to confirm the exact flags used by the orchestrator
  are accepted non-interactively before relying on them in the script.
- The staged Layer 3 objective itself has **not** been run for real yet —
  that's the next step, and is explicitly a human-triggered action (per the
  instruction not to launch a long/expensive real run automatically).

## Last Verified Commit

`4ad13cd` — "Document pipeline operating commands; stage Layer 3 test
objective". Working tree is clean at this commit; no code beyond the
handoff docs and the orchestrator/test scripts has been added.
