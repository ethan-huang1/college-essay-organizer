#!/usr/bin/env bash
# Free deterministic tests for overnight_handoff.sh. Real Claude/Codex are
# replaced by stubs and every run happens in a disposable scratch repository.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORCH="$REPO_ROOT/scripts/overnight_handoff.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
pass=0
fail=0

assert() {
    local desc="$1" got="$2" want="$3"
    if [ "$got" = "$want" ]; then pass=$((pass + 1)); printf 'PASS: %s\n' "$desc"
    else fail=$((fail + 1)); printf 'FAIL: %s (want %q, got %q)\n' "$desc" "$want" "$got"; fi
}
assert_contains() {
    local desc="$1" text="$2" needle="$3"
    if printf '%s' "$text" | grep -qF -- "$needle"; then pass=$((pass + 1)); printf 'PASS: %s\n' "$desc"
    else fail=$((fail + 1)); printf 'FAIL: %s (missing %q)\n' "$desc" "$needle"; fi
}
assert_not_contains() {
    local desc="$1" text="$2" needle="$3"
    if ! printf '%s' "$text" | grep -qF -- "$needle"; then pass=$((pass + 1)); printf 'PASS: %s\n' "$desc"
    else fail=$((fail + 1)); printf 'FAIL: %s (unexpected %q)\n' "$desc" "$needle"; fi
}
assert_file() {
    local desc="$1" path="$2"
    if [ -s "$path" ]; then pass=$((pass + 1)); printf 'PASS: %s\n' "$desc"
    else fail=$((fail + 1)); printf 'FAIL: %s (missing/empty %s)\n' "$desc" "$path"; fi
}

STUB_BIN="$WORK/bin"
mkdir -p "$STUB_BIN"

cat >"$STUB_BIN/claude" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "--help" ]; then
    if [ "${STUB_CLAUDE_HELP_HAS_AUTO:-1}" = 1 ]; then echo 'choices: "auto", "manual"'; else echo 'choices: "manual"'; fi
    exit 0
fi
if [ "${1:-}" = auth ] && [ "${2:-}" = status ]; then
    count=0; [ -f "$STUB_CLAUDE_AUTH_COUNT" ] && count="$(cat "$STUB_CLAUDE_AUTH_COUNT")"
    count=$((count + 1)); echo "$count" >"$STUB_CLAUDE_AUTH_COUNT"
    eval "value=\${STUB_CLAUDE_AUTH_$count:-\${STUB_CLAUDE_AUTH_1}}"
    printf '%s' "$value"; exit 0
fi
count=0; [ -f "$STUB_CLAUDE_CALL_COUNT" ] && count="$(cat "$STUB_CLAUDE_CALL_COUNT")"
count=$((count + 1)); echo "$count" >"$STUB_CLAUDE_CALL_COUNT"
eval "mode=\${STUB_CLAUDE_MODE_$count:-complete}"
printf '%s\n' "$@" >"$STUB_ARGV.claude.$count"
echo claude >>"$STUB_SEQUENCE"
if read -r -t 1 _line; then echo HAD_DATA >"$STUB_STDIN.claude.$count"; else echo EOF >"$STUB_STDIN.claude.$count"; fi
case "$mode" in
usage) echo '{"is_error":true,"api_error_status":429,"result":"You have hit your session limit; resets 1:40am"}'; exit 1 ;;
fail) echo '{"is_error":true,"result":"unexpected crash"}'; exit 7 ;;
normal) echo '{"is_error":false}'; exit 0 ;;
dirty) echo stray >claude-stray.txt; exit 1 ;;
stall) sleep 10; exit 0 ;;
esac
echo "claude-$count" >>stub_progress.txt
git add stub_progress.txt && git commit -q -m "stub: claude progress $count"
hash="$(git rev-parse HEAD)"
sed -i '' "s/- Disposition: .*/- Disposition: $mode/" AGENT_HANDOFF.md
sed -i '' "s/- Last agent: .*/- Last agent: claude/" AGENT_HANDOFF.md
sed -i '' "s/- Stop reason: .*/- Stop reason: stub $mode/" AGENT_HANDOFF.md
sed -i '' "s/\`[0-9a-f]\{7,40\}\`/\`$hash\`/" AGENT_HANDOFF.md
if [ "$mode" = human ]; then sed -i '' 's/BLOCKER_PLACEHOLDER/HUMAN-REQUIRED: stub needs a human/' AGENT_HANDOFF.md; fi
git add AGENT_HANDOFF.md && git commit -q -m "stub: claude handoff $count"
echo '{"is_error":false}'
STUB

