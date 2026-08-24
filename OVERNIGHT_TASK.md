# Overnight Task

This file holds the fixed objective and non-negotiable rules for an overnight
autonomous coding run. It should change rarely — only when the human sets a
new objective for the next run. Agents (Claude, Codex, or otherwise) read
this once at the start of a session and follow it for the whole run.

## Objective

<!-- TEMPORARY — Layer 2 handoff test. Delete this section and the file it
     creates once the Claude → Codex handoff test is confirmed working. -->

Build `scripts/handoff_check.py`, a tiny throwaway module with two pure
functions, each implemented and verified **one at a time** as its own
commit. This does not touch the real College Essay Organizer app — it exists
only to generate enough real state (code + a passing check + git history) to
prove an agent can pick up mid-task from `AGENT_HANDOFF.md` alone.

1. Implement `add(a, b)`. Verify it with an assert-based self-check in the
   file's `if __name__ == "__main__":` block (see repo README-less convention:
   no test framework, just asserts — this repo has no dependencies yet).
   Run the self-check, confirm it passes, then commit.
2. Implement `subtract(a, b)`. Extend the self-check to cover it, run it,
   confirm it passes, then commit.

Definition of Done for this objective: both functions implemented and
covered by the self-check, the self-check passes end-to-end, and each step
landed as its own verified commit. Once a human confirms the handoff test
worked, delete `scripts/handoff_check.py` and this Objective section — none
of it is part of the real product.

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
   this file for this specific run.

## Definition of Done

- [ ] The objective above is fully implemented.
- [ ] All tests pass, and no unrelated tests were weakened or removed.
- [ ] No unrelated code was changed or reverted.
- [ ] [AGENT_HANDOFF.md](AGENT_HANDOFF.md) is up to date and reflects the
      final state.
- [ ] A final verified commit exists and its hash is recorded in
      AGENT_HANDOFF.md under "Last Verified Commit".
