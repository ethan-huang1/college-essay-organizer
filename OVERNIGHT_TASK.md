# Overnight Task

This file holds the fixed objective and non-negotiable rules for an overnight
autonomous coding run. It should change rarely — only when the human sets a
new objective for the next run. Agents (Claude, Codex, or otherwise) read
this once at the start of a session and follow it for the whole run.

## Objective

Implement the reuse-scoring redesign specified in
[docs/reuse-scoring.md](docs/reuse-scoring.md). Read that document completely
before starting or resuming; it is the single source of truth for the formula,
the four bands, the band ceilings, the `Other` weight vector, the evaluation
requirements, and the acceptance criteria. [MVP_SPEC.md](MVP_SPEC.md) still
holds the wider product spec and its constraints continue to apply — in
particular §5: deterministic, no paid API key, no model call.

The hand-reviewed classification this depends on is already committed as
`src/lib/retrieval/category-review.ts` (255 prompts, guarded by
`category-review.test.ts`). **Do not regenerate or re-derive it** — it came from
a product-owner review that is not reproducible from the repo.

Work the stages in order. Each is an independent, revertible checkpoint, and
none may start before the previous one is green under `./run_tests.sh`:

- **Stage 1 — taxonomy expansion.** Primaries 7 → 10 (`challenge-growth`,
  `reading-list`, `roommate`), two display-name renames, five new secondary
  tags. Slugs are join keys and must not be renamed. Extend
  `taxonomy-migration.ts` to re-import from `category-review.ts` while
  preserving every `source: "manual"` link.
- **Stage 2 — import the review.** Wire `category-review.ts` into
  `classifyPrompt` ahead of the keyword rules, carrying secondaries and
  function. Reviewed prompts are full confidence. Assert 255/255 imported.
- **Stage 3 — the four-factor score and the four bands.** Factors 1, 3 and 4
  only; factor 2 scores its neutral value. Includes the `RecommendedAction`
  rename, the band ceilings, the `Other` vector, and **deleting** every
  superseded scoring path (acceptance criterion 9 is a grep assertion).
- **Stage 4 — evaluation.** Both parts of docs/reuse-scoring.md's evaluation
  section, written to `docs/evaluation/` as committed reports. Part 1 is a
  script; Part 2 requires reading recommendations and judging them. **If Part 1
  shows the `Other` prompts falling below the floor en masse, or shows
  false-positive top-band matches, record it and stop — do not tune weights to
  make the numbers look better.**
- **Stage 5 — semantic similarity (factor 2).** A local ONNX embedding model.
  **This stage adds a dependency and downloads a model, so it is NOT authorized
  for an autonomous run.** Record a `HUMAN-REQUIRED:` blocker and stop rather
  than adding it. Stages 1–4 must leave the no-provider path working, which is
  what makes deferring it safe.

Word-count handling is a trap worth stating twice: the penalty is removed
entirely and replaced by ceilings. Removing the penalty **without** adding the
`fill < 0.25 → new-response` ceiling reintroduces a bug the repo already fixed
(a 15-word note scoring 80 against a 650-word prompt).

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

- [ ] Stages 1–4 of the Objective are complete and verified, OR the gap is
      accurately recorded in AGENT_HANDOFF.md with the exact next step. The run
      is not expected to finish all four stages in one round.
- [ ] Every acceptance criterion in docs/reuse-scoring.md that the completed
      stages cover is an executable assertion, not a claim in prose.
- [ ] No superseded scoring identifier survives in `src/` once Stage 3 is done.
- [ ] Stage 5 was NOT attempted (it needs a human decision on the dependency).
- [ ] All tests pass, and no unrelated tests were weakened or removed.
- [ ] No unrelated code was changed or reverted.
- [ ] [AGENT_HANDOFF.md](AGENT_HANDOFF.md) is up to date and reflects the
      final state, including Failed Approaches if any.
- [ ] A final verified commit exists and its hash is recorded in
      AGENT_HANDOFF.md under "Last Verified Commit".
