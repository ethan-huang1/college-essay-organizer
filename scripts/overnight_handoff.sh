#!/usr/bin/env bash
# Resumable Claude -> bounded Codex reserve -> optional Claude retry orchestrator.
# Agents run strictly sequentially. Durable state under logs/overnight lets a
# dead wrapper restart at its last safe phase instead of restarting the work.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TASK_FILE="$REPO_ROOT/OVERNIGHT_TASK.md"
HANDOFF_FILE="$REPO_ROOT/AGENT_HANDOFF.md"
LOCK_DIR="$REPO_ROOT/.overnight_handoff.lock"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
LOG_ROOT="$REPO_ROOT/logs/overnight"
LOG_DIR="$LOG_ROOT/$RUN_ID"
STATE_FILE="${OVERNIGHT_STATE_FILE:-$LOG_ROOT/resume.state}"
ORCH_LOG="$LOG_DIR/orchestrator.log"
SUMMARY_FILE="$LOG_DIR/summary.md"
PHASE_PID=""

# Codex has no reliable quota-percentage CLI. One invocation is the default
# conservative reserve proxy; users can configure an explicit integer bound.
CODEX_RESERVE_CYCLES="${CODEX_RESERVE_CYCLES:-1}"
CLAUDE_RETRY_CYCLES="${CLAUDE_RETRY_CYCLES:-1}"
CLAUDE_RETRY_BACKOFF_SECONDS="${CLAUDE_RETRY_BACKOFF_SECONDS:-300}"
PHASE_STALL_SECONDS="${PHASE_STALL_SECONDS:-1800}"
PHASE_MAX_SECONDS="${PHASE_MAX_SECONDS:-14400}"
WATCH_INTERVAL_SECONDS="${WATCH_INTERVAL_SECONDS:-15}"
MAX_NO_PROGRESS_PHASES="${MAX_NO_PROGRESS_PHASES:-2}"

# Exit codes (also written to logs/overnight/<run>/exit_code):
#   0 objective complete and final validation passed
#   2 pre-flight repo/handoff/objective validation failed
#   9 another live run holds the lock (or ownership is ambiguous)
#  10 primary Claude subscription-auth preflight failed
#  20 bounded sequence ended cleanly with work remaining
#  21 bounded sequence ended on a usage/rate limit
#  22 bounded sequence ended on a crash/error or unexpected normal exit
#  23 bounded sequence ended on timeout/stall or repeated no progress
#  24 an agent left an unsafe checkpoint; no next agent was started
#  25 a later agent's auth preflight failed; prior checkpoint remains valid
#  26 HUMAN-REQUIRED blocker recorded; no next agent was started
#  28 wrapper interrupted; resume state and checkpoint were preserved

mkdir -p "$LOG_DIR"
: >"$ORCH_LOG"

log() {
    printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$ORCH_LOG"
}

finish() {
    local code="$1"
    printf '%s\n' "$code" >"$LOG_DIR/exit_code"
    log "Final exit=$code; durable state=$STATE_FILE; summary=$SUMMARY_FILE"
    exit "$code"
}

is_nonnegative_integer() {
    case "$1" in ''|*[!0-9]*) return 1 ;; *) return 0 ;; esac
}

for numeric_setting in "$CODEX_RESERVE_CYCLES" "$CLAUDE_RETRY_CYCLES" \
    "$CLAUDE_RETRY_BACKOFF_SECONDS" "$PHASE_STALL_SECONDS" \
    "$PHASE_MAX_SECONDS" "$WATCH_INTERVAL_SECONDS" "$MAX_NO_PROGRESS_PHASES"; do
    if ! is_nonnegative_integer "$numeric_setting"; then
        log "ABORT: cycle/timing settings must be non-negative integers."
        finish 2
    fi
