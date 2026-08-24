#!/usr/bin/env bash
# Deterministic tests for scripts/overnight_handoff.sh.
#
# Runs the real orchestrator script against disposable scratch git repos with
# fake `claude`/`codex` executables (no real API calls, no cost, no real
# auth/model calls of any kind). Each case copies a shared valid "template"
# repo, mutates it to set up one scenario, runs the orchestrator, and
# asserts its exit code / effects. Plain asserts, no test framework - run
# with: bash scripts/test_overnight_handoff.sh
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORCH="$REPO_ROOT/scripts/overnight_handoff.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail=0

assert() {
    local desc="$1" got="$2" want="$3"
    if [ "$got" = "$want" ]; then
        pass=$((pass + 1))
        printf 'PASS: %s\n' "$desc"
    else
        fail=$((fail + 1))
        printf 'FAIL: %s (want %s, got %s)\n' "$desc" "$want" "$got"
    fi
}

assert_contains() {
    local desc="$1" haystack="$2" needle="$3"
    if printf '%s' "$haystack" | grep -qF -- "$needle"; then
        pass=$((pass + 1))
        printf 'PASS: %s\n' "$desc"
    else
        fail=$((fail + 1))
        printf 'FAIL: %s (expected to find %q)\n' "$desc" "$needle"
    fi
}

assert_not_contains() {
    local desc="$1" haystack="$2" needle="$3"
    if printf '%s' "$haystack" | grep -qF -- "$needle"; then
        fail=$((fail + 1))
        printf 'FAIL: %s (expected NOT to find %q)\n' "$desc" "$needle"
    else
        pass=$((pass + 1))
        printf 'PASS: %s\n' "$desc"
    fi
}

assert_file_missing_or_empty() {
    local desc="$1" path="$2"
    if [ ! -s "$path" ]; then
        pass=$((pass + 1))
        printf 'PASS: %s\n' "$desc"
    else
        fail=$((fail + 1))
        printf 'FAIL: %s (expected %s to be missing/empty, has content)\n' "$desc" "$path"
    fi
}

# ---------------------------------------------------------------------------
# Stub claude/codex executables. Both handle three call shapes:
#   --help                    -> capability fixture (for the "supports auto" check)
#   auth status --json        -> call-numbered Claude auth fixture (claude only)
#   login status              -> call-numbered Codex auth fixture (codex only)
#   <real work invocation>    -> argv capture, sequence log, stdin check, then
#                                 STUB_*_MODE-driven behavior
# ---------------------------------------------------------------------------
STUB_BIN="$WORK/bin"
mkdir -p "$STUB_BIN"

cat >"$STUB_BIN/claude" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "--help" ]; then
    if [ "${STUB_CLAUDE_HELP_HAS_AUTO:-1}" = "1" ]; then
        echo 'Options: --permission-mode <mode> (choices: "acceptEdits", "auto", "bypassPermissions", "manual", "dontAsk", "plan")'
    else
        echo 'Options: --permission-mode <mode> (choices: "acceptEdits", "bypassPermissions", "manual", "dontAsk", "plan")'
    fi
    exit 0
fi

if [ "${1:-}" = "auth" ] && [ "${2:-}" = "status" ]; then
    count=0
    if [ -f "$STUB_CLAUDE_AUTH_COUNTER_FILE" ]; then
        count="$(cat "$STUB_CLAUDE_AUTH_COUNTER_FILE")"
    fi
    count=$((count + 1))
    echo "$count" >"$STUB_CLAUDE_AUTH_COUNTER_FILE"
    if [ "$count" -le 1 ]; then
        printf '%s' "$STUB_CLAUDE_AUTH_JSON_1"
    else
        printf '%s' "$STUB_CLAUDE_AUTH_JSON_2"
    fi
    exit 0
fi

# Real work invocation: claude -p "<prompt>" ...
printf '%s\n' "$@" >"$STUB_ARGV_FILE.claude"
echo claude >>"$STUB_SEQ_FILE"
if read -r -t 1 _line; then
    echo "HAD_DATA" >"$STUB_STDIN_CHECK_FILE.claude"
else
    echo "EOF" >"$STUB_STDIN_CHECK_FILE.claude"
