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

## Running the automated overnight pipeline

`scripts/overnight_handoff.sh` runs agents non-interactively and strictly
sequentially in this preferred order:

1. **Claude primary** — continues normally until the objective is complete
   or it hits a genuine limit/error/stall. There is no short elapsed-time
   handoff.
2. **Codex reserve** — only if work remains and Claude left a safe verified
   checkpoint. `CODEX_RESERVE_CYCLES=1` is the conservative default proxy;
   neither CLI exposes a trustworthy percentage of remaining ChatGPT/Codex
   quota, so the script never invents a “20% used” measurement.
3. **Claude retry** — once by default, after a configurable backoff, if the
   bounded Codex reserve leaves work remaining.

The default sequence is therefore at most three agent invocations. It never
loops Claude ↔ Codex indefinitely. `CLAUDE_RETRY_CYCLES` and
`CODEX_RESERVE_CYCLES` accept explicit integer bounds; exhausted state stays
terminal across reruns unless a human deliberately supplies
`OVERNIGHT_RESET_STATE=1`.

Before and after every phase, the repository must be a clean, non-conflicted,
tested checkpoint with a non-stale `AGENT_HANDOFF.md`. A usage limit or crash
can hand off only if that independent validation succeeds. A dirty or stale
state is preserved for investigation and stops the sequence; the script
never resets or cleans it.

**Exit codes** (also written to `logs/overnight/<run-id>/exit_code`):

| Code | Meaning |
|---|---|
| 0 | objective marked complete and final validation passed |
| 2 | pre-flight objective/repo/handoff validation failed |
| 9 | another live run holds the lock, or lock ownership is ambiguous |
| 10 | Claude-primary subscription auth preflight failed |
| 20 | bounded sequence ended cleanly with work remaining |
| 21 | bounded sequence ended on a usage/rate limit |
| 22 | bounded sequence ended on a crash/error or unexpected exit |
| 23 | bounded sequence ended on timeout/stall/repeated no progress |
| 24 | an agent left an unsafe checkpoint; no handoff occurred |
| 25 | a later agent's auth preflight failed; prior checkpoint is intact |
| 26 | a `HUMAN-REQUIRED:` blocker stopped the sequence |
| 28 | wrapper interrupted; durable resume state remains |

Every phase additionally writes its own `.outcome` file with one of
`normal-exit`, `usage-limit`, `crash-error`, `timeout`, or `stall`.

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
2. The phase-specific auth preflight fails closed if an API-key environment
   variable is present. Before a Claude phase it requires a `claude.ai`
   first-party subscription; before a Codex phase it requires “Logged in
   using ChatGPT.” Codex auth does not block a Claude-primary run that
   completes without using the reserve.
3. The old `--max-budget-usd` switch was removed. It is an API-dollar
   mechanism, not a subscription-quota gauge, and cannot enforce a
   percentage of included Codex usage. The bounded cycle counts are the
   documented conservative proxy instead.

### Operating commands

- **Start:** `./scripts/overnight_handoff.sh` from the repo root. It requires
  a real objective plus a clean verified checkpoint. Optional controls:
  `CODEX_RESERVE_CYCLES=1`, `CLAUDE_RETRY_CYCLES=1`,
  `CLAUDE_RETRY_BACKOFF_SECONDS=300`, `PHASE_STALL_SECONDS=1800`, and
  `PHASE_MAX_SECONDS=14400`.
- **Monitor (while running or after):** `tail -f logs/overnight/<run-id>/orchestrator.log`;
  the run-id is the timestamp printed at start. `summary.md` is the morning
  overview. Each phase has stdout, stderr, exit, outcome, and handoff-snapshot
  files; `exit_code` records the final category.
- **Recover from a stopped wrapper:** rerun the same command. Durable state
  in `logs/overnight/resume.state` selects the unfinished phase. A lock whose
  wrapper and phase PIDs are provably dead is recovered automatically; a
  live or ambiguous lock fails closed. Objective-file changes automatically
  start fresh state. A deliberately exhausted sequence requires human review
  before `OVERNIGHT_RESET_STATE=1` authorizes another bounded sequence.
- **Cancel:** use `Ctrl-C`. The signal handler stops its current direct child,
  records interruption, preserves the same next phase, and releases its lock.
- **Test the pipeline itself for free:** `bash scripts/test_overnight_handoff.sh`
  runs it against disposable scratch repos with fake agents — no real API,
  auth, or model calls, no cost.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