done
if [ "$WATCH_INTERVAL_SECONDS" -eq 0 ]; then WATCH_INTERVAL_SECONDS=1; fi
if [ "$PHASE_STALL_SECONDS" -eq 0 ]; then PHASE_STALL_SECONDS=1; fi
if [ "$PHASE_MAX_SECONDS" -eq 0 ]; then PHASE_MAX_SECONDS=1; fi
if [ "$MAX_NO_PROGRESS_PHASES" -eq 0 ]; then MAX_NO_PROGRESS_PHASES=1; fi

state_get() {
    local key="$1" fallback="${2:-}" value
    if [ ! -f "$STATE_FILE" ]; then printf '%s' "$fallback"; return; fi
    value="$(awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "$STATE_FILE")"
    printf '%s' "${value:-$fallback}"
}

state_set() {
    local key="$1" value="$2" tmp="$STATE_FILE.tmp.$$"
    mkdir -p "$(dirname "$STATE_FILE")"
    if [ -f "$STATE_FILE" ]; then
        awk -F= -v key="$key" '$1 != key {print}' "$STATE_FILE" >"$tmp"
    else
        : >"$tmp"
    fi
    printf '%s=%s\n' "$key" "$value" >>"$tmp"
    mv "$tmp" "$STATE_FILE"
}

cleanup_lock() {
    if [ -n "$PHASE_PID" ] && kill -0 "$PHASE_PID" 2>/dev/null; then
        kill "$PHASE_PID" 2>/dev/null || true
        wait "$PHASE_PID" 2>/dev/null || true
    fi
    rm -f "$LOCK_DIR/pid" "$LOCK_DIR/phase_pid" 2>/dev/null || true
    rmdir "$LOCK_DIR" 2>/dev/null || true
}

on_interrupt() {
    log "INTERRUPTED: next phase remains $(state_get NEXT_PHASE claude-primary)."
    state_set LAST_OUTCOME interrupted
    state_set IN_FLIGHT 0
    finish 28
}

# Recover only a lock whose recorded owner is provably dead. Empty/malformed
# locks stay untouched because deleting one would be guesswork.
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    lock_pid="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
    locked_phase_pid="$(cat "$LOCK_DIR/phase_pid" 2>/dev/null || true)"
    phase_is_live=0
    if is_nonnegative_integer "$locked_phase_pid" && [ "$locked_phase_pid" -gt 1 ] && kill -0 "$locked_phase_pid" 2>/dev/null; then
        phase_is_live=1
    fi
    if is_nonnegative_integer "$lock_pid" && [ "$lock_pid" -gt 1 ] && ! kill -0 "$lock_pid" 2>/dev/null && [ "$phase_is_live" -eq 0 ]; then
        rm -f "$LOCK_DIR/pid" "$LOCK_DIR/phase_pid" 2>/dev/null || true
        if rmdir "$LOCK_DIR" 2>/dev/null && mkdir "$LOCK_DIR" 2>/dev/null; then
            log "Recovered stale lock from dead pid $lock_pid."
        else
            log "ABORT: stale-lock recovery raced with another process."
            finish 9
        fi
    else
        log "ABORT: lock is live or ownership is ambiguous; nothing ran."
        finish 9
    fi
fi
printf '%s\n' "$$" >"$LOCK_DIR/pid"
trap cleanup_lock EXIT
trap on_interrupt INT TERM HUP

log "=== Overnight run $RUN_ID starting in $REPO_ROOT ==="