fi

mode="${STUB_CLAUDE_MODE:-success}"
if [ "$mode" = "fail" ]; then
    echo '{"is_error":true}'
    exit 1
fi

echo "claude progress $$" >>stub_progress.txt
git add stub_progress.txt
git commit -q -m "stub: claude progress"
newhash="$(git rev-parse HEAD)"
sed -i '' "s/COMPLETED_PLACEHOLDER/stub claude did its part/" AGENT_HANDOFF.md
sed -i '' "s/\`[0-9a-f]\{7,40\}\`/\`$newhash\`/" AGENT_HANDOFF.md
if [ "$mode" = "human-required" ]; then
    sed -i '' "s/BLOCKERS_PLACEHOLDER/HUMAN-REQUIRED: stub claude needs a human/" AGENT_HANDOFF.md
else
    sed -i '' "s/BLOCKERS_PLACEHOLDER/none/" AGENT_HANDOFF.md
fi
git add AGENT_HANDOFF.md
git commit -q -m "stub: claude update handoff"
echo '{"is_error":false}'
STUB

cat >"$STUB_BIN/codex" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "login" ] && [ "${2:-}" = "status" ]; then
    count=0
    if [ -f "$STUB_CODEX_LOGIN_COUNTER_FILE" ]; then
        count="$(cat "$STUB_CODEX_LOGIN_COUNTER_FILE")"
    fi
    count=$((count + 1))
    echo "$count" >"$STUB_CODEX_LOGIN_COUNTER_FILE"
    if [ "$count" -le 1 ]; then
        printf '%s' "$STUB_CODEX_LOGIN_STATUS_1"
    else
        printf '%s' "$STUB_CODEX_LOGIN_STATUS_2"
    fi
    exit 0
fi

if [ "${1:-}" != "exec" ]; then
    echo "stub codex: unsupported invocation: $*" >&2
    exit 64
fi

# Real work invocation: codex exec ...
printf '%s\n' "$@" >"$STUB_ARGV_FILE.codex"
echo codex >>"$STUB_SEQ_FILE"
if read -r -t 1 _line; then
    echo "HAD_DATA" >"$STUB_STDIN_CHECK_FILE.codex"
else
    echo "EOF" >"$STUB_STDIN_CHECK_FILE.codex"
fi

mode="${STUB_CODEX_MODE:-success}"

case "$mode" in
fail)
    # Exits nonzero without touching the repo at all - "trivial nonzero but safe (unchanged)".
    echo '{"type":"error"}'
    exit 1
    ;;
dirty-fail | dirty-success)
    # Leaves an uncommitted, unexpected change - unsafe regardless of exit code.
    echo "uncommitted stray change" >>codex_stray.txt
    if [ "$mode" = "dirty-fail" ]; then
        exit 1
    else
        exit 0
    fi
    ;;
stale)
    # Commits a NEW non-doc file without updating Last Verified Commit -
    # HEAD moves past the recorded commit with a real code change unaccounted for.
    echo "silent code change $$" >>untracked_by_handoff.txt
    git add untracked_by_handoff.txt
    git commit -q -m "stub: codex made a change without updating the handoff"
    exit 1
    ;;
esac

# success, human-required, and degraded all commit safely first.
echo "codex progress $$" >>stub_progress.txt
git add stub_progress.txt
git commit -q -m "stub: codex progress"
newhash="$(git rev-parse HEAD)"
sed -i '' "s/NEXTSTEPS_PLACEHOLDER/stub codex finished the rest/" AGENT_HANDOFF.md
sed -i '' "s/\`[0-9a-f]\{7,40\}\`/\`$newhash\`/" AGENT_HANDOFF.md
if [ "$mode" = "human-required" ]; then
    sed -i '' "s/BLOCKERS_PLACEHOLDER/HUMAN-REQUIRED: stub codex needs a human/" AGENT_HANDOFF.md
fi
git add AGENT_HANDOFF.md
git commit -q -m "stub: codex update handoff"

if [ "$mode" = "degraded" ]; then
    # Real, safe, verified work happened above - THEN codex fails (e.g. usage ran out).
    echo '{"type":"error"}'
    exit 1
fi

