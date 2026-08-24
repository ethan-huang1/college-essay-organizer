#!/usr/bin/env bash
# Deterministic tests for scripts/overnight_handoff.sh.
#
# Runs the real orchestrator script against disposable scratch git repos with
# fake `claude`/`codex` executables (no real API calls, no cost). Each case
# copies a shared valid "template" repo, mutates it to set up one scenario,
# runs the orchestrator, and asserts its exit code / effects. Plain asserts,
# no test framework - run with: bash scripts/test_overnight_handoff.sh
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
    if printf '%s' "$haystack" | grep -qF "$needle"; then
        pass=$((pass + 1))
        printf 'PASS: %s\n' "$desc"
    else
        fail=$((fail + 1))
        printf 'FAIL: %s (expected to find %q)\n' "$desc" "$needle"
    fi
}

# --- stub claude/codex executables ---
STUB_BIN="$WORK/bin"
mkdir -p "$STUB_BIN"

cat >"$STUB_BIN/claude" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
mode="${STUB_CLAUDE_MODE:-success}"
[ -n "${STUB_SEQ_FILE:-}" ] && echo claude >>"$STUB_SEQ_FILE"
if [ "$mode" = "fail" ]; then
    echo '{"is_error":true,"result":"stub claude failure"}'
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
echo '{"is_error":false,"result":"stub claude ok"}'
STUB

cat >"$STUB_BIN/codex" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
# only handle `codex exec ...` like the real orchestrator uses
if [ "${1:-}" != "exec" ]; then
    echo "stub codex: unsupported invocation: $*" >&2
    exit 64
fi
mode="${STUB_CODEX_MODE:-success}"
[ -n "${STUB_SEQ_FILE:-}" ] && echo codex >>"$STUB_SEQ_FILE"
if [ "$mode" = "fail" ]; then
    echo '{"type":"error"}'
    exit 1
fi
echo "codex progress $$" >>stub_progress.txt
git add stub_progress.txt
git commit -q -m "stub: codex progress"
newhash="$(git rev-parse HEAD)"
sed -i '' "s/NEXTSTEPS_PLACEHOLDER/stub codex finished the rest/" AGENT_HANDOFF.md
sed -i '' "s/\`[0-9a-f]\{7,40\}\`/\`$newhash\`/" AGENT_HANDOFF.md
git add AGENT_HANDOFF.md
git commit -q -m "stub: codex update handoff"
echo '{"type":"result","text":"stub codex ok"}'
STUB

chmod +x "$STUB_BIN/claude" "$STUB_BIN/codex"

# --- build a shared valid template repo ---
TEMPLATE="$WORK/template"
mkdir -p "$TEMPLATE"
git -C "$TEMPLATE" init -q
git -C "$TEMPLATE" config user.email "test@example.com"
git -C "$TEMPLATE" config user.name "Overnight Handoff Test"

cat >"$TEMPLATE/OVERNIGHT_TASK.md" <<'EOF'
# Overnight Task
## Objective
Test objective: append a line to stub_progress.txt.
## Rules
1. Test rule.
## Definition of Done
- [ ] stub_progress.txt updated and committed.
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

# Only fill placeholders no stub touches. COMPLETED_PLACEHOLDER,
# NEXTSTEPS_PLACEHOLDER, and BLOCKERS_PLACEHOLDER stay literal here on
# purpose - the claude/codex stubs (and some test cases below) replace those
# themselves, mirroring how a real agent fills in real progress. Consuming
# them here too would make the stubs' own sed replacements silent no-ops.
sed -i '' "s/STATUS_PLACEHOLDER/idle/; s/INPROGRESS_PLACEHOLDER/none/; s/TESTS_PLACEHOLDER/none/" "$TEMPLATE/AGENT_HANDOFF.md"
git -C "$TEMPLATE" add -A
git -C "$TEMPLATE" commit -q -m "template: initial state"
base_hash="$(git -C "$TEMPLATE" rev-parse HEAD)"
sed -i '' "s/\`PLACEHOLDER\`/\`$base_hash\`/" "$TEMPLATE/AGENT_HANDOFF.md"
git -C "$TEMPLATE" add AGENT_HANDOFF.md
git -C "$TEMPLATE" commit -q -m "template: record initial verified commit"

new_case() {
    local name="$1"
    local dir="$WORK/case_$name"
    cp -R "$TEMPLATE" "$dir"
    echo "$dir"
}

# All harness bookkeeping (exit code, stdout, sequence log) lives in $WORK,
# never inside the case's own git repo - the repo must end each run exactly
# as the orchestrator left it, for the "clean tree at end" assertions.
exit_code_of() { cat "$WORK/$(basename "$1").exit_code" 2>/dev/null; }

run_orchestrator() {
    local dir="$1"
    local name
    name="$(basename "$dir")"
    local seqfile="$WORK/$name.seq.log"
    : >"$seqfile"
    (
        cd "$dir" &&
            PATH="$STUB_BIN:$PATH" \
                STUB_SEQ_FILE="$seqfile" \
                STUB_CLAUDE_MODE="${STUB_CLAUDE_MODE:-success}" \
                STUB_CODEX_MODE="${STUB_CODEX_MODE:-success}" \
                bash scripts/overnight_handoff.sh
    ) >"$WORK/$name.stdout.log" 2>&1
    echo $? >"$WORK/$name.exit_code"
    cat "$seqfile"
}

