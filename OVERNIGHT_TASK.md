# Overnight Task

This file holds the fixed objective and non-negotiable rules for an overnight
autonomous coding run. It should change rarely — only when the human sets a
new objective for the next run. Agents (Claude, Codex, or otherwise) read
this once at the start of a session and follow it for the whole run.

## Objective

<!-- Fill in before starting an overnight run. -->
(No objective set yet. The Layer 2 handoff-test objective that lived here —
`scripts/handoff_check.py` with `add`/`subtract` — passed and was cleaned up
by human authorization; its commits remain in git history for reference.)

## Rules

1. **Inspect existing code first.** Before changing anything, read the
   relevant files, tests, and recent git history to understand current
   behavior and conventions.
2. **Preserve unrelated changes.** Never revert, overwrite, or clean up code
   outside the scope of the objective, even if it looks like a mistake —
   flag it in [AGENT_HANDOFF.md](AGENT_HANDOFF.md) instead.
3. **Run tests after every meaningful change.** Do not move on to the next
   step on an unverified change.
4. **Never weaken tests to make them pass.** Do not delete, skip, loosen
   assertions in, or otherwise water down a test just to get it green. If a
   test seems wrong, say so in AGENT_HANDOFF.md and leave it for a human to
   decide.
5. **Commit at meaningful checkpoints.** Only commit a state that has been
   verified (tests passing). Each commit should be a coherent, working step.
6. **No irreversible production/deployment actions.** Do not deploy, publish
   packages, force-push, modify shared infrastructure, or take other
   hard-to-reverse actions outside this repo unless explicitly authorized in
   this file for this specific run. Never push to a remote, amend or rebase
   existing history, or touch global/user-level config — commits stay local
   and additive.
7. **Escalate instead of guessing.** If you hit something that needs a human
   decision (ambiguous requirements, a test that looks wrong, a destructive
   or irreversible step, anything the rules above don't clearly cover), do
   not guess. Add a line starting with exactly `HUMAN-REQUIRED:` under
   Blockers in [AGENT_HANDOFF.md](AGENT_HANDOFF.md) describing what you need,
   commit any safe/verified work you already have, and stop. The automated
   handoff pipeline (`scripts/overnight_handoff.sh`) checks for this marker
   and will halt rather than hand the run to the next agent.
8. **Use the repo's test runner if one exists.** If `./run_tests.sh` exists
   at the repo root, it is the canonical way to run this repo's tests — use
   it instead of guessing a test command, and it's what the automated
   pipeline runs to verify each phase. If it doesn't exist yet, there is
   nothing to run.

## Definition of Done

- [ ] The objective above is fully implemented.
- [ ] All tests pass, and no unrelated tests were weakened or removed.
- [ ] No unrelated code was changed or reverted.
- [ ] [AGENT_HANDOFF.md](AGENT_HANDOFF.md) is up to date and reflects the
      final state.
- [ ] A final verified commit exists and its hash is recorded in
      AGENT_HANDOFF.md under "Last Verified Commit".