cat >"$STUB_BIN/codex" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = exec ] && [ "${2:-}" = --help ]; then
    if [ "${STUB_CODEX_HELP_HAS_APPROVE:-1}" = 1 ]; then echo 'Options: --approve-for-me --sandbox'; else echo 'Options: --sandbox'; fi
    exit 0
fi
if [ "${1:-}" = login ] && [ "${2:-}" = status ]; then
    printf '%s\n' "${STUB_CODEX_LOGIN:-Logged in using ChatGPT}"; exit 0
fi
count=0; [ -f "$STUB_CODEX_CALL_COUNT" ] && count="$(cat "$STUB_CODEX_CALL_COUNT")"
count=$((count + 1)); echo "$count" >"$STUB_CODEX_CALL_COUNT"
eval "mode=\${STUB_CODEX_MODE_$count:-complete}"
printf '%s\n' "$@" >"$STUB_ARGV.codex.$count"
echo codex >>"$STUB_SEQUENCE"
if read -r -t 1 _line; then echo HAD_DATA >"$STUB_STDIN.codex.$count"; else echo EOF >"$STUB_STDIN.codex.$count"; fi
case "$mode" in
usage) echo '{"type":"error","message":"usage limit reached"}'; exit 1 ;;
fail) echo '{"type":"error","message":"crash"}'; exit 7 ;;
normal) echo '{"type":"result"}'; exit 0 ;;
dirty) echo stray >codex-stray.txt; exit 1 ;;
stall) sleep 10; exit 0 ;;
esac
echo "codex-$count" >>stub_progress.txt
git add stub_progress.txt && git commit -q -m "stub: codex progress $count"
hash="$(git rev-parse HEAD)"
sed -i '' "s/- Disposition: .*/- Disposition: $mode/" AGENT_HANDOFF.md
sed -i '' "s/- Last agent: .*/- Last agent: codex/" AGENT_HANDOFF.md
sed -i '' "s/- Stop reason: .*/- Stop reason: stub $mode/" AGENT_HANDOFF.md
sed -i '' "s/\`[0-9a-f]\{7,40\}\`/\`$hash\`/" AGENT_HANDOFF.md
if [ "$mode" = human ]; then sed -i '' 's/BLOCKER_PLACEHOLDER/HUMAN-REQUIRED: stub needs a human/' AGENT_HANDOFF.md; fi
git add AGENT_HANDOFF.md && git commit -q -m "stub: codex handoff $count"
echo '{"type":"result"}'
STUB
chmod +x "$STUB_BIN/claude" "$STUB_BIN/codex"

