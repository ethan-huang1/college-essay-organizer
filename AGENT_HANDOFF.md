# Agent Handoff

This file is the live source of truth for **context, discoveries, blockers,
verification status, and next steps** during an overnight run. It is a
continuously maintained document, not a log to append to or overwrite blindly
— edit each section in place so it always reflects current reality.

- **Git** is the source of truth for code state and rollback points.
- **This file** is the source of truth for what's going on and what's next.

Update the relevant section(s) after any meaningful milestone, discovery,
blocker, verification result, or decision — and always right before a
session ends or control passes to another agent (Codex ↔ Claude). If you hit
something that needs a human decision, add a line starting with exactly
`HUMAN-REQUIRED:` under Blockers instead of guessing (see OVERNIGHT_TASK.md
rule 7) — the automated pipeline halts when it sees that marker. If you
attempt something and it fails, record it under Failed Approaches (rule 9)
rather than silently retrying.

See [OVERNIGHT_TASK.md](OVERNIGHT_TASK.md) for the rules and
[MVP_SPEC.md](MVP_SPEC.md) for the product spec.

## Current Status

The core product loop works end-to-end and is verified: **add a college
(from a top-100 picker or manual entry) → its real, sourced 2026–27 prompts
are retrieved and imported → each prompt is auto-classified into the
taxonomy → matching essays are suggested → a response is assigned → the
Families page shows the cross-school picture.** This session picked up
directly from Codex's verified prompt-CRUD checkpoint (`52add43`) as an
interactive Claude session (the automated pipeline's Claude phase was
blocked on a stale CLI login at the time; that auth has since been
reconfirmed working — see Blockers).

P0 Phase 2 (Core Organization) and Phase 3 (Matching and Reuse) are now
substantially complete. Phase 4 (Editing and Versions) has immutable
versions, save/restore, and filtering, but not yet the deterministic
accept/reject editing-suggestion workflow. Phase 5 (Portability and
Verification) has none of its JSON export/import or Playwright work yet.

## Completed

**Layers 1–3 (handoff protocol, unchanged this session):** repo-based
handoff protocol; `scripts/overnight_handoff.sh` (Codex → Claude,
fail-closed subscription auth preflight, safe-continuation on a degraded
Codex phase, `--permission-mode auto`); `scripts/test_overnight_handoff.sh`
(80 deterministic assertions, zero real CLI calls). See git history
`ae586f2`..`df42c8a` for full detail — not repeated here.

**P0 Phase 1 (Foundation) — Codex, commits `1a34260`..`4ec6c6d`:** recovered
Next.js 16 / React 19 / TypeScript strict / Tailwind 4 scaffold; local
SQLite via Drizzle with 14 core tables and repo-local migrations; seeded
ten-family taxonomy and 21 tags; demo-data system (3 schools, prompts across
all 10 families, 6 essays, versions, reuse examples incl. a dangerous
school-specific one); server-only DB lifecycle boundary; personal/demo
workspace selection via an HTTP-only cookie; base design system, nav, and
the four section pages wired to real workspace-scoped data; `run_tests.sh`
as the canonical verification command.

**P0 Phase 2 (Core Organization) — Codex, commits `122f138`, `52add43`:**
workspace-scoped school CRUD and prompt CRUD (one primary + multiple
secondary families, manual-override provenance, cross-workspace rejection,
cascading deletes).