run_auth_preflight() {
    local agent="$1" label="$2"
    if [ -n "${ANTHROPIC_API_KEY:-}" ] || [ -n "${OPENAI_API_KEY:-}" ]; then
        log "ABORT (auth $label): API-key environment variable detected; subscription CLIs are required."
        return 1
    fi
    if [ "$agent" = "claude" ]; then
        if ! claude --help 2>/dev/null | grep -q '"auto"'; then
            log "ABORT (auth $label): Claude CLI does not advertise permission-mode auto."
            return 1
        fi
        local claude_json fields logged_in auth_method api_provider subscription
        claude_json="$(claude auth status --json 2>/dev/null)" || {
            log "ABORT (auth $label): claude auth status failed."
            return 1
        }
        fields="$(printf '%s' "$claude_json" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("false|PARSE_ERROR|PARSE_ERROR|PARSE_ERROR")
    raise SystemExit
print("{}|{}|{}|{}".format(
    "true" if d.get("loggedIn") is True else "false",
    d.get("authMethod") or "", d.get("apiProvider") or "",
    d.get("subscriptionType") or ""))
' 2>/dev/null)"
        IFS='|' read -r logged_in auth_method api_provider subscription <<<"$fields"
        case "$subscription" in pro|max|team|enterprise) : ;; *) subscription="REJECTED:$subscription" ;; esac
        if [ "$logged_in" != "true" ] || [ "$auth_method" != "claude.ai" ] || \
            [ "$api_provider" != "firstParty" ] || [[ "$subscription" = REJECTED:* ]]; then
            log "ABORT (auth $label): Claude subscription check failed (loggedIn=$logged_in authMethod=$auth_method apiProvider=$api_provider subscription=$subscription)."
            return 1
        fi
        log "Auth OK ($label): Claude subscription verified ($subscription)."
        log "REMINDER: the CLI cannot verify whether account usage credits/auto-reload are disabled."
        return 0
    fi

    local codex_status
    codex_status="$(codex login status 2>&1)" || {
        log "ABORT (auth $label): codex login status failed."
        return 1
    }
    case "$codex_status" in
        "Logged in using ChatGPT"*) log "Auth OK ($label): Codex ChatGPT auth verified." ;;
        *) log "ABORT (auth $label): Codex is not authenticated with ChatGPT."; return 1 ;;
    esac
}

VALIDATION_REASON=""
validate_state() {
    local phase="$1" recorded resolved head non_doc
    VALIDATION_REASON=""
    if [ ! -f "$TASK_FILE" ] || [ ! -f "$HANDOFF_FILE" ]; then
        VALIDATION_REASON="missing-files"; log "INVALID ($phase): task/handoff missing."; return 1
    fi
    if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1 || [ -n "$(git ls-files -u)" ]; then
        VALIDATION_REASON="conflict"; log "INVALID ($phase): merge/conflict state."; return 1
    fi
    if [ -n "$(git status --porcelain)" ]; then
        VALIDATION_REASON="dirty-tree"; log "INVALID ($phase): working tree is not clean."
        git status --porcelain | tee -a "$ORCH_LOG"; return 1
    fi
    if grep -q '^HUMAN-REQUIRED:' "$HANDOFF_FILE"; then
        VALIDATION_REASON="human-required"; log "INVALID ($phase): HUMAN-REQUIRED is present."; return 1
    fi
    recorded="$(awk '/^## Last Verified Commit/{f=1;next} f && match($0,/`[0-9a-f]{7,40}`/){print substr($0,RSTART+1,RLENGTH-2); exit}' "$HANDOFF_FILE")"
    resolved="$(git rev-parse --verify -q "${recorded}^{commit}" 2>/dev/null || true)"
    head="$(git rev-parse HEAD)"
    if [ -z "$recorded" ] || [ -z "$resolved" ]; then
        VALIDATION_REASON="bad-handoff-hash"; log "INVALID ($phase): Last Verified Commit is invalid."; return 1
    fi
    if [ "$resolved" != "$head" ]; then
        if ! git merge-base --is-ancestor "$resolved" "$head"; then
            VALIDATION_REASON="stale-handoff"; log "INVALID ($phase): verified commit is outside current history."; return 1
        fi
        non_doc="$(git diff --name-only "$resolved" "$head" | grep -vE '^(AGENT_HANDOFF\.md|OVERNIGHT_TASK\.md|CLAUDE\.md|AGENTS\.md|MVP_SPEC\.md)$' || true)"
        if [ -n "$non_doc" ]; then
            VALIDATION_REASON="stale-handoff"; log "INVALID ($phase): non-doc changes after verified commit: $non_doc"; return 1
        fi
    fi
    if [ -x "$REPO_ROOT/run_tests.sh" ]; then
        log "Running canonical verification ($phase)..."
        if ! "$REPO_ROOT/run_tests.sh" >>"$ORCH_LOG" 2>&1; then
            VALIDATION_REASON="tests-failed"; log "INVALID ($phase): canonical verification failed."; return 1
        fi
    fi
    log "Validation OK ($phase). HEAD=$head"
}