TEMPLATE="$WORK/template"
mkdir -p "$TEMPLATE/scripts"
git -C "$TEMPLATE" init -q
git -C "$TEMPLATE" config user.email test@example.com
git -C "$TEMPLATE" config user.name 'Overnight Test'
cp "$ORCH" "$TEMPLATE/scripts/overnight_handoff.sh"
chmod +x "$TEMPLATE/scripts/overnight_handoff.sh"
cat >"$TEMPLATE/OVERNIGHT_TASK.md" <<'EOF'
# Overnight Task
## Objective
Finish the deterministic test objective.
EOF
cat >"$TEMPLATE/MVP_SPEC.md" <<'EOF'
# Test spec
Complete means the stub marks the handoff complete.
EOF
cat >"$TEMPLATE/CLAUDE.md" <<'EOF'
# Instructions
Stay inside this fixture.
EOF
cat >"$TEMPLATE/AGENT_HANDOFF.md" <<'EOF'
# Agent Handoff
## Current Status
Objective is unfinished.
## Completed Work
Initial fixture.
## Important Decisions
Use stub agents.
## Overnight Run State
- Disposition: continue
- Current objective: finish fixture
- Current task: next stub phase
- Next recommended task: complete fixture
- Last agent: none
- Stop reason: initial state
- Files changed: none
- Test/build status: fixture valid
## Failed Approaches
None.
## Blockers
BLOCKER_PLACEHOLDER
## Tests/Verification Performed
Fixture initialization.
## Last Verified Commit
`PLACEHOLDER`
EOF
cat >"$TEMPLATE/.gitignore" <<'EOF'
logs/
.overnight_handoff.lock/
EOF
git -C "$TEMPLATE" add -A && git -C "$TEMPLATE" commit -q -m initial
base="$(git -C "$TEMPLATE" rev-parse HEAD)"
sed -i '' "s/\`PLACEHOLDER\`/\`$base\`/" "$TEMPLATE/AGENT_HANDOFF.md"
git -C "$TEMPLATE" add AGENT_HANDOFF.md && git -C "$TEMPLATE" commit -q -m handoff

VALID_AUTH='{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","subscriptionType":"pro"}'
new_case() { local dir="$WORK/case_$1"; cp -R "$TEMPLATE" "$dir"; printf '%s' "$dir"; }
exit_of() { cat "$WORK/$(basename "$1").exit" 2>/dev/null; }
seq_of() { cat "$WORK/$(basename "$1").seq" 2>/dev/null; }
latest_run() { find "$1/logs/overnight" -mindepth 1 -maxdepth 1 -type d ! -name state -print | sort | tail -1; }

run_case() {
    local dir="$1" name="$(basename "$1")" seq="$WORK/$(basename "$1").seq"
    : >"$seq"
    (
        cd "$dir" || exit 99
        PATH="$STUB_BIN:$PATH" \
        STUB_SEQUENCE="$seq" STUB_ARGV="$WORK/$name.argv" STUB_STDIN="$WORK/$name.stdin" \
        STUB_CLAUDE_AUTH_COUNT="$WORK/$name.claude-auth-count" \
        STUB_CLAUDE_CALL_COUNT="$WORK/$name.claude-call-count" \
        STUB_CODEX_CALL_COUNT="$WORK/$name.codex-call-count" \
        STUB_CLAUDE_AUTH_1="${STUB_CLAUDE_AUTH_1:-$VALID_AUTH}" \
        STUB_CLAUDE_AUTH_2="${STUB_CLAUDE_AUTH_2:-${STUB_CLAUDE_AUTH_1:-$VALID_AUTH}}" \
        STUB_CLAUDE_MODE_1="${STUB_CLAUDE_MODE_1:-complete}" \
        STUB_CLAUDE_MODE_2="${STUB_CLAUDE_MODE_2:-complete}" \
        STUB_CODEX_MODE_1="${STUB_CODEX_MODE_1:-complete}" \
        STUB_CODEX_LOGIN="${STUB_CODEX_LOGIN:-Logged in using ChatGPT}" \
        STUB_CODEX_HELP_HAS_APPROVE="${STUB_CODEX_HELP_HAS_APPROVE:-1}" \
        CODEX_RESERVE_CYCLES="${CODEX_RESERVE_CYCLES:-1}" \
        CLAUDE_RETRY_CYCLES="${CLAUDE_RETRY_CYCLES:-1}" \
        CLAUDE_RETRY_BACKOFF_SECONDS=0 WATCH_INTERVAL_SECONDS=1 \
        PHASE_STALL_SECONDS="${PHASE_STALL_SECONDS:-4}" PHASE_MAX_SECONDS="${PHASE_MAX_SECONDS:-12}" \
        MAX_NO_PROGRESS_PHASES="${MAX_NO_PROGRESS_PHASES:-2}" \
        ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
        bash scripts/overnight_handoff.sh
    ) >"$WORK/$name.stdout" 2>&1
    echo $? >"$WORK/$name.exit"
}

