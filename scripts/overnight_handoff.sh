#!/usr/bin/env bash
# Layer 3: repo-local Codex -> Claude overnight handoff orchestrator.
#
# Runs Codex non-interactively first, then Claude non-interactively to
# continue, strictly sequentially, never concurrently. A fail-closed
# authentication preflight (subscription-only, zero incremental spend) runs
# before each real agent call. Codex ending nonzero does not automatically
# abort the handoff - the orchestrator judges safety from repo/handoff state
# (see validate_state) and continues to Claude if Codex left a safe,
# verified checkpoint, reporting a distinct "degraded but recovered" exit
# code rather than silently claiming a clean run.
#
# See CLAUDE.md "Running the automated overnight pipeline" for usage.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TASK_FILE="$REPO_ROOT/OVERNIGHT_TASK.md"
HANDOFF_FILE="$REPO_ROOT/AGENT_HANDOFF.md"
LOCK_DIR="$REPO_ROOT/.overnight_handoff.lock"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="$REPO_ROOT/logs/overnight/$RUN_ID"

# Exit codes (also written to logs/overnight/<run>/exit_code for scripting):
#  0  Codex exited 0 and Claude exited 0; all validations passed
#  2  pre-flight repo/handoff check failed (before Codex ran)
#  3  Codex ended nonzero AND did not leave a state safe enough for Claude
#     to resume - Claude never runs
#  4  post-Codex repo/handoff validation failed even though Codex itself
#     exited 0
#  5  Claude phase itself ended nonzero
#  6  post-Claude repo/handoff validation failed
#  9  could not acquire lock - neither auth check nor either agent ran,
#     existing lock left untouched
#  10 pre-Codex auth preflight failed - nothing ran
#  11 Codex left a valid checkpoint, but Claude was skipped because the
#     pre-Claude auth preflight failed (e.g. Claude's subscription usage is
#     unavailable) - Codex's checkpoint stands
#  12 Codex ended nonzero but left a safe verified checkpoint; Claude then
#     completed successfully and final validation passed - a degraded-but-
#     recovered run. Never reported as plain 0.

CLAUDE_BUDGET_USD="${CLAUDE_BUDGET_USD:-2}"

# --- 1. logging must exist before anything else, including lock/finish ---
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

log "=== Overnight handoff run $RUN_ID starting in $REPO_ROOT ==="

# --- 2. lock BEFORE any auth check or agent call - a held lock means no
#        auth-status command and no agent runs, and the existing lock (which
#        isn't ours) must never be touched ---
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    log "ABORT: lock dir $LOCK_DIR already exists - another run is in progress (or a previous run crashed without cleaning up; remove it manually after confirming no run is active)."
    finish 9
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null' EXIT

# --- 3. fail-closed subscription-auth preflight, called before each real
#        agent invocation. Zero-incremental-spend is enforced here, not by
#        CLAUDE_BUDGET_USD (see CLAUDE.md) - allowlist known-good values
#        only; anything missing/ambiguous/unrecognized fails closed. ---
run_auth_preflight() {
    local label="$1"

    if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
        log "ABORT (auth-preflight $label): ANTHROPIC_API_KEY is set in the environment. This pipeline only runs on Claude subscription auth. Unset it and re-run."
        return 1
    fi
    if [ -n "${OPENAI_API_KEY:-}" ]; then
        log "ABORT (auth-preflight $label): OPENAI_API_KEY is set in the environment. This pipeline only runs on ChatGPT subscription auth. Unset it and re-run."
        return 1
    fi

    if ! claude --help 2>/dev/null | grep -q '"auto"'; then
        log "ABORT (auth-preflight $label): installed claude CLI does not advertise --permission-mode auto. Refusing to fall back to a different permission mode."
        return 1
    fi

    local claude_json fields logged_in auth_method api_provider subscription subscription_ok
    claude_json="$(claude auth status --json 2>/dev/null)" || {
        log "ABORT (auth-preflight $label): 'claude auth status' failed to run."
        return 1
    }
    fields="$(printf '%s' "$claude_json" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("false|PARSE_ERROR|PARSE_ERROR|PARSE_ERROR")
    sys.exit(0)
logged_in = "true" if d.get("loggedIn") is True else "false"
auth_method = str(d.get("authMethod") or "")
api_provider = str(d.get("apiProvider") or "")
subscription = str(d.get("subscriptionType") or "")
print(f"{logged_in}|{auth_method}|{api_provider}|{subscription}")
' 2>/dev/null)"
    IFS='|' read -r logged_in auth_method api_provider subscription <<<"$fields"

    case "$subscription" in
        pro | max | team | enterprise) subscription_ok=1 ;;
        *) subscription_ok=0 ;;
    esac

    if [ "$logged_in" != "true" ] || [ "$auth_method" != "claude.ai" ] || [ "$api_provider" != "firstParty" ] || [ "$subscription_ok" -ne 1 ]; then
        log "ABORT (auth-preflight $label): Claude auth check failed (loggedIn='$logged_in' authMethod='$auth_method' apiProvider='$api_provider' subscriptionType='$subscription'). Refusing to run - could be an API key, Console, or another provider."
        return 1
    fi

    local codex_status
    codex_status="$(codex login status 2>&1)" || {
        log "ABORT (auth-preflight $label): 'codex login status' failed to run."
        return 1
    }
    case "$codex_status" in
        "Logged in using ChatGPT"*) : ;;
        *)
            log "ABORT (auth-preflight $label): Codex is not authenticated via 'Sign in with ChatGPT'. Refusing to run - could be an API key or Platform account."
            return 1
            ;;
    esac

    log "Auth preflight OK ($label): Claude subscription verified (claude.ai/firstParty/$subscription). Codex ChatGPT auth verified."
    log "REMINDER (not verified by this script): confirm Claude Settings -> Usage has 'Usage credits' and auto-reload disabled before letting this run unattended."
    return 0
}

