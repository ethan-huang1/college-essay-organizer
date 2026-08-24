# Repo Instructions

## Overnight / long autonomous tasks

- Read [OVERNIGHT_TASK.md](OVERNIGHT_TASK.md), [MVP_SPEC.md](MVP_SPEC.md),
  and [AGENT_HANDOFF.md](AGENT_HANDOFF.md) completely at the start of a
  session. OVERNIGHT_TASK.md holds the rules; MVP_SPEC.md holds the product
  spec (what to build); AGENT_HANDOFF.md holds live status.
- Treat AGENT_HANDOFF.md as a continuously maintained source of truth, not a
  file to blindly overwrite. Update its relevant section(s) — including
  **Failed Approaches** (OVERNIGHT_TASK.md rule 9) — in place after each
  meaningful milestone, discovery, blocker, verification result, decision, or
  change in next steps, and always right before stopping, so another agent
  (Claude or Codex) can resume accurately.
- Git is the source of truth for code state and rollback points.
  AGENT_HANDOFF.md is the source of truth for context, status, and next
  steps.

## Running the automated overnight pipeline (Layer 3)

`scripts/overnight_handoff.sh` runs **Codex first, then Claude**,
non-interactively and strictly sequentially in this checkout — never
concurrently. Tonight's run is exactly one Codex phase followed by one
Claude phase, then it stops (no multi-round loop). A fail-closed
subscription-only authentication preflight runs before each real agent call
(see "Zero incremental spend" below); repo/handoff state is validated before
Codex, after Codex, and after Claude.

**Codex ending nonzero does not automatically abort the run.** If Codex left
a safe, verified checkpoint (clean tree, no conflicts, valid non-stale
handoff, no `HUMAN-REQUIRED:` marker) even though it exited nonzero — e.g. it
ran out of included usage mid-phase after already committing good work —
the pipeline still continues to Claude, and reports a distinct **degraded
but recovered** result rather than silently claiming a clean run.

**Exit codes** (also written to `logs/overnight/<run-id>/exit_code`):

| Code | Meaning |
|---|---|
| 0 | Codex and Claude both exited 0; all validations passed |
| 2 | pre-flight repo/handoff check failed (before Codex ran) |
| 3 | Codex ended nonzero **and** left an unsafe state — Claude never ran |
| 4 | post-Codex validation failed even though Codex itself exited 0 |
| 5 | Claude phase itself ended nonzero |
| 6 | post-Claude validation failed |
| 9 | lock already held — nothing ran, existing lock untouched |
| 10 | pre-Codex auth preflight failed — nothing ran |
| 11 | Codex left a valid checkpoint, but Claude was skipped (pre-Claude auth preflight failed — e.g. Claude's usage is unavailable tonight) |
| 12 | Codex ended nonzero but left a safe checkpoint; Claude then finished successfully — degraded but recovered, never reported as plain `0` |

### Zero incremental spend

This pipeline is designed to spend **nothing** beyond usage already included
in your Claude and ChatGPT subscriptions. Before your first real run:

1. **Manual prerequisite (the script cannot check this for you):** in Claude
   Settings → Usage, confirm **Usage credits** and **auto-reload** are
   disabled. There is no CLI surface to inspect this account setting, so the
   orchestrator only reminds you (a log line after each successful auth
   check) — it never claims to have verified it. If ChatGPT/Codex has an
   equivalent credit or spend-limit setting, check that too; this repo has
   no way to inspect it either.
2. The orchestrator's auth preflight (`run_auth_preflight`, called before
   Codex and again before Claude) fails closed: it aborts if
   `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set, if Claude isn't
   authenticated via a `claude.ai` subscription (checked via
   `claude auth status --json`: `loggedIn`, `authMethod`, `apiProvider`, and
   an allowlisted `subscriptionType`), or if Codex isn't "Logged in using
   ChatGPT" (`codex login status`). Anything missing, ambiguous, or
   unrecognized is rejected, not assumed safe.
3. `CLAUDE_BUDGET_USD` (default 2, overridable via env var) is an
   **estimated included-usage ceiling** — it caps how far one Claude
   invocation goes. It does **not** verify authentication and does **not**
   authorize spending; the auth preflight above is what actually prevents
   billable usage, not this number. Pick a value based on how much included
   usage you're comfortable letting one run consume.

### Operating commands

- **Start:** `CLAUDE_BUDGET_USD=<your choice> ./scripts/overnight_handoff.sh`
  (repo root; requires the manual prerequisite above, a real Objective in
  `OVERNIGHT_TASK.md`, and a clean, verified commit — see AGENT_HANDOFF.md's
  Next Steps).
- **Monitor (while running or after):** `tail -f logs/overnight/<run-id>/orchestrator.log`;
  the run-id is the timestamp printed at start. Per-phase output is in
  `codex.log`/`claude.log` in the same directory, with `codex.exit`/`claude.exit`
  and a top-level `exit_code` once the run finishes.
- **Recover from a stopped/failed run:** read `AGENT_HANDOFF.md`, the exit
  code above, and the last run's logs to see what happened; fix or resolve
  whatever caused it (clear a `HUMAN-REQUIRED:` marker once addressed,
  resolve a conflict, commit/clean a dirty tree, fix auth), then re-run the
  same command. If a previous run crashed and left
  `.overnight_handoff.lock/` behind without finishing, confirm no run is
  actually active (`ps aux | grep -E 'claude -p|codex exec'`) before
  removing it by hand.
- **Cancel a running pipeline:** `Ctrl-C` the foreground process, or
  `pkill -f scripts/overnight_handoff.sh`; also stop any still-running agent
  process directly (`pkill -f 'claude -p'` / `pkill -f 'codex exec'`) since
  killing the wrapper script doesn't kill an in-flight child. Then remove
  `.overnight_handoff.lock/` once you've confirmed nothing is still running.
- **Test the pipeline itself for free:** `bash scripts/test_overnight_handoff.sh`
  runs it against disposable scratch repos with fake agents — no real API,
  auth, or model calls, no cost.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