echo '=== primary Claude completes: no reserve usage ==='
d="$(new_case primary_complete)"; run_case "$d"
assert 'complete exits 0' "$(exit_of "$d")" 0
assert 'only Claude ran' "$(seq_of "$d")" claude
assert 'tree clean' "$(git -C "$d" status --porcelain)" ''
assert_contains 'handoff records completion' "$(cat "$d/AGENT_HANDOFF.md")" '- Disposition: complete'
assert 'durable state complete' "$(awk -F= '$1=="COMPLETE"{print $2}' "$d/logs/overnight/resume.state")" 1
assert 'Claude stdin EOF' "$(cat "$WORK/case_primary_complete.stdin.claude.1")" EOF
claude_argv="$(cat "$WORK/case_primary_complete.argv.claude.1")"
assert_contains 'Claude permission auto' "$claude_argv" '--permission-mode'
assert_not_contains 'Claude has no dollar budget switch' "$claude_argv" '--max-budget-usd'
assert_not_contains 'Claude never bypasses permissions' "$claude_argv" 'bypassPermissions'
assert_contains 'Claude prompt requires full handoff' "$claude_argv" 'Current task'

echo '=== normal continuation: Claude -> Codex -> Claude retry ==='
d="$(new_case full_flow)"; STUB_CLAUDE_MODE_1=continue STUB_CODEX_MODE_1=continue STUB_CLAUDE_MODE_2=complete run_case "$d"
assert 'full flow exits 0' "$(exit_of "$d")" 0
assert 'preferred sequence' "$(seq_of "$d")" "$(printf 'claude\ncodex\nclaude')"
assert 'one Codex reserve cycle used' "$(awk -F= '$1=="CODEX_USED"{print $2}' "$d/logs/overnight/resume.state")" 1
assert_contains 'Codex uses workspace-write' "$(cat "$WORK/case_full_flow.argv.codex.1")" 'workspace-write'
assert_contains 'Codex enables reviewed approval escalation' "$(cat "$WORK/case_full_flow.argv.codex.1")" '--approve-for-me'
assert_not_contains 'Codex does not use danger-full-access' "$(cat "$WORK/case_full_flow.argv.codex.1")" 'danger-full-access'
assert 'Codex stdin EOF' "$(cat "$WORK/case_full_flow.stdin.codex.1")" EOF
assert 'three clean checkpoint commits exist' "$(git -C "$d" log --format=%s | grep -c 'stub: .* progress')" 3

echo '=== retry count is configurable but still bounded ==='
d="$(new_case two_retries)"; STUB_CLAUDE_MODE_1=continue STUB_CODEX_MODE_1=continue STUB_CLAUDE_MODE_2=continue STUB_CLAUDE_MODE_3=complete CLAUDE_RETRY_CYCLES=2 run_case "$d"
assert 'second configured retry can complete' "$(exit_of "$d")" 0
assert 'two-retry sequence is still finite' "$(seq_of "$d")" "$(printf 'claude\ncodex\nclaude\nclaude')"
assert 'two retry cycles recorded' "$(awk -F= '$1=="CLAUDE_RETRIES_USED"{print $2}' "$d/logs/overnight/resume.state")" 2

echo '=== primary usage limit falls back safely ==='
d="$(new_case primary_limit)"; STUB_CLAUDE_MODE_1=usage STUB_CODEX_MODE_1=complete run_case "$d"
assert 'usage recovered to completion' "$(exit_of "$d")" 0
assert 'usage sequence Claude then Codex' "$(seq_of "$d")" "$(printf 'claude\ncodex')"
run="$(latest_run "$d")"
assert 'usage classified distinctly' "$(cat "$run/claude-primary.outcome")" usage-limit
assert_file 'usage handoff snapshot exists' "$run/claude-primary-handoff.md"
assert_contains 'summary names usage limit' "$(cat "$run/summary.md")" 'usage-limit'