echo '{"type":"result"}'
STUB

chmod +x "$STUB_BIN/claude" "$STUB_BIN/codex"

# ---------------------------------------------------------------------------
# Shared valid template repo
# ---------------------------------------------------------------------------
TEMPLATE="$WORK/template"
mkdir -p "$TEMPLATE"
git -C "$TEMPLATE" init -q
git -C "$TEMPLATE" config user.email "test@example.com"
git -C "$TEMPLATE" config user.name "Overnight Handoff Test"

cat >"$TEMPLATE/OVERNIGHT_TASK.md" <<'EOF'
# Overnight Task
## Objective
Test objective: append a line to stub_progress.txt. See MVP_SPEC.md.
## Rules
1. Test rule.
## Definition of Done
- [ ] stub_progress.txt updated and committed.
EOF

cat >"$TEMPLATE/MVP_SPEC.md" <<'EOF'
# Test fixture MVP_SPEC.md
Placeholder product spec referenced by OVERNIGHT_TASK.md and both agent prompts.
EOF

cat >"$TEMPLATE/AGENT_HANDOFF.md" <<'EOF'
# Agent Handoff
## Current Status
STATUS_PLACEHOLDER
## Completed
COMPLETED_PLACEHOLDER
## In Progress
INPROGRESS_PLACEHOLDER
## Next Steps
NEXTSTEPS_PLACEHOLDER
## Failed Approaches
FAILEDAPPROACHES_PLACEHOLDER
## Blockers
BLOCKERS_PLACEHOLDER
## Tests/Verification Performed
TESTS_PLACEHOLDER
## Last Verified Commit

`PLACEHOLDER`
EOF

cat >"$TEMPLATE/CLAUDE.md" <<'EOF'
# Repo Instructions
Test fixture CLAUDE.md.
EOF

cat >"$TEMPLATE/.gitignore" <<'EOF'
logs/
.overnight_handoff.lock/
EOF

mkdir -p "$TEMPLATE/scripts"
cp "$ORCH" "$TEMPLATE/scripts/overnight_handoff.sh"
chmod +x "$TEMPLATE/scripts/overnight_handoff.sh"

# Only fill placeholders no stub touches - see the stub scripts above for
# which placeholders COMPLETED/NEXTSTEPS/BLOCKERS/FAILEDAPPROACHES are left
# for. Consuming them here too would make the stubs' own sed replacements
# silent no-ops (this bit us once already during Layer 3 development).
sed -i '' "s/STATUS_PLACEHOLDER/idle/; s/INPROGRESS_PLACEHOLDER/none/; s/TESTS_PLACEHOLDER/none/" "$TEMPLATE/AGENT_HANDOFF.md"
git -C "$TEMPLATE" add -A
git -C "$TEMPLATE" commit -q -m "template: initial state"
base_hash="$(git -C "$TEMPLATE" rev-parse HEAD)"
sed -i '' "s/\`PLACEHOLDER\`/\`$base_hash\`/" "$TEMPLATE/AGENT_HANDOFF.md"
git -C "$TEMPLATE" add AGENT_HANDOFF.md
git -C "$TEMPLATE" commit -q -m "template: record initial verified commit"

# ---------------------------------------------------------------------------
# Harness helpers
# ---------------------------------------------------------------------------
VALID_CLAUDE_AUTH_JSON='{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","subscriptionType":"pro"}'
VALID_CODEX_LOGIN_STATUS='Logged in using ChatGPT'

new_case() {
    local name="$1"
    local dir="$WORK/case_$name"
    cp -R "$TEMPLATE" "$dir"
    echo "$dir"
}

exit_code_of() { cat "$WORK/$(basename "$1").exit_code" 2>/dev/null; }
argv_of() { cat "$WORK/$(basename "$1").$2" 2>/dev/null; }
assert_has_line() {
    local desc="$1" haystack="$2" line="$3"
    if printf '%s\n' "$haystack" | grep -qxF -- "$line"; then
        pass=$((pass + 1))
        printf 'PASS: %s\n' "$desc"
    else
        fail=$((fail + 1))
        printf 'FAIL: %s (expected a line exactly %q)\n' "$desc" "$line"
    fi
}

