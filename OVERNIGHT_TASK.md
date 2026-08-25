# Overnight Task

This file holds the fixed objective and non-negotiable rules for an overnight
autonomous coding run. It should change rarely — only when the human sets a
new objective for the next run. Agents (Claude, Codex, or otherwise) read
this once at the start of a session and follow it for the whole run.

## Objective

Build the College Essay Organizer MVP. The full product spec — mission,
prompt-family taxonomy, data model, UX, matching/suggestion architecture,
demo workspace, tech/visual direction, phased priorities, and the P0
Definition of Done — lives in [MVP_SPEC.md](MVP_SPEC.md). Read it completely
before starting or resuming work; this file only holds the rules for *how*
to work, not *what* to build.

The automated run uses **Claude as primary, a tightly bounded Codex reserve,
and one bounded Claude retry when work remains** (see [CLAUDE.md](CLAUDE.md)).
Claude should keep working normally until the objective is complete or a
real terminal condition occurs; elapsed time alone is not a handoff reason.
The sequence is finite and resumable, and is not expected to reach the full
P0 Definition of Done in every run. Make as much verified progress as the
bounded phases allow, checkpoint, and leave
[AGENT_HANDOFF.md](AGENT_HANDOFF.md) accurate for the next agent.

(This replaces a staged-but-never-run Layer 3 pipeline smoke-test objective
— `scripts/layer3_smoke.py`, multiply/divide — which never got a real run
and never produced a `scripts/layer3_smoke.py` file; there is nothing to
clean up for it. The earlier Layer 2 handoff-test objective —
`scripts/handoff_check.py` with `add`/`subtract` — did run for real, passed,
and was cleaned up by human authorization; its commits remain in git
history for reference.)

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
   nothing to run. MVP_SPEC.md's Phase 1 (Foundation) includes creating one.
9. **Bounded effort.** For each discrete work item, attempt no more than
   two substantially different approaches. Never repeat an unchanged
   failing command or strategy without a specific new hypothesis. A small,
   evidence-backed correction (a typo fix, a change directly justified by
   new test output) does not itself count as a new approach. Use soft time
   budgets as guidance, not hard timers (roughly 30 min for an ordinary
   item, up to ~60 min for a foundational one; stop and reassess after
   ~30 min with no verified progress). After two failed approaches, record
   them under a **Failed Approaches** section in AGENT_HANDOFF.md, mark the
   item `BLOCKED`, and move to the next independent item — do not build
   dependent work on top of a broken foundation. Never revert unrelated or
   previously-verified work while doing this.
10. **No external spend or external state changes.** Beyond rule 6: do not
    create external accounts, do not modify Vercel/Neon/GitHub/or other
    cloud resources, do not use a paid API or any API key, and never
    reveal, print, or copy a secret or credential value. This app is
    designed (see MVP_SPEC.md §5) to need none of that — if something seems
    to require it, that's a sign to stop and record a `HUMAN-REQUIRED:`
    blocker (rule 7), not to work around it.
11. **Usage limits and degraded runs are not implementation failures.** A
    usage-limit, context-limit, permission-denial, or authentication-
    preflight stop does not consume the retry allowance in rule 9. The
    automated pipeline (`scripts/overnight_handoff.sh`) may report a
    "degraded but recovered" run (exit code 12) when one phase ended
    nonzero but still left a safe, verified checkpoint that the next phase
    successfully continued from — that is a successful handoff, not a bug
    to chase.
12. **A changed spec invalidates stale verification.** If MVP_SPEC.md
    changes materially (a human edits it) partway through, update
    AGENT_HANDOFF.md to reflect the new requirement and re-verify any
    already-written code the change affects — never let code silently keep
    representing a superseded spec as satisfied.
13. **Persist a complete handoff before stopping.** Keep the
    `## Overnight Run State` section of AGENT_HANDOFF.md current. Record the
    objective, completed work, current task, exact next task, important
    decisions, files changed, tests/build status, latest verified commit,
    stop reason, and `Disposition: complete` or `Disposition: continue`.
    The orchestrator also writes a per-phase snapshot, but that automatic
    snapshot supplements rather than replaces the committed handoff.

## Definition of Done

- [ ] MVP_SPEC.md's P0 Definition of Done is reached, OR the gap between
      current state and P0 is accurately recorded in AGENT_HANDOFF.md
      (tonight's run is not expected to finish P0 in one Codex+Claude
      round — see the Objective above).
- [ ] All tests pass, and no unrelated tests were weakened or removed.
- [ ] No unrelated code was changed or reverted.
- [ ] [AGENT_HANDOFF.md](AGENT_HANDOFF.md) is up to date and reflects the
      final state, including Failed Approaches if any.
- [ ] A final verified commit exists and its hash is recorded in
      AGENT_HANDOFF.md under "Last Verified Commit".