echo '=== exhausted bounded sequence reports final limit ==='
d="$(new_case limit_exhausted)"; STUB_CLAUDE_MODE_1=usage STUB_CODEX_MODE_1=usage STUB_CLAUDE_MODE_2=usage run_case "$d"
assert 'terminal usage exit' "$(exit_of "$d")" 21
assert 'bounded sequence has exactly three calls' "$(seq_of "$d")" "$(printf 'claude\ncodex\nclaude')"
assert 'state terminal' "$(awk -F= '$1=="NEXT_PHASE"{print $2}' "$d/logs/overnight/resume.state")" terminal
before="$(seq_of "$d")"; run_case "$d"; after="$(seq_of "$d")"
assert 'rerun after terminal remains terminal' "$(exit_of "$d")" 21
assert 'terminal rerun invokes nobody' "$after" ''

echo '=== crash is distinct and can recover ==='
d="$(new_case crash_recovered)"; STUB_CLAUDE_MODE_1=fail STUB_CODEX_MODE_1=complete run_case "$d"
assert 'crash recovered' "$(exit_of "$d")" 0
run="$(latest_run "$d")"; assert 'crash classified' "$(cat "$run/claude-primary.outcome")" crash-error
assert 'crash still hands off safely' "$(seq_of "$d")" "$(printf 'claude\ncodex')"

echo '=== stall and hard timeout are distinct ==='
d="$(new_case stall_recovered)"; STUB_CLAUDE_MODE_1=stall STUB_CODEX_MODE_1=complete PHASE_STALL_SECONDS=1 PHASE_MAX_SECONDS=8 run_case "$d"
assert 'stall recovered' "$(exit_of "$d")" 0
run="$(latest_run "$d")"; assert 'stall classified' "$(cat "$run/claude-primary.outcome")" stall
assert 'stall synthetic exit' "$(cat "$run/claude-primary.exit")" 125
d="$(new_case timeout_recovered)"; STUB_CLAUDE_MODE_1=stall STUB_CODEX_MODE_1=complete PHASE_STALL_SECONDS=8 PHASE_MAX_SECONDS=1 run_case "$d"
assert 'timeout recovered' "$(exit_of "$d")" 0
run="$(latest_run "$d")"; assert 'timeout classified' "$(cat "$run/claude-primary.outcome")" timeout
assert 'timeout synthetic exit' "$(cat "$run/claude-primary.exit")" 124

echo '=== repeated normal exits stop as no-progress ==='
d="$(new_case no_progress)"; STUB_CLAUDE_MODE_1=normal STUB_CODEX_MODE_1=normal MAX_NO_PROGRESS_PHASES=2 run_case "$d"
assert 'no-progress terminal exit' "$(exit_of "$d")" 23
assert 'stops after two no-progress phases' "$(seq_of "$d")" "$(printf 'claude\ncodex')"
assert 'state records no-progress' "$(awk -F= '$1=="LAST_OUTCOME"{print $2}' "$d/logs/overnight/resume.state")" no-progress

echo '=== unsafe and human-required states never hand off ==='
d="$(new_case dirty_agent)"; STUB_CLAUDE_MODE_1=dirty run_case "$d"
assert 'dirty checkpoint exit' "$(exit_of "$d")" 24
assert 'Codex never runs after dirty tree' "$(seq_of "$d")" claude
assert_contains 'dirty file is preserved, not reset' "$(git -C "$d" status --porcelain)" 'claude-stray.txt'
d="$(new_case human_agent)"; STUB_CLAUDE_MODE_1=human run_case "$d"
assert 'human blocker exit' "$(exit_of "$d")" 26
assert 'Codex never runs after human blocker' "$(seq_of "$d")" claude
assert_contains 'human marker persisted' "$(cat "$d/AGENT_HANDOFF.md")" 'HUMAN-REQUIRED:'