# run_orchestrator DIR
# Reads (with defaults) the following env vars if the caller has exported
# them before calling: STUB_CLAUDE_MODE, STUB_CODEX_MODE,
# STUB_CLAUDE_HELP_HAS_AUTO, STUB_CLAUDE_AUTH_JSON_1, STUB_CLAUDE_AUTH_JSON_2,
# STUB_CODEX_LOGIN_STATUS_1, STUB_CODEX_LOGIN_STATUS_2, ANTHROPIC_API_KEY,
# OPENAI_API_KEY. Everything else (file paths) is set internally per-case.
run_orchestrator() {
    local dir="$1"
    local name
    name="$(basename "$dir")"
    local seqfile="$WORK/$name.seq.log"
    local argv_base="$WORK/$name"
    local stdin_base="$WORK/$name.stdin"
    : >"$seqfile"
    rm -f "$argv_base.claude" "$argv_base.codex"
    (
        cd "$dir" &&
            PATH="$STUB_BIN:$PATH" \
                STUB_SEQ_FILE="$seqfile" \
                STUB_ARGV_FILE="$argv_base" \
                STUB_STDIN_CHECK_FILE="$stdin_base" \
                STUB_CLAUDE_AUTH_COUNTER_FILE="$WORK/$name.claude_auth_count" \
                STUB_CODEX_LOGIN_COUNTER_FILE="$WORK/$name.codex_login_count" \
                STUB_CLAUDE_MODE="${STUB_CLAUDE_MODE:-success}" \
                STUB_CODEX_MODE="${STUB_CODEX_MODE:-success}" \
                STUB_CLAUDE_HELP_HAS_AUTO="${STUB_CLAUDE_HELP_HAS_AUTO:-1}" \
                STUB_CLAUDE_AUTH_JSON_1="${STUB_CLAUDE_AUTH_JSON_1:-$VALID_CLAUDE_AUTH_JSON}" \
                STUB_CLAUDE_AUTH_JSON_2="${STUB_CLAUDE_AUTH_JSON_2:-${STUB_CLAUDE_AUTH_JSON_1:-$VALID_CLAUDE_AUTH_JSON}}" \
                STUB_CODEX_LOGIN_STATUS_1="${STUB_CODEX_LOGIN_STATUS_1:-$VALID_CODEX_LOGIN_STATUS}" \
                STUB_CODEX_LOGIN_STATUS_2="${STUB_CODEX_LOGIN_STATUS_2:-${STUB_CODEX_LOGIN_STATUS_1:-$VALID_CODEX_LOGIN_STATUS}}" \
                ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
                OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
                bash scripts/overnight_handoff.sh
    ) >"$WORK/$name.stdout.log" 2>&1
    echo $? >"$WORK/$name.exit_code"
    cat "$seqfile"
}

echo "=== case: lock already held -> refuses to start, nothing touched ==="
d=$(new_case lock_held)
mkdir "$d/.overnight_handoff.lock"
seq_out=$(run_orchestrator "$d")
assert "lock held -> orchestrator exit 9" "$(exit_code_of "$d")" "9"
assert "lock held -> neither agent invoked" "$seq_out" ""
assert "lock held -> no claude auth-status call happened" "$([ -f "$WORK/case_lock_held.claude_auth_count" ] && echo present || echo absent)" "absent"
assert "lock held -> no codex login-status call happened" "$([ -f "$WORK/case_lock_held.codex_login_count" ] && echo present || echo absent)" "absent"
assert "lock held -> existing lock directory still exists" "$([ -d "$d/.overnight_handoff.lock" ] && echo yes || echo no)" "yes"
rmdir "$d/.overnight_handoff.lock" 2>/dev/null || true

