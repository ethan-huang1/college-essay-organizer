#!/usr/bin/env bash
# Layer 3: repo-local Claude -> Codex overnight handoff orchestrator.
#
# Runs Claude non-interactively first, validates the repo/handoff state,
# then runs Codex non-interactively to continue, validating again after.
# Never runs both at once. Aborts (does not proceed) on any unsafe state.
#
# See AGENT_HANDOFF.md "Next Steps"/"Start/monitor/recover" docs for usage.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TASK_FILE="$REPO_ROOT/OVERNIGHT_TASK.md"
HANDOFF_FILE="$REPO_ROOT/AGENT_HANDOFF.md"
LOCK_DIR="$REPO_ROOT/.overnight_handoff.lock"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="$REPO_ROOT/logs/overnight/$RUN_ID"

# Exit codes (also written to logs/overnight/<run>/exit_code for scripting):
#  0 success, both phases ran and repo ended clean
#  2 pre-flight check failed (before Claude ran)
#  3 Claude phase itself failed (nonzero exit)
#  4 mid-flight check failed (after Claude, before Codex)
#  5 Codex phase itself failed (nonzero exit)
#  6 post-flight check failed (after Codex)
#  9 could not acquire lock (another run already in progress)

CLAUDE_BUDGET_USD="${CLAUDE_BUDGET_USD:-2}"

mkdir -p "$LOG_DIR"
ORCH_LOG="$LOG_DIR/orchestrator.log"

log() {
    printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$ORCH_LOG"
}

finish() {
    local code="$1"
    echo "$code" >"$LOG_DIR/exit_code"
    exit "$code"
}

# --- locking: refuse to run two orchestrations against the same checkout ---
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    log "ABORT: lock dir $LOCK_DIR already exists - another run is in progress (or a previous run crashed without cleaning up; remove it manually after confirming no run is active)."
    finish 9
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null' EXIT

# --- shared validation, run before Claude, before Codex, and after Codex ---
validate_state() {
    local phase="$1" # label for log messages

    if [ ! -f "$TASK_FILE" ] || [ ! -f "$HANDOFF_FILE" ]; then
        log "ABORT ($phase): OVERNIGHT_TASK.md or AGENT_HANDOFF.md is missing."
        return 1
    fi

    if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1 || [ -n "$(git ls-files -u)" ]; then
        log "ABORT ($phase): repo is mid-merge or has unmerged/conflicted paths."
        return 1
    fi

    if [ -n "$(git status --porcelain)" ]; then
        log "ABORT ($phase): working tree is not clean (uncommitted or unexpected changes present)."
        git status --porcelain | tee -a "$ORCH_LOG"
        return 1
    fi

    if grep -q '^HUMAN-REQUIRED:' "$HANDOFF_FILE"; then
        log "ABORT ($phase): AGENT_HANDOFF.md contains a HUMAN-REQUIRED: marker - a prior agent needs a human decision before this can continue."
        grep '^HUMAN-REQUIRED:' "$HANDOFF_FILE" | tee -a "$ORCH_LOG"
        return 1
    fi

    local recorded head resolved
    recorded="$(awk '/^## Last Verified Commit/{f=1;next} f && match($0,/`[0-9a-f]{7,40}`/){s=substr($0,RSTART+1,RLENGTH-2); print s; exit}' "$HANDOFF_FILE")"
    if [ -z "$recorded" ]; then
        log "ABORT ($phase): AGENT_HANDOFF.md has no parseable 'Last Verified Commit' hash - missing handoff data."
        return 1
    fi
    resolved="$(git rev-parse --verify -q "${recorded}^{commit}" 2>/dev/null || true)"
    if [ -z "$resolved" ]; then
        log "ABORT ($phase): AGENT_HANDOFF.md's Last Verified Commit ($recorded) does not exist in this repo - stale or corrupt handoff."
        return 1
    fi
    head="$(git rev-parse HEAD)"
    # The recorded commit doesn't have to *be* HEAD: a docs-only commit
    # updating AGENT_HANDOFF.md/OVERNIGHT_TASK.md/CLAUDE.md to describe a
    # verified state naturally becomes the new HEAD after that state was
    # verified (see e.g. real commit c50591c). What must never happen is
    # non-doc (code) changes landing after the recorded commit without a
    # fresh verification - that's the actual definition of "stale" here.
    if [ "$resolved" != "$head" ]; then
        if ! git merge-base --is-ancestor "$resolved" "$head"; then
            log "ABORT ($phase): AGENT_HANDOFF.md's Last Verified Commit ($recorded) is not an ancestor of HEAD ($head) - handoff points outside current history."
            return 1
        fi
        local non_doc
        non_doc="$(git diff --name-only "$resolved" "$head" | grep -vE '^(AGENT_HANDOFF\.md|OVERNIGHT_TASK\.md|CLAUDE\.md)$' || true)"
        if [ -n "$non_doc" ]; then
            log "ABORT ($phase): non-doc files changed since Last Verified Commit ($recorded) without a new verified commit: $non_doc"
            return 1
        fi
    fi

    if [ -x "$REPO_ROOT/run_tests.sh" ]; then
        log "Running ./run_tests.sh ($phase)..."
        if ! "$REPO_ROOT/run_tests.sh" >>"$ORCH_LOG" 2>&1; then
            log "ABORT ($phase): ./run_tests.sh failed."
            return 1
        fi
    fi

    log "Validation OK ($phase). HEAD=$head"
    return 0
}