echo '=== resumability and stale lock recovery ==='
d="$(new_case resume_codex)"
task_hash="$(shasum -a 256 "$d/OVERNIGHT_TASK.md" | awk '{print $1}')"
mkdir -p "$d/logs/overnight"
cat >"$d/logs/overnight/resume.state" <<EOF
VERSION=2
TASK_HASH=$task_hash
NEXT_PHASE=codex-1
CODEX_USED=0
CLAUDE_RETRIES_USED=0
NO_PROGRESS_COUNT=0
COMPLETE=0
IN_FLIGHT=1
LAST_OUTCOME=interrupted
EOF
run_case "$d"
assert 'resume exits complete' "$(exit_of "$d")" 0
assert 'resume starts at recorded Codex phase' "$(seq_of "$d")" codex
d="$(new_case stale_lock)"; mkdir "$d/.overnight_handoff.lock"; echo 99999999 >"$d/.overnight_handoff.lock/pid"; run_case "$d"
assert 'dead lock recovered' "$(exit_of "$d")" 0
assert 'dead lock run invokes Claude' "$(seq_of "$d")" claude
assert 'lock cleaned after recovered run' "$([ -d "$d/.overnight_handoff.lock" ] && echo present || echo absent)" absent
d="$(new_case ambiguous_lock)"; mkdir "$d/.overnight_handoff.lock"; run_case "$d"
assert 'ambiguous lock fails closed' "$(exit_of "$d")" 9
assert 'ambiguous lock invokes nobody' "$(seq_of "$d")" ''
assert 'ambiguous lock left untouched' "$([ -d "$d/.overnight_handoff.lock" ] && echo present || echo absent)" present
rmdir "$d/.overnight_handoff.lock"
d="$(new_case live_phase_lock)"; mkdir "$d/.overnight_handoff.lock"; echo 99999999 >"$d/.overnight_handoff.lock/pid"; echo $$ >"$d/.overnight_handoff.lock/phase_pid"; run_case "$d"
assert 'dead wrapper with live phase fails closed' "$(exit_of "$d")" 9
assert 'live phase lock invokes nobody' "$(seq_of "$d")" ''
assert 'live phase lock is preserved' "$([ -d "$d/.overnight_handoff.lock" ] && echo present || echo absent)" present
rm -f "$d/.overnight_handoff.lock/pid" "$d/.overnight_handoff.lock/phase_pid"; rmdir "$d/.overnight_handoff.lock"

echo '=== repository preflight safety ==='
d="$(new_case no_objective)"; sed -i '' 's/Finish the deterministic test objective./(No objective set yet.)/' "$d/OVERNIGHT_TASK.md"; git -C "$d" add . && git -C "$d" commit -q -m objective; run_case "$d"
assert 'no objective exits 2' "$(exit_of "$d")" 2; assert 'no objective invokes nobody' "$(seq_of "$d")" ''
d="$(new_case dirty_pre)"; echo stray >"$d/stray.txt"; run_case "$d"
assert 'dirty preflight exits 2' "$(exit_of "$d")" 2; assert 'dirty preflight invokes nobody' "$(seq_of "$d")" ''
d="$(new_case stale_handoff)"; echo code >"$d/code.txt"; git -C "$d" add . && git -C "$d" commit -q -m code; run_case "$d"
assert 'stale handoff exits 2' "$(exit_of "$d")" 2; assert 'stale handoff invokes nobody' "$(seq_of "$d")" ''
d="$(new_case docs_ok)"; echo note >>"$d/AGENT_HANDOFF.md"; git -C "$d" add . && git -C "$d" commit -q -m docs; run_case "$d"
assert 'docs-only commit remains valid' "$(exit_of "$d")" 0
d="$(new_case human_pre)"; sed -i '' 's/BLOCKER_PLACEHOLDER/HUMAN-REQUIRED: existing blocker/' "$d/AGENT_HANDOFF.md"; git -C "$d" add . && git -C "$d" commit -q -m blocker; run_case "$d"
assert 'preexisting human blocker exit' "$(exit_of "$d")" 26; assert 'preexisting blocker invokes nobody' "$(seq_of "$d")" ''