echo "=== case: happy path (Codex then Claude, both succeed) ==="
d=$(new_case happy)
seq_out=$(run_orchestrator "$d")
assert "happy path exits 0" "$(exit_code_of "$d")" "0"
assert "happy path: codex ran before claude" "$seq_out" "$(printf 'codex\nclaude')"
assert "happy path: working tree clean at end" "$(git -C "$d" status --porcelain)" ""
assert_contains "happy path: AGENT_HANDOFF.md shows both parts done" "$(cat "$d/AGENT_HANDOFF.md")" "stub claude did its part"
argv_claude="$(argv_of "$d" claude)"
argv_codex="$(argv_of "$d" codex)"
assert_contains "happy path: claude argv has --permission-mode flag" "$argv_claude" "--permission-mode"
assert_has_line "happy path: claude argv has 'auto' as a value" "$argv_claude" "auto"
assert_not_contains "happy path: claude argv lacks bypassPermissions" "$argv_claude" "bypassPermissions"
assert_not_contains "happy path: claude argv lacks --dangerously-skip-permissions" "$argv_claude" "--dangerously-skip-permissions"
assert_not_contains "happy path: claude argv lacks --permission-prompt-tool" "$argv_claude" "--permission-prompt-tool"
assert_not_contains "happy path: codex argv lacks --permission-prompt-tool" "$argv_codex" "--permission-prompt-tool"
assert_contains "happy path: codex argv has workspace-write sandbox" "$argv_codex" "workspace-write"
assert_contains "happy path: claude prompt references MVP_SPEC.md" "$argv_claude" "MVP_SPEC.md"
assert_contains "happy path: codex prompt references MVP_SPEC.md" "$argv_codex" "MVP_SPEC.md"
assert "happy path: claude stdin was EOF (from /dev/null)" "$(cat "$WORK/case_happy.stdin.claude" 2>/dev/null)" "EOF"
assert "happy path: codex stdin was EOF (from /dev/null)" "$(cat "$WORK/case_happy.stdin.codex" 2>/dev/null)" "EOF"

echo "=== case: no objective set -> pre-flight abort ==="
d=$(new_case no_objective)
cat >"$d/OVERNIGHT_TASK.md" <<'EOF'
# Overnight Task
## Objective
(No objective set yet.)
EOF
git -C "$d" add OVERNIGHT_TASK.md
git -C "$d" commit -q -m "blank the objective"
newhash="$(git -C "$d" rev-parse HEAD)"
sed -i '' "s/\`[0-9a-f]\{7,40\}\`/\`$newhash\`/" "$d/AGENT_HANDOFF.md"
git -C "$d" add AGENT_HANDOFF.md
git -C "$d" commit -q -m "record verified commit"
seq_out=$(run_orchestrator "$d")
assert "no objective -> orchestrator exit 2" "$(exit_code_of "$d")" "2"
assert "no objective -> neither agent invoked" "$seq_out" ""

echo "=== case: dirty working tree at start -> pre-flight abort ==="
d=$(new_case dirty_tree)
echo "unexpected stray change" >"$d/stray.txt"
seq_out=$(run_orchestrator "$d")
assert "dirty tree -> orchestrator exit 2" "$(exit_code_of "$d")" "2"
assert "dirty tree -> neither agent invoked" "$seq_out" ""
rm -f "$d/stray.txt"

echo "=== case: stale handoff at start (code changed without updating Last Verified Commit) ==="
d=$(new_case stale_handoff)
echo "silent code change" >"$d/untracked_by_handoff.txt"
git -C "$d" add untracked_by_handoff.txt
git -C "$d" commit -q -m "a code change nobody recorded in AGENT_HANDOFF.md"
seq_out=$(run_orchestrator "$d")
assert "stale handoff -> orchestrator exit 2" "$(exit_code_of "$d")" "2"
assert "stale handoff -> neither agent invoked" "$seq_out" ""

echo "=== case: docs-only commit after verified commit is NOT stale (real-world pattern) ==="
d=$(new_case docs_only_ok)
printf '\n<!-- trivial doc touch-up, no code change -->\n' >>"$d/AGENT_HANDOFF.md"
git -C "$d" add AGENT_HANDOFF.md
git -C "$d" commit -q -m "docs-only touch-up (Last Verified Commit still points at prior commit)"
seq_out=$(run_orchestrator "$d")
assert "docs-only commit after verified commit -> still runs (exit 0)" "$(exit_code_of "$d")" "0"