**This session (Claude, interactive, commits `a06e9d0`, `199f8ba`,
`76855f3`):**
- `a06e9d0` — Essay CRUD (`src/lib/essays.ts`): create/update/delete,
  content changes always land as a new immutable `essayVersions` row
  (never edited in place), non-destructive restore. Deterministic
  keyword-based classifier (`src/lib/classification.ts`) against the
  ten-family taxonomy — no model calls. Deterministic essay↔prompt match
  scorer (`src/lib/matching.ts`) — family overlap, word-count fit, and
  school-specificity risk scored/penalized independently, never category
  equality alone; a why-school prompt is capped below ready-to-reuse unless
  the essay's own school-specific phrases name that exact school.
  `src/lib/reuse.ts` recomputes every essay×prompt match for a workspace
  from scratch, wired into the essay/prompt actions — personal-workspace
  matches are now real (previously only demo's hand-seeded ones existed).
  Essay CRUD UI with status/family/text filtering, version history with
  word-count deltas and restore.
- `199f8ba` — **Add College**: `src/lib/top-universities.ts` (a curated,
  static 100-school list; `canonicalizeUniversityName()` resolves any
  differently-cased typed variant to the list's exact canonical spelling so
  duplicates aren't created and the retrieval lookup still hits).
  `src/lib/prompt-retrieval.ts`: a `PromptRetrievalProvider` interface (same
  deterministic-provider pattern as classification/matching) over a
  **hand-researched, real, cited dataset** — not live scraping (the running
  app has no paid search API and none was added, per
  OVERNIGHT_TASK.md rule 10). Currently covers Stanford and MIT (both
  confirmed "verified-2026-27" against their own official admissions pages,
  fetched today) and Harvard (explicitly "previous-cycle" — its official
  page only confirmed 2025-26 content, so the actual prompt text was
  deliberately **not** imported rather than presenting a stale cycle as
  current). `src/lib/college-import.ts` ties it together: creates/reuses
  the school and a 2026–27 cycle, imports+classifies any found prompts with
  full provenance (new `prompts.verificationStatus`/`sourceUrl`/
  `retrievedAt` columns, migration `0001_pretty_frightful_four`), is
  idempotent, and always returns a clear status including "not yet
  verified" for schools outside the curated set — never guessed. UI: a
  native `<datalist>` search/autocomplete picker (no client JS) with free
  manual entry, and a linked verification badge per prompt.
- `76855f3` — `src/lib/assignments.ts` (`assignEssayToPrompt`/
  `unassignPrompt`, one response per prompt, schema-enforced). Each prompt
  card now shows its assigned response or its top 3 ranked suggested
  essays with one-click "Use this essay". Families page now lists actual
  prompts (school + word limit) under each family — the cross-school "Why
  Major: Stanford, Cornell, ..." view MVP_SPEC.md §4 asks for, not just
  counts.

All three commits verified via the full canonical checkpoint (see
Tests/Verification Performed) plus manual runtime smoke tests against the
built production server through real HTTP requests (not just unit tests).

## In Progress

None. All work below is genuinely unstarted, not partially done.

## Next Steps

Priority order, per MVP_SPEC.md's phases:

1. **Finish Phase 4**: the deterministic editing-suggestion workflow in the
   essay editor (prompt fit / clarity / concision / word-limit reduction),
   individually accept (→ new version) or reject (→ unchanged), never
   silently overwrite. Nothing exists for this yet.
2. **Expand the curated retrieval dataset** (`src/lib/prompt-retrieval.ts`)
   beyond Stanford/MIT/Harvard toward the rest of the top-100 list, each
   entry researched the same way (official source, cited, dated) — this is
   explicitly incremental, safe to do a few schools at a time.
3. **Phase 5**: JSON export/import preserving relationships; at least one
   Playwright workflow (none of the testing stack for this exists yet —
   Playwright isn't installed); README/architecture docs.
4. Smaller polish noticed but not required for P0: the Reuse Map page
   (`/reuse`) still shows a flat global list rather than being organized
   per-school/per-prompt; short (~50-word) imported prompts sometimes get
   no classification at all (expected for a keyword classifier on very
   short text, but worth a UX note e.g. "needs a manual category").

## Failed Approaches

Carried over from Codex's phases (see git history for full detail, not
reproduced here): an offline npm registry lookup (`ENOTCACHED`) and a
stalled registry-backed install were both environment limitations, not
retry-allowance-consuming failures; a Turbopack production build failed on
a sandboxed PostCSS port bind (`EPERM`) — resolved by pinning the canonical
build script to `next build --webpack`; an unquoted `src/app/[section]`
glob was rejected by zsh before Git ran — fixed by quoting, no state
changed; a synthetic demo fixture had two cross-school assignments
pointing at the same school — corrected. This session (Claude) hit no
failed approaches — every change landed on the first attempt and passed
verification.

## Blockers

None currently active. **Resolved this session**: the previous
`HUMAN-REQUIRED` blocker (automated pipeline's `claude auth status --json`
returning `loggedIn: false`) no longer reproduces — `env -u
ANTHROPIC_API_KEY -u OPENAI_API_KEY claude auth status --json` now reports
`loggedIn: true, authMethod: "claude.ai", subscriptionType: "pro"`. This
session proceeded as an interactive Claude session rather than re-running
the non-interactive pipeline, so the pipeline's own preflight was not
re-exercised live; if a future automated run hits the same failure, treat
it as the account's CLI session having been logged out again, not a repeat
of a previously-diagnosed issue.

## Tests/Verification Performed

Each of this session's three commits was verified independently before
committing (not just once at the end):

- `a06e9d0` (essay CRUD/classification/matching/reuse): `./run_tests.sh`
  green (lint, strict typecheck, 24/24 vitest, webpack production build,
  80/80 overnight assertions); manual runtime smoke test against the built
  production server via real HTTP POSTs (correct multipart Server Action
  encoding, confirmed empirically) — essay creation, family assignment,
  prompt creation, and a real deterministic match (score 70) appearing on
  `/reuse`, zero server errors.
- `199f8ba` (Add College): `./run_tests.sh` green (27/27 vitest incl. 3 new
  tests: verified-import + idempotency, unlisted-school fallback,
  previous-cycle refusal-to-guess); runtime smoke test added "stanford
  university" (lowercase) via real HTTP, confirmed canonicalization to
  "Stanford University", all 8 real prompts imported with verification
  badges and partial auto-classification, re-adding produced zero
  duplicates.
- `76855f3` (assignment/suggestions): `./run_tests.sh` green (28/28 vitest
  incl. assign/replace/unassign against the snapshot); runtime smoke test
  confirmed the suggested-matches UI renders correctly with real
  promptId/essayId/score/recommendation against actual imported Stanford
  prompts and a real essay.
- Every server smoke test was run against a freshly migrated, empty
  `data/college-essay-organizer.sqlite` (gitignored, not committed), and
  every spawned `next start` process was confirmed killed afterward
  (verified via `lsof`/`ps` — an earlier round in this session found and
  cleaned up several stray leftover server processes from prior testing).
- Real CLI auth facts reconfirmed read-only this session: `claude auth
  status --json` (see Blockers). No real Claude/Codex pipeline invocation
  and no real model/API calls of any kind were made this session beyond
  normal interactive tool use — the retrieval research used `WebSearch`/
  `WebFetch` only (read-only, cited, see Completed).

## Last Verified Commit

`76855f3` — "Surface suggested essays and essay-to-prompt assignment on
prompt cards". Working tree is clean at this commit; `./run_tests.sh`
(lint, strict typecheck, 28/28 vitest, production build, 80/80 overnight
orchestration assertions) passed immediately before it, plus the manual
runtime smoke tests described above.
