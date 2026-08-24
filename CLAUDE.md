# Repo Instructions

## Overnight / long autonomous tasks

- Read [OVERNIGHT_TASK.md](OVERNIGHT_TASK.md) at the start of the session for
  the objective and rules.
- Treat [AGENT_HANDOFF.md](AGENT_HANDOFF.md) as a continuously maintained
  source of truth, not a file to blindly overwrite. Update its relevant
  section(s) in place after each meaningful milestone, discovery, blocker,
  verification result, decision, or change in next steps — and always right
  before stopping or ending a session, so another agent (Claude or Codex) can
  resume accurately.
- Git is the source of truth for code state and rollback points.
  AGENT_HANDOFF.md is the source of truth for context, status, and next
  steps.

## Running the automated overnight pipeline (Layer 3)

`scripts/overnight_handoff.sh` runs Claude, then Codex, non-interactively and
sequentially in this checkout, validating git/handoff state before each
phase. It is safe to leave running unattended: it aborts rather than
proceeding on a dirty tree, a merge conflict, a stale/missing handoff, a
`HUMAN-REQUIRED:` marker, or a failed agent phase.

- **Start:** `./scripts/overnight_handoff.sh` (repo root; set an Objective in
  `OVERNIGHT_TASK.md` and a clean, verified commit first — see
  AGENT_HANDOFF.md's Next Steps).
- **Monitor (while running or after):** `tail -f logs/overnight/<run-id>/orchestrator.log`;
  the run-id is the timestamp printed at start. Per-phase output is in
  `claude.log`/`codex.log` in the same directory, with `claude.exit`/`codex.exit`
  and a top-level `exit_code` once the run finishes.
- **Recover from a stopped/failed run:** read `AGENT_HANDOFF.md` and the last
  run's logs to see what happened; fix or resolve whatever caused the abort
  (clear a `HUMAN-REQUIRED:` marker once addressed, resolve a conflict,
  commit/clean a dirty tree), then re-run the same command. If a previous run
  crashed and left `.overnight_handoff.lock/` behind without finishing,
  confirm no run is actually active (`ps aux | grep -E 'claude -p|codex exec'`)
  before removing it by hand.
- **Cancel a running pipeline:** `Ctrl-C` the foreground process, or
  `pkill -f scripts/overnight_handoff.sh`; also stop any still-running agent
  process directly (`pkill -f 'claude -p'` / `pkill -f 'codex exec'`) since
  killing the wrapper script doesn't kill an in-flight child. Then remove
  `.overnight_handoff.lock/` once you've confirmed nothing is still running.
- **Test the pipeline itself for free:** `bash scripts/test_overnight_handoff.sh`
  runs it against disposable scratch repos with fake agents — no real API
  calls, no cost.