echo "=== case: happy path (both agents succeed) ==="
d=$(new_case happy)
seq_out=$(STUB_CLAUDE_MODE=success STUB_CODEX_MODE=success run_orchestrator "$d")
assert "happy path exits 0" "$(exit_code_of "$d")" "0"
assert "happy path: claude ran before codex" "$seq_out" "$(printf 'claude\ncodex')"
assert "happy path: working tree clean at end" "$(git -C "$d" status --porcelain)" ""
assert_contains "happy path: AGENT_HANDOFF.md shows both parts done" "$(cat "$d/AGENT_HANDOFF.md")" "stub codex finished the rest"

echo "=== case: claude phase fails -> codex must not run ==="
d=$(new_case claude_fail)
seq_out=$(STUB_CLAUDE_MODE=fail STUB_CODEX_MODE=success run_orchestrator "$d")
assert "claude failure -> orchestrator exit 3" "$(exit_code_of "$d")" "3"
assert "claude failure -> codex never invoked" "$seq_out" "claude"

echo "=== case: codex phase fails ==="
d=$(new_case codex_fail)
seq_out=$(STUB_CLAUDE_MODE=success STUB_CODEX_MODE=fail run_orchestrator "$d")
assert "codex failure -> orchestrator exit 5" "$(exit_code_of "$d")" "5"
assert "codex failure -> codex was invoked after claude" "$seq_out" "$(printf 'claude\ncodex')"

echo "=== case: dirty working tree at start -> pre-flight abort ==="
d=$(new_case dirty_tree)
echo "unexpected stray change" >"$d/stray.txt"
seq_out=$(run_orchestrator "$d")
assert "dirty tree -> orchestrator exit 2" "$(exit_code_of "$d")" "2"
assert "dirty tree -> neither agent invoked" "$seq_out" ""
rm -f "$d/stray.txt"

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

echo "=== case: stale handoff (code changed without updating Last Verified Commit) ==="
d=$(new_case stale_handoff)
echo "silent code change" >"$d/untracked_by_handoff.txt"
git -C "$d" add untracked_by_handoff.txt
git -C "$d" commit -q -m "a code change nobody recorded in AGENT_HANDOFF.md"
seq_out=$(run_orchestrator "$d")
assert "stale handoff -> orchestrator exit 2" "$(exit_code_of "$d")" "2"
assert "stale handoff -> neither agent invoked" "$seq_out" ""

echo "=== case: doc-only commit after verified commit is NOT stale (real-world pattern) ==="
d=$(new_case docs_only_ok)
printf '\n<!-- trivial doc touch-up, no code change -->\n' >>"$d/AGENT_HANDOFF.md"
git -C "$d" add AGENT_HANDOFF.md
git -C "$d" commit -q -m "docs-only touch-up (Last Verified Commit still points at prior code commit)"
seq_out=$(STUB_CLAUDE_MODE=success STUB_CODEX_MODE=success run_orchestrator "$d")
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

echo "=== case: claude raises HUMAN-REQUIRED mid-run -> codex must not start ==="
d=$(new_case human_required_midrun)
seq_out=$(STUB_CLAUDE_MODE=human-required STUB_CODEX_MODE=success run_orchestrator "$d")
assert "mid-run HUMAN-REQUIRED -> orchestrator exit 4" "$(exit_code_of "$d")" "4"
assert "mid-run HUMAN-REQUIRED -> codex never invoked" "$seq_out" "claude"

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

echo "=== case: lock already held -> refuses to start ==="
d=$(new_case lock_held)
mkdir "$d/.overnight_handoff.lock"
seq_out=$(run_orchestrator "$d")
assert "lock held -> orchestrator exit 9" "$(exit_code_of "$d")" "9"
assert "lock held -> neither agent invoked" "$seq_out" ""
rmdir "$d/.overnight_handoff.lock" 2>/dev/null || true

echo "=== case: timestamped logs and exit codes are preserved ==="
d=$(new_case logs)
STUB_CLAUDE_MODE=success STUB_CODEX_MODE=success run_orchestrator "$d" >/dev/null
run_dir=$(find "$d/logs/overnight" -mindepth 1 -maxdepth 1 -type d | head -1)
assert "a timestamped run log dir was created" "$([ -n "$run_dir" ] && echo yes || echo no)" "yes"
if [ -n "$run_dir" ]; then
    assert "claude.exit recorded" "$(cat "$run_dir/claude.exit" 2>/dev/null)" "0"
    assert "codex.exit recorded" "$(cat "$run_dir/codex.exit" 2>/dev/null)" "0"
    assert "orchestrator exit_code recorded" "$(cat "$run_dir/exit_code" 2>/dev/null)" "0"
fi

echo
echo "=== $pass passed, $fail failed ==="
[ "$fail" -eq 0 ]