check_no_objective() {
    grep -q 'No objective set yet' "$TASK_FILE"
}

# --- prompts shared by both agents; behavior is driven entirely by the repo docs ---
read -r -d '' AGENT_PROMPT <<'EOF' || true
You are running non-interactively as part of an automated overnight handoff
pipeline in this repository. Before doing anything else, read CLAUDE.md,
OVERNIGHT_TASK.md, and AGENT_HANDOFF.md in full.

Do not assume you are starting fresh - AGENT_HANDOFF.md tells you exactly
what is done, in progress, and next. If it says work is already done, verify
and continue from "Next Steps"; do not redo or revert committed work.

Follow every rule in OVERNIGHT_TASK.md exactly: inspect existing code first,
preserve unrelated changes, run tests (./run_tests.sh if present) after every
change, never weaken or remove a test to make it pass, commit only verified
checkpoints, and never push/deploy/amend/rebase/touch global config or take
any other irreversible action.

If you hit anything requiring a human decision, do not guess: add a line
starting with exactly "HUMAN-REQUIRED:" under Blockers in AGENT_HANDOFF.md
explaining what you need, commit any safe verified work, and stop.

Before you stop for any reason (objective complete, or you've done as much
as you safely can), update AGENT_HANDOFF.md in place - Current Status,
Completed, In Progress, Next Steps, Blockers, Tests/Verification Performed,
and Last Verified Commit (this must exactly match `git rev-parse HEAD` after
your last commit) - and leave the working tree clean (`git status` empty).
EOF

run_agent_phase() {
    local name="$1" out="$2" errf="$3" exitf="$4"
    shift 4
    log "Starting $name phase. Logging to $out"
    "$@" </dev/null >"$out" 2>"$errf"
    local code=$?
    echo "$code" >"$exitf"
    log "$name phase exited with code $code"
    return "$code"
}

log "=== Overnight handoff run $RUN_ID starting in $REPO_ROOT ==="

if check_no_objective; then
    log "ABORT (pre-flight): OVERNIGHT_TASK.md has no Objective set. Set one before running this pipeline."
    finish 2
fi

validate_state "pre-flight" || finish 2

run_agent_phase "claude" "$LOG_DIR/claude.log" "$LOG_DIR/claude.stderr.log" "$LOG_DIR/claude.exit" \
    claude -p "$AGENT_PROMPT" \
    --permission-mode acceptEdits \
    --max-budget-usd "$CLAUDE_BUDGET_USD" \
    --allowedTools "Read Write Edit Bash(git status*) Bash(git add*) Bash(git commit*) Bash(git log*) Bash(git diff*) Bash(git show*) Bash(python3*) Bash(./run_tests.sh*)" \
    --disallowedTools "Bash(git push*) Bash(git reset*) Bash(git clean*) Bash(git rebase*) Bash(git commit --amend*) Bash(git checkout*) Bash(git branch -D*) Bash(git filter-branch*) Bash(rm -rf*) Bash(sudo*) Bash(curl*) Bash(wget*) Bash(ssh*) WebFetch WebSearch" \
    --output-format json
claude_code=$?
if [ "$claude_code" -ne 0 ]; then
    log "ABORT: Claude phase failed (exit $claude_code); Codex will not be started."
    finish 3
fi

validate_state "mid-flight (post-Claude, pre-Codex)" || finish 4

run_agent_phase "codex" "$LOG_DIR/codex.log" "$LOG_DIR/codex.stderr.log" "$LOG_DIR/codex.exit" \
    codex exec \
    --cd "$REPO_ROOT" \
    --sandbox workspace-write \
    --json \
    --output-last-message "$LOG_DIR/codex_last_message.txt" \
    "$AGENT_PROMPT"
codex_code=$?
if [ "$codex_code" -ne 0 ]; then
    log "ABORT: Codex phase failed (exit $codex_code)."
    finish 5
fi

validate_state "post-flight (after Codex)" || finish 6

log "=== Overnight handoff run $RUN_ID completed successfully. Logs: $LOG_DIR ==="
finish 0