check_no_objective() { grep -q 'No objective set yet' "$TASK_FILE"; }

file_mtime() {
    if [ ! -e "$1" ]; then printf '0'; return; fi
    stat -f '%m' "$1" 2>/dev/null || stat -c '%Y' "$1" 2>/dev/null || printf '0'
}

PHASE_WATCHDOG_REASON=""
run_agent_phase() {
    local label="$1" out="$2" errf="$3" exitf="$4"
    shift 4
    local start now last_progress old_size new_size old_err new_err old_head new_head old_handoff new_handoff code
    start="$(date +%s)"; last_progress="$start"
    : >"$out"; : >"$errf"
    old_size=0; old_err=0; old_head="$(git rev-parse HEAD)"; old_handoff="$(file_mtime "$HANDOFF_FILE")"
    PHASE_WATCHDOG_REASON=""
    log "Starting $label; stdout=$out stderr=$errf"
    "$@" </dev/null >"$out" 2>"$errf" &
    PHASE_PID=$!
    printf '%s\n' "$PHASE_PID" >"$LOCK_DIR/phase_pid"
    while kill -0 "$PHASE_PID" 2>/dev/null; do
        sleep "$WATCH_INTERVAL_SECONDS"
        now="$(date +%s)"
        new_size="$(wc -c <"$out" 2>/dev/null || printf '0')"
        new_err="$(wc -c <"$errf" 2>/dev/null || printf '0')"
        new_head="$(git rev-parse HEAD 2>/dev/null || printf unknown)"
        new_handoff="$(file_mtime "$HANDOFF_FILE")"
        if [ "$new_size" != "$old_size" ] || [ "$new_err" != "$old_err" ] || \
            [ "$new_head" != "$old_head" ] || [ "$new_handoff" != "$old_handoff" ]; then
            last_progress="$now"; old_size="$new_size"; old_err="$new_err"; old_head="$new_head"; old_handoff="$new_handoff"
        fi
        if [ $((now - start)) -ge "$PHASE_MAX_SECONDS" ]; then PHASE_WATCHDOG_REASON="timeout"; break; fi
        if [ $((now - last_progress)) -ge "$PHASE_STALL_SECONDS" ]; then PHASE_WATCHDOG_REASON="stall"; break; fi
    done
    if [ -n "$PHASE_WATCHDOG_REASON" ] && kill -0 "$PHASE_PID" 2>/dev/null; then
        log "Watchdog stopping $label: $PHASE_WATCHDOG_REASON."
        kill "$PHASE_PID" 2>/dev/null || true
    fi
    wait "$PHASE_PID" 2>/dev/null; code=$?; PHASE_PID=""; rm -f "$LOCK_DIR/phase_pid"
    if [ "$PHASE_WATCHDOG_REASON" = "timeout" ]; then code=124; fi
    if [ "$PHASE_WATCHDOG_REASON" = "stall" ]; then code=125; fi
    printf '%s\n' "$code" >"$exitf"
    log "$label exited code=$code watchdog=${PHASE_WATCHDOG_REASON:-none}."
    return "$code"
}

classify_result() {
    local code="$1" out="$2" errf="$3" combined
    if [ "$PHASE_WATCHDOG_REASON" = "timeout" ]; then printf 'timeout'; return; fi
    if [ "$PHASE_WATCHDOG_REASON" = "stall" ]; then printf 'stall'; return; fi
    combined="$(tail -200 "$out" "$errf" 2>/dev/null | tr '[:upper:]' '[:lower:]')"
    if printf '%s' "$combined" | grep -Eq 'session limit|usage limit|rate.?limit|api_error_status[^0-9]*429|http[^0-9]*429|resets [0-9]'; then
        printf 'usage-limit'
    elif [ "$code" -eq 0 ]; then
        printf 'normal-exit'
    else
        printf 'crash-error'
    fi
}