echo "=== case: HUMAN-REQUIRED marker already present -> pre-flight abort ==="
d=$(new_case human_required_preexisting)
sed -i '' "s/BLOCKERS_PLACEHOLDER/HUMAN-REQUIRED: pre-existing blocker/" "$d/AGENT_HANDOFF.md"
git -C "$d" add AGENT_HANDOFF.md
git -C "$d" commit -q -m "flag a pre-existing blocker"
newhash="$(git -C "$d" rev-parse HEAD)"
sed -i '' "s/\`[0-9a-f]\{7,40\}\`/\`$newhash\`/" "$d/AGENT_HANDOFF.md"
git -C "$d" add AGENT_HANDOFF.md
git -C "$d" commit -q -m "record verified commit"
seq_out=$(run_orchestrator "$d")
assert "pre-existing HUMAN-REQUIRED -> orchestrator exit 2" "$(exit_code_of "$d")" "2"
assert "pre-existing HUMAN-REQUIRED -> neither agent invoked" "$seq_out" ""

echo "=== case: merge conflict present -> pre-flight abort ==="
d=$(new_case merge_conflict)
git -C "$d" checkout -q -b other
echo "branch-other-version" >"$d/conflict.txt"
git -C "$d" add conflict.txt
git -C "$d" commit -q -m "other branch change"
git -C "$d" checkout -q main
echo "main-version" >"$d/conflict.txt"
git -C "$d" add conflict.txt
git -C "$d" commit -q -m "main branch change"
git -C "$d" merge other -q >/dev/null 2>&1 || true
seq_out=$(run_orchestrator "$d")
assert "merge conflict -> orchestrator exit 2" "$(exit_code_of "$d")" "2"
assert "merge conflict -> neither agent invoked" "$seq_out" ""
git -C "$d" merge --abort >/dev/null 2>&1 || true

# --- Claude auth allowlist rejections (pre-Codex, call 1) ---
echo "=== case: Claude loggedIn:false -> reject ==="
d=$(new_case auth_logged_out)
seq_out=$(STUB_CLAUDE_AUTH_JSON_1='{"loggedIn":false,"authMethod":"claude.ai","apiProvider":"firstParty","subscriptionType":"pro"}' run_orchestrator "$d")
assert "loggedIn:false -> exit 10" "$(exit_code_of "$d")" "10"
assert "loggedIn:false -> codex never invoked" "$seq_out" ""

echo "=== case: Claude wrong authMethod (apiKey) -> reject ==="
d=$(new_case auth_wrong_method)
seq_out=$(STUB_CLAUDE_AUTH_JSON_1='{"loggedIn":true,"authMethod":"apiKey","apiProvider":"firstParty","subscriptionType":"pro"}' run_orchestrator "$d")
assert "wrong authMethod -> exit 10" "$(exit_code_of "$d")" "10"
assert "wrong authMethod -> codex never invoked" "$seq_out" ""

echo "=== case: Claude wrong apiProvider (bedrock, contradictory fields) -> reject ==="
d=$(new_case auth_wrong_provider)
seq_out=$(STUB_CLAUDE_AUTH_JSON_1='{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"bedrock","subscriptionType":"pro"}' run_orchestrator "$d")
assert "wrong apiProvider -> exit 10" "$(exit_code_of "$d")" "10"
assert "wrong apiProvider -> codex never invoked" "$seq_out" ""

echo "=== case: Claude missing subscriptionType -> reject ==="
d=$(new_case auth_missing_sub)
seq_out=$(STUB_CLAUDE_AUTH_JSON_1='{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}' run_orchestrator "$d")
assert "missing subscriptionType -> exit 10" "$(exit_code_of "$d")" "10"
assert "missing subscriptionType -> codex never invoked" "$seq_out" ""

echo "=== case: Claude unknown subscriptionType (trial) -> reject ==="
d=$(new_case auth_unknown_sub)
seq_out=$(STUB_CLAUDE_AUTH_JSON_1='{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","subscriptionType":"trial"}' run_orchestrator "$d")
assert "unknown subscriptionType -> exit 10" "$(exit_code_of "$d")" "10"
assert "unknown subscriptionType -> codex never invoked" "$seq_out" ""

echo "=== case: Claude malformed JSON -> reject ==="
d=$(new_case auth_malformed)
seq_out=$(STUB_CLAUDE_AUTH_JSON_1='not json at all {{{' run_orchestrator "$d")
assert "malformed JSON -> exit 10" "$(exit_code_of "$d")" "10"
assert "malformed JSON -> codex never invoked" "$seq_out" ""