echo '=== subscription auth fails closed and is agent-specific ==='
for fixture in \
    '{"loggedIn":false,"authMethod":"claude.ai","apiProvider":"firstParty","subscriptionType":"pro"}' \
    '{"loggedIn":true,"authMethod":"apiKey","apiProvider":"firstParty","subscriptionType":"pro"}' \
    '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"bedrock","subscriptionType":"pro"}' \
    '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}' \
    '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","subscriptionType":"trial"}' \
    'not-json'; do
    d="$(new_case "auth_$pass")"; STUB_CLAUDE_AUTH_1="$fixture" run_case "$d"
    assert 'invalid Claude auth exits 10' "$(exit_of "$d")" 10
    assert 'invalid Claude auth invokes nobody' "$(seq_of "$d")" ''
done
d="$(new_case no_auto)"; STUB_CLAUDE_HELP_HAS_AUTO=0 run_case "$d"
assert 'missing auto mode exits 10' "$(exit_of "$d")" 10; assert 'missing auto invokes nobody' "$(seq_of "$d")" ''
d="$(new_case codex_auth_unused)"; STUB_CODEX_LOGIN='Logged in using API key' run_case "$d"
assert 'Codex auth does not block completed primary' "$(exit_of "$d")" 0; assert 'Codex was not consulted' "$(seq_of "$d")" claude
d="$(new_case codex_auth_needed)"; STUB_CLAUDE_MODE_1=continue STUB_CODEX_LOGIN='Logged in using API key' run_case "$d"
assert 'fallback auth failure is distinct' "$(exit_of "$d")" 25; assert 'only primary ran before fallback auth failed' "$(seq_of "$d")" claude
d="$(new_case codex_approval_missing)"; STUB_CLAUDE_MODE_1=continue STUB_CODEX_HELP_HAS_APPROVE=0 run_case "$d"
assert 'missing reviewed-approval capability fails closed' "$(exit_of "$d")" 25
assert 'missing reviewed-approval capability consumes no Codex cycle' "$(seq_of "$d")" claude
d="$(new_case anthropic_key)"; ANTHROPIC_API_KEY='secret-test-value' run_case "$d"
assert 'Anthropic key rejected' "$(exit_of "$d")" 10; assert_not_contains 'Anthropic key never logged' "$(cat "$WORK/case_anthropic_key.stdout")" 'secret-test-value'
d="$(new_case openai_key)"; OPENAI_API_KEY='secret-test-value-2' run_case "$d"
assert 'OpenAI key rejected' "$(exit_of "$d")" 10; assert_not_contains 'OpenAI key never logged' "$(cat "$WORK/case_openai_key.stdout")" 'secret-test-value-2'

echo '=== logging artifacts are morning-readable ==='
d="$(new_case logs)"; STUB_CLAUDE_MODE_1=usage STUB_CODEX_MODE_1=complete run_case "$d"; run="$(latest_run "$d")"
assert_file 'orchestrator log' "$run/orchestrator.log"
assert_file 'summary table' "$run/summary.md"
assert_file 'Claude stdout' "$run/claude-primary.stdout.log"
assert_file 'Claude exit' "$run/claude-primary.exit"
assert_file 'Claude outcome' "$run/claude-primary.outcome"
assert_file 'Claude handoff snapshot' "$run/claude-primary-handoff.md"
assert_file 'Codex handoff snapshot' "$run/codex-1-handoff.md"
assert_file 'final exit file' "$run/exit_code"
assert_contains 'snapshot carries objective' "$(cat "$run/claude-primary-handoff.md")" 'Current objective'
assert_contains 'snapshot carries tests and next task through handoff copy' "$(cat "$run/claude-primary-handoff.md")" 'Test/build status'

printf '\n=== %d passed, %d failed ===\n' "$pass" "$fail"
if [ "$fail" -ne 0 ]; then exit 1; fi