# --- shared repo/handoff validation, run before Codex, after Codex, and
#     after Claude. This IS the "is the checkpoint safe" judgment used by
#     the safe-continuation logic below - it doesn't trust either agent's
#     own exit code. ---
validate_state() {
    local phase="$1"

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
    # updating AGENT_HANDOFF.md/OVERNIGHT_TASK.md/CLAUDE.md/MVP_SPEC.md to
    # describe a verified state naturally becomes the new HEAD after that
    # state was verified (see e.g. real commit c50591c). What must never
    # happen is non-doc (code) changes landing after the recorded commit
    # without a fresh verification - that's the actual definition of
    # "stale" here.
    if [ "$resolved" != "$head" ]; then
        if ! git merge-base --is-ancestor "$resolved" "$head"; then
            log "ABORT ($phase): AGENT_HANDOFF.md's Last Verified Commit ($recorded) is not an ancestor of HEAD ($head) - handoff points outside current history."
            return 1
        fi
        local non_doc
        non_doc="$(git diff --name-only "$resolved" "$head" | grep -vE '^(AGENT_HANDOFF\.md|OVERNIGHT_TASK\.md|CLAUDE\.md|MVP_SPEC\.md)$' || true)"
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

# --- shared boilerplate + two phase-specific prompts ---
read -r -d '' SHARED_BOILERPLATE <<'EOF' || true
This session is fully unattended overnight - there is no human available to
respond. Never call AskUserQuestion, never wait for input, never request
approval, and never pause indefinitely for a decision. If an operation is
denied or would require human approval, do not retry it and do not attempt
a workaround with broader permissions - record it under Blockers in
AGENT_HANDOFF.md (using "HUMAN-REQUIRED:" if it truly blocks progress) and
either continue with genuinely independent work that doesn't depend on it,
or create a clean verified checkpoint and stop.

Follow every rule in OVERNIGHT_TASK.md exactly: inspect existing code
first, preserve unrelated changes, run tests (./run_tests.sh if present)
after every change, never weaken or remove a test to make it pass, commit
only verified checkpoints, and never push/deploy/amend/rebase/touch global
config or take any other irreversible action.

Before you stop for any reason, update AGENT_HANDOFF.md in place - Current
Status, Completed, In Progress, Next Steps, Failed Approaches, Blockers,
Tests/Verification Performed, and Last Verified Commit (this must exactly
match `git rev-parse HEAD` after your last commit) - and leave the working
tree clean (`git status` empty).
EOF

CODEX_PROMPT="You are running first in tonight's Codex -> Claude sequence. Before doing anything else, read CLAUDE.md, OVERNIGHT_TASK.md, MVP_SPEC.md, and AGENT_HANDOFF.md completely. Verify Git/handoff state yourself. Begin the highest-priority unfinished P0 work from MVP_SPEC.md's phase order.

$SHARED_BOILERPLATE"

CLAUDE_PROMPT="You are running second and last tonight - Codex has already run. Before doing anything else, read CLAUDE.md, OVERNIGHT_TASK.md, MVP_SPEC.md, and AGENT_HANDOFF.md completely. Verify Codex's commits and handoff state. Do not redo or rewrite already verified implementation work - you may inspect it and rerun relevant baseline, regression, build, and integration tests when necessary to verify your own changes and the combined repository state. Resume from the exact Next Steps Codex left, continue the highest-priority remaining P0 work, test and commit verified checkpoints, update AGENT_HANDOFF.md, and then stop - this is the last phase running tonight.

$SHARED_BOILERPLATE"

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

# --- 4. auth preflight (after lock, before any model call) ---
run_auth_preflight "pre-Codex" || finish 10

# --- 5. repo/handoff validation ---
if check_no_objective; then
    log "ABORT (pre-flight): OVERNIGHT_TASK.md has no Objective set. Set one before running this pipeline."
    finish 2
fi
validate_state "pre-flight" || finish 2

# --- 6. Codex phase - capture exit code, do NOT immediately abort on nonzero ---
run_agent_phase "codex" "$LOG_DIR/codex.log" "$LOG_DIR/codex.stderr.log" "$LOG_DIR/codex.exit" \
    codex exec \
    --cd "$REPO_ROOT" \
    --sandbox workspace-write \
    --json \
    --output-last-message "$LOG_DIR/codex_last_message.txt" \
    "$CODEX_PROMPT"
codex_code=$?
if [ "$codex_code" -eq 0 ]; then
    log "Codex phase exited 0."
else
    log "Codex phase exited nonzero ($codex_code) - checking whether it left a safe checkpoint before deciding how to proceed."
fi

# --- 7. safety judgment: never trust Codex's own exit code alone ---
if ! validate_state "post-Codex"; then
    if [ "$codex_code" -ne 0 ]; then
        log "ABORT: Codex ended nonzero ($codex_code) and did not leave a state safe enough for Claude to resume."
        finish 3
    else
        log "ABORT: Codex exited 0 but left an unsafe/invalid state (dirty tree, conflict, or bad handoff)."
        finish 4
    fi
fi

codex_degraded=0
if [ "$codex_code" -ne 0 ]; then
    codex_degraded=1
    log "Codex ended nonzero ($codex_code) but left a safe, verified checkpoint. Continuing to Claude per the safe-continuation rule."
fi

# --- 8. re-run auth preflight before Claude - Codex's checkpoint already
#        stands regardless of what happens here ---
if ! run_auth_preflight "pre-Claude"; then
    log "Claude phase unavailable tonight (auth/usage check failed) - Codex's verified checkpoint from this run stands. Stopping cleanly, no retry, no wait, no fallback."
    finish 11
fi

# --- 9. Claude phase ---
run_agent_phase "claude" "$LOG_DIR/claude.log" "$LOG_DIR/claude.stderr.log" "$LOG_DIR/claude.exit" \
    claude -p "$CLAUDE_PROMPT" \
    --permission-mode auto \
    --max-budget-usd "$CLAUDE_BUDGET_USD" \
    --allowedTools "Read Write Edit Bash(git status*) Bash(git add*) Bash(git commit*) Bash(git log*) Bash(git diff*) Bash(git show*) Bash(python3*) Bash(./run_tests.sh*)" \
    --disallowedTools "Bash(git push*) Bash(git reset*) Bash(git clean*) Bash(git rebase*) Bash(git commit --amend*) Bash(git checkout*) Bash(git branch -D*) Bash(git filter-branch*) Bash(rm -rf*) Bash(sudo*) Bash(curl*) Bash(wget*) Bash(ssh*) WebFetch WebSearch" \
    --output-format json
claude_code=$?
if [ "$claude_code" -ne 0 ]; then
    log "ABORT: Claude phase failed (exit $claude_code)."
    finish 5
fi

# --- 10. final validation ---
validate_state "post-flight (after Claude)" || finish 6

# --- 11. report degraded-but-recovered runs distinctly - never as plain 0 ---
if [ "$codex_degraded" -eq 1 ]; then
    log "=== Overnight handoff run $RUN_ID completed: Codex ended nonzero but recovered safely; Claude finished the rest successfully. Logs: $LOG_DIR ==="
    finish 12
fi

log "=== Overnight handoff run $RUN_ID completed successfully. Logs: $LOG_DIR ==="
finish 0