handoff_disposition() {
    awk '/^## Overnight Run State/{f=1;next} f && /^## /{exit} f && /^- Disposition:/{print tolower($3); exit}' "$HANDOFF_FILE"
}

write_snapshot() {
    local phase="$1" agent="$2" outcome="$3" code="$4" start_head="$5" validation="$6"
    local snapshot="$LOG_DIR/$phase-handoff.md" end_head files commits
    end_head="$(git rev-parse HEAD 2>/dev/null || printf unknown)"
    files="$(git diff --name-only "$start_head" "$end_head" 2>/dev/null | paste -sd, -)"
    commits="$(git log --oneline "$start_head..$end_head" 2>/dev/null | paste -sd';' -)"
    {
        printf '# Handoff snapshot: %s\n\n' "$phase"
        printf -- '- Agent: %s\n- Outcome: %s\n- Process exit: %s\n' "$agent" "$outcome" "$code"
        printf -- '- Stop reason: %s\n- Repository validation: %s\n' "$outcome" "$validation"
        printf -- '- Latest Git commit: %s\n- Files changed in phase: %s\n' "$end_head" "${files:-none}"
        printf -- '- Commits in phase: %s\n' "${commits:-none}"
        printf -- '- Current objective: `%s` (full text in OVERNIGHT_TASK.md)\n' "$(awk '/^## Objective/{f=1;next} f && NF {print; exit}' "$TASK_FILE")"
        printf -- '- Current task, completed work, decisions, tests, and next recommendation: committed AGENT_HANDOFF.md below.\n\n'
        printf '## AGENT_HANDOFF.md at phase end\n\n'; cat "$HANDOFF_FILE"
    } >"$snapshot"
    printf '| %s | %s | %s | %s | %s | `%s` |\n' "$phase" "$agent" "$outcome" "$code" "$validation" "$end_head" >>"$SUMMARY_FILE"
    log "Persisted $snapshot (files=${files:-none})."
}

terminal_code_for_outcome() {
    case "$1" in usage-limit) printf '21' ;; timeout|stall|no-progress) printf '23' ;; normal-exit) printf '20' ;; *) printf '22' ;; esac
}

wait_backoff() {
    local remaining="$1" chunk
    while [ "$remaining" -gt 0 ]; do
        chunk=30; if [ "$remaining" -lt "$chunk" ]; then chunk="$remaining"; fi
        log "Claude retry backoff: ${remaining}s remaining."
        sleep "$chunk"; remaining=$((remaining - chunk))
    done
}

read -r -d '' SHARED_PROMPT <<'EOF' || true
Read CLAUDE.md, OVERNIGHT_TASK.md, MVP_SPEC.md, AGENT_HANDOFF.md, and the
latest logs/overnight handoff snapshot before changing anything. Resume from
the latest verified commit; do not restart or redo completed work.

Treat this repository as the only authorized work area. Do not inspect or
modify unrelated files, credentials, personal data, or system configuration.

Work autonomously until the objective is complete, a genuine usage/rate
limit stops the CLI, an unrecoverable error occurs, or repeated lack of
progress makes continued work unsafe. A short elapsed time is never itself
a reason to hand off. Create tested Git checkpoints at safe boundaries.

Before every normal stop, update AGENT_HANDOFF.md with Current objective,
completed tasks, Current task, exact next recommended task, important
decisions, files changed, test/build status, latest verified commit, and why
you stopped. Under `## Overnight Run State`, set `- Disposition: complete`
only when the full objective/Definition of Done is actually complete;
otherwise set `- Disposition: continue`. Leave the working tree clean.
EOF