echo "=== case: claude --help omits auto -> reject before any auth-status call ==="
d=$(new_case auth_no_auto_mode)
seq_out=$(STUB_CLAUDE_HELP_HAS_AUTO=0 run_orchestrator "$d")
assert "no auto mode -> exit 10" "$(exit_code_of "$d")" "10"
assert "no auto mode -> codex never invoked" "$seq_out" ""
assert "no auto mode -> claude auth status never called" "$([ -f "$WORK/case_auth_no_auto_mode.claude_auth_count" ] && echo present || echo absent)" "absent"

echo "=== case: Codex login status not ChatGPT -> reject ==="
d=$(new_case auth_codex_wrong)
seq_out=$(STUB_CODEX_LOGIN_STATUS_1='Logged in using an API key' run_orchestrator "$d")
assert "codex wrong auth -> exit 10" "$(exit_code_of "$d")" "10"
assert "codex wrong auth -> codex never invoked" "$seq_out" ""

echo "=== case: ANTHROPIC_API_KEY set -> reject, nothing invoked, secret never printed ==="
d=$(new_case auth_anthropic_key)
seq_out=$(ANTHROPIC_API_KEY='sk-test-fake-dummy-not-real' run_orchestrator "$d")
assert "ANTHROPIC_API_KEY set -> exit 10" "$(exit_code_of "$d")" "10"
assert "ANTHROPIC_API_KEY set -> nothing invoked" "$seq_out" ""
assert "ANTHROPIC_API_KEY set -> claude auth status never called" "$([ -f "$WORK/case_auth_anthropic_key.claude_auth_count" ] && echo present || echo absent)" "absent"
assert_not_contains "ANTHROPIC_API_KEY value never appears in orchestrator log" "$(cat "$WORK/case_auth_anthropic_key.stdout.log")" "sk-test-fake-dummy-not-real"

echo "=== case: OPENAI_API_KEY set -> reject, nothing invoked, secret never printed ==="
d=$(new_case auth_openai_key)
seq_out=$(OPENAI_API_KEY='sk-test-fake-dummy-not-real-2' run_orchestrator "$d")
assert "OPENAI_API_KEY set -> exit 10" "$(exit_code_of "$d")" "10"
assert "OPENAI_API_KEY set -> nothing invoked" "$seq_out" ""
assert_not_contains "OPENAI_API_KEY value never appears in orchestrator log" "$(cat "$WORK/case_auth_openai_key.stdout.log")" "sk-test-fake-dummy-not-real-2"

# --- Safe-continuation logic (the core new behavior) ---
echo "=== case: Codex exit 0, valid checkpoint -> Claude runs, exit 0 ==="
d=$(new_case codex_ok)
seq_out=$(STUB_CODEX_MODE=success STUB_CLAUDE_MODE=success run_orchestrator "$d")
assert "codex ok -> exit 0" "$(exit_code_of "$d")" "0"
assert "codex ok -> codex then claude" "$seq_out" "$(printf 'codex\nclaude')"

echo "=== case: Codex nonzero (trivial, unchanged) but safe -> Claude still runs, exit 12 ==="
d=$(new_case codex_fail_safe)
seq_out=$(STUB_CODEX_MODE=fail STUB_CLAUDE_MODE=success run_orchestrator "$d")
assert "codex trivial-fail but safe -> Claude still runs" "$seq_out" "$(printf 'codex\nclaude')"
assert "codex trivial-fail but safe + Claude succeeds -> exit 12 (not 0)" "$(exit_code_of "$d")" "12"

echo "=== case: Codex nonzero after real, safe committed progress (degraded) -> Claude still runs, exit 12 ==="
d=$(new_case codex_degraded)
seq_out=$(STUB_CODEX_MODE=degraded STUB_CLAUDE_MODE=success run_orchestrator "$d")
assert "codex degraded -> Claude still runs" "$seq_out" "$(printf 'codex\nclaude')"
assert "codex degraded + Claude succeeds -> exit 12" "$(exit_code_of "$d")" "12"
assert_contains "codex degraded -> codex's commit is preserved in git log" "$(git -C "$d" log --oneline)" "stub: codex progress"