current_task_hash="$(shasum -a 256 "$TASK_FILE" | awk '{print $1}')"
saved_task_hash="$(state_get TASK_HASH '')"
if [ "${OVERNIGHT_RESET_STATE:-0}" = "1" ] || [ "$saved_task_hash" != "$current_task_hash" ]; then
    state_set VERSION 2; state_set TASK_HASH "$current_task_hash"; state_set NEXT_PHASE claude-primary
    state_set CODEX_USED 0; state_set CLAUDE_RETRIES_USED 0; state_set NO_PROGRESS_COUNT 0
    state_set COMPLETE 0; state_set IN_FLIGHT 0; state_set LAST_OUTCOME new-objective
    log "Initialized state for a new/changed objective."
else
    log "Resuming: next=$(state_get NEXT_PHASE terminal) codex_used=$(state_get CODEX_USED 0) claude_retries=$(state_get CLAUDE_RETRIES_USED 0)."
fi
state_set LAST_RUN_ID "$RUN_ID"

if check_no_objective; then log "ABORT: no objective is set."; finish 2; fi
if [ "$(state_get COMPLETE 0)" = "1" ]; then
    validate_state "resume-complete" || finish 2
    log "Objective already marked complete; no agent needed."; finish 0
fi
if [ "$(state_get NEXT_PHASE terminal)" = "terminal" ]; then
    last="$(state_get LAST_OUTCOME normal-exit)"
    log "Bounded sequence already exhausted ($last). Use OVERNIGHT_RESET_STATE=1 only to authorize a new sequence."
    finish "$(terminal_code_for_outcome "$last")"
fi
validate_state "pre-flight" || { if [ "$VALIDATION_REASON" = "human-required" ]; then finish 26; fi; finish 2; }

{
    printf '# Overnight run %s\n\n' "$RUN_ID"
    printf '| Phase | Agent | Outcome | Exit | Validation | Commit |\n|---|---|---|---:|---|---|\n'
} >"$SUMMARY_FILE"

while :; do
    phase="$(state_get NEXT_PHASE terminal)"
    if [ "$phase" = "terminal" ]; then finish "$(terminal_code_for_outcome "$(state_get LAST_OUTCOME normal-exit)")"; fi
    case "$phase" in claude-primary|claude-retry-*) agent=claude ;; codex-*) agent=codex ;; *) log "ABORT: corrupt phase '$phase'."; finish 2 ;; esac
    if ! run_auth_preflight "$agent" "$phase"; then if [ "$phase" = "claude-primary" ]; then finish 10; else finish 25; fi; fi
    if [[ "$phase" = claude-retry-* ]]; then wait_backoff "$CLAUDE_RETRY_BACKOFF_SECONDS"; fi

    phase_start_head="$(git rev-parse HEAD)"
    state_set IN_FLIGHT 1
    phase_out="$LOG_DIR/$phase.stdout.log"; phase_err="$LOG_DIR/$phase.stderr.log"; phase_exit="$LOG_DIR/$phase.exit"
    phase_prompt="You are the $phase agent in a Claude-primary, bounded-Codex-reserve workflow. Durable state: $STATE_FILE. Run directory: $LOG_DIR.\n\n$SHARED_PROMPT"
    if [ "$agent" = "claude" ]; then
        run_agent_phase "$phase" "$phase_out" "$phase_err" "$phase_exit" \
            claude -p "$phase_prompt" --permission-mode auto \
            --disallowedTools "Bash(git push*) Bash(git reset*) Bash(git clean*) Bash(git rebase*) Bash(git commit --amend*) Bash(git checkout*) Bash(git branch -D*) Bash(git filter-branch*) Bash(rm -rf*) Bash(sudo*) Bash(ssh*)" \
            --output-format json
    else
        run_agent_phase "$phase" "$phase_out" "$phase_err" "$phase_exit" \
            codex exec --cd "$REPO_ROOT" --sandbox workspace-write --approve-for-me --json \
            --output-last-message "$LOG_DIR/$phase-last-message.txt" "$phase_prompt"
    fi
    phase_code=$?
    outcome="$(classify_result "$phase_code" "$phase_out" "$phase_err")"
    printf '%s\n' "$outcome" >"$LOG_DIR/$phase.outcome"
    state_set IN_FLIGHT 0; state_set LAST_PHASE "$phase"; state_set LAST_OUTCOME "$outcome"

    validation=passed
    if ! validate_state "post-$phase"; then
        validation="failed:$VALIDATION_REASON"
        write_snapshot "$phase" "$agent" "$outcome" "$phase_code" "$phase_start_head" "$validation"
        state_set NEXT_PHASE terminal
        if [ "$VALIDATION_REASON" = "human-required" ]; then finish 26; fi
        finish 24
    fi
    write_snapshot "$phase" "$agent" "$outcome" "$phase_code" "$phase_start_head" "$validation"

    # Count reserve/retry invocations even when that invocation completes the
    # objective; these are consumption bounds, not just transition counters.
    case "$phase" in
        codex-*) state_set CODEX_USED "$(( $(state_get CODEX_USED 0) + 1 ))" ;;
        claude-retry-*) state_set CLAUDE_RETRIES_USED "$(( $(state_get CLAUDE_RETRIES_USED 0) + 1 ))" ;;
    esac

    if [ "$(handoff_disposition)" = "complete" ]; then
        state_set COMPLETE 1; state_set NEXT_PHASE terminal; state_set LAST_OUTCOME complete
        log "Objective marked complete by $phase and independently validated."; finish 0
    fi

    phase_end_head="$(git rev-parse HEAD)"; no_progress="$(state_get NO_PROGRESS_COUNT 0)"
    if [ "$phase_start_head" = "$phase_end_head" ] && [ "$outcome" = "normal-exit" ]; then
        no_progress=$((no_progress + 1)); state_set NO_PROGRESS_COUNT "$no_progress"
        log "$phase made no checkpointed progress (count=$no_progress)."
    else
        state_set NO_PROGRESS_COUNT 0; no_progress=0
    fi
    if [ "$no_progress" -ge "$MAX_NO_PROGRESS_PHASES" ]; then
        state_set LAST_OUTCOME no-progress; state_set NEXT_PHASE terminal
        log "Terminal: repeated no-progress bound reached."; finish 23
    fi

    case "$phase" in
        claude-primary)
            codex_used="$(state_get CODEX_USED 0)"
            if [ "$codex_used" -lt "$CODEX_RESERVE_CYCLES" ]; then state_set NEXT_PHASE "codex-$((codex_used + 1))"
            elif [ "$(state_get CLAUDE_RETRIES_USED 0)" -lt "$CLAUDE_RETRY_CYCLES" ]; then state_set NEXT_PHASE claude-retry-1
            else state_set NEXT_PHASE terminal; fi
            ;;
        codex-*)
            codex_used="$(state_get CODEX_USED 0)"
            if [ "$codex_used" -lt "$CODEX_RESERVE_CYCLES" ]; then state_set NEXT_PHASE "codex-$((codex_used + 1))"
            else
                retry_used="$(state_get CLAUDE_RETRIES_USED 0)"
                if [ "$retry_used" -lt "$CLAUDE_RETRY_CYCLES" ]; then state_set NEXT_PHASE "claude-retry-$((retry_used + 1))"
                else state_set NEXT_PHASE terminal; fi
            fi
            ;;
        claude-retry-*)
            retry_used="$(state_get CLAUDE_RETRIES_USED 0)"
            if [ "$retry_used" -lt "$CLAUDE_RETRY_CYCLES" ]; then state_set NEXT_PHASE "claude-retry-$((retry_used + 1))"
            else state_set NEXT_PHASE terminal; fi
            ;;
    esac
    next="$(state_get NEXT_PHASE terminal)"
    if [ "$next" = "terminal" ]; then
        log "Bounded sequence exhausted; last outcome=$outcome; work remains."
        finish "$(terminal_code_for_outcome "$outcome")"
    fi
    log "Safe handoff: $phase ($outcome) -> $next."
done