echo "=== case: Codex nonzero + dirty tree left behind -> Claude does not run, exit 3 ==="
d=$(new_case codex_dirty_fail)
seq_out=$(STUB_CODEX_MODE=dirty-fail run_orchestrator "$d")
assert "codex dirty-fail -> exit 3" "$(exit_code_of "$d")" "3"
assert "codex dirty-fail -> claude never invoked" "$seq_out" "codex"

echo "=== case: Codex exit 0 but leaves dirty tree anyway -> Claude does not run, exit 4 ==="
d=$(new_case codex_dirty_success)
seq_out=$(STUB_CODEX_MODE=dirty-success run_orchestrator "$d")
assert "codex dirty-success -> exit 4" "$(exit_code_of "$d")" "4"
assert "codex dirty-success -> claude never invoked" "$seq_out" "codex"

echo "=== case: Codex nonzero + stale Last Verified Commit left behind -> exit 3 ==="
d=$(new_case codex_stale)
seq_out=$(STUB_CODEX_MODE=stale run_orchestrator "$d")
assert "codex stale -> exit 3" "$(exit_code_of "$d")" "3"
assert "codex stale -> claude never invoked" "$seq_out" "codex"

echo "=== case: Codex succeeds, but pre-Claude auth preflight fails -> exit 11, checkpoint stands ==="
d=$(new_case preclaude_auth_fails)
seq_out=$(STUB_CODEX_MODE=success STUB_CLAUDE_AUTH_JSON_2='{"loggedIn":true,"authMethod":"apiKey","apiProvider":"firstParty","subscriptionType":"pro"}' run_orchestrator "$d")
assert "pre-Claude auth fails -> exit 11" "$(exit_code_of "$d")" "11"
assert "pre-Claude auth fails -> claude -p never invoked" "$seq_out" "codex"
assert_contains "pre-Claude auth fails -> codex's commit is preserved" "$(git -C "$d" log --oneline)" "stub: codex progress"

echo "=== case: Claude itself fails after Codex succeeded cleanly -> exit 5, codex commit stands ==="
d=$(new_case claude_fails_after_codex_ok)
seq_out=$(STUB_CODEX_MODE=success STUB_CLAUDE_MODE=fail run_orchestrator "$d")
assert "claude fails after codex ok -> exit 5" "$(exit_code_of "$d")" "5"
assert "claude fails after codex ok -> both were invoked" "$seq_out" "$(printf 'codex\nclaude')"
assert_contains "claude fails after codex ok -> codex's commit is preserved" "$(git -C "$d" log --oneline)" "stub: codex progress"

echo "=== case: Codex sets HUMAN-REQUIRED mid-run -> Claude must not start (exit 4) ==="
d=$(new_case human_required_midrun)
seq_out=$(STUB_CODEX_MODE=human-required STUB_CLAUDE_MODE=success run_orchestrator "$d")
assert "mid-run HUMAN-REQUIRED -> orchestrator exit 4" "$(exit_code_of "$d")" "4"
assert "mid-run HUMAN-REQUIRED -> claude never invoked" "$seq_out" "codex"

echo "=== case: timestamped logs and exit codes are preserved ==="
d=$(new_case logs)
STUB_CODEX_MODE=success STUB_CLAUDE_MODE=success run_orchestrator "$d" >/dev/null
run_dir=$(find "$d/logs/overnight" -mindepth 1 -maxdepth 1 -type d | head -1)
assert "a timestamped run log dir was created" "$([ -n "$run_dir" ] && echo yes || echo no)" "yes"
if [ -n "$run_dir" ]; then
    assert "codex.exit recorded" "$(cat "$run_dir/codex.exit" 2>/dev/null)" "0"
    assert "claude.exit recorded" "$(cat "$run_dir/claude.exit" 2>/dev/null)" "0"
    assert "orchestrator exit_code recorded" "$(cat "$run_dir/exit_code" 2>/dev/null)" "0"
fi

echo
echo "=== $pass passed, $fail failed ==="
[ "$fail" -eq 0 ]
