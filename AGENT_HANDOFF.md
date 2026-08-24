# Agent Handoff

Live source of truth for **current state, decisions, blockers, and next
steps**. Git holds history and rollback points — don't repeat commit-by-
commit detail here; `git log --oneline` and the commit bodies already have
it. Keep this file to roughly current-state-and-what's-next, not a diary.

Update in place after each meaningful milestone, and always before stopping
or handing off. `HUMAN-REQUIRED:` under Blockers halts the automated
pipeline (OVERNIGHT_TASK.md rule 7). Record failed approaches under Failed
Approaches (rule 9) instead of silently retrying.

See [OVERNIGHT_TASK.md](OVERNIGHT_TASK.md) for rules, [MVP_SPEC.md](MVP_SPEC.md)
for the product spec.

## Current Status

The core loop works end-to-end and is real, not scaffolded: **add a college
(top-100 picker or manual) → its real 2026–27 prompts import from an
official, cited source → each prompt is auto-classified → matching essays
are suggested → a response is assigned → the Families page shows the
cross-school picture.** P0 Phases 1–3 are substantially done; Phase 4 has
versions/restore/filtering but not the accept/reject editing-suggestion
workflow; Phase 5 (JSON export/import, Playwright) hasn't started.

This session (continuing from Codex's `52add43`) rebuilt prompt retrieval
from a flat 3-school curated object into a proper adapter pipeline: typed
per-school data files, shared validation/normalization, externalRef-keyed
deduplication, and real change detection with a history log. 8 schools are
now covered (see Coverage below), each researched today against its own
official source.

## Coverage (prompt retrieval)

`src/lib/retrieval/sources/`, registered in `registry.ts`:

- **officially-verified** (imported): Stanford, MIT, Princeton, Yale,
  Georgetown (core 3 essays only — see below), UC Berkeley, UC Berkeley's
  UCLA counterpart (shared canonical 8 Personal Insight Questions).
- **needs-review** (imported, flagged): Georgetown's 7 school-specific
  essay variants — only retrievable as summaries, not exact quotes, so each
  is conditional + needs-review rather than presented as verbatim.
- **previous-cycle** (refused, zero prompts imported): Harvard — official
  page only confirmed 2025-26 content; will re-check once Harvard publishes
  its 2026-27 supplement.
- **Not yet researched**: the other ~92 schools on the top-100 list. Adding
  one is: research via WebFetch against the official source, write a
  `SchoolSourceRecord` in a new `sources/<school>.ts` file (see any existing
  one for the shape), register it, done — the pipeline (validation, import,
  dedup, classification, change detection) needs no changes per school.

## Key decisions this session

- **Common App's "Writing Requirements by College" resource cannot be used
  as a bulk source.** Investigated directly: it lives behind Common App's
  authenticated Dashboard/Solutions Center (student or counselor login),
  and Common App's own public college pages explicitly redirect to each
  school's official site for prompt text rather than hosting it themselves.
  Automating that login was explicitly out of scope. The compliant
  architecture is therefore: **one adapter type (official college source),
  not a separate Common App adapter** — `applicationPlatform` is stored as
  metadata on each prompt, not a different code path.
- **Retrieval is a curated dataset, not live scraping.** The running app
  has no paid search/AI API (OVERNIGHT_TASK.md rule 10) and none was added.
  "Automatic retrieval" means: a human/agent researches a school once via
  WebFetch against its official site, writes a structured, cited record,
  and the app imports from that instantly at click-time. Refreshable later
  behind the same `PromptRetrievalProvider`-shaped interface if a real
  search integration is ever authorized.
- **Verification status can be per-prompt, not just per-school.**
  Georgetown proved this necessary: 3 essays verbatim-confirmed, 7 variants
  only summarized. `RawPromptRecord.verificationStatus` overrides the
  school record's default when present.
- **externalRef, not title/text, is the dedup key.** A school's prompt can
  be reworded by the college without becoming "a new prompt" — matching on
  a stable per-school slug (assigned by whoever writes the data file) is
  what makes change detection possible instead of just duplicate-avoidance.
- **UC campuses share one canonical prompt set** (the 8 PIQs are identical
  university-wide) rather than being re-researched per campus — one shared
  array, two `SchoolSourceRecord`s.

## Failed Approaches

- A drizzle-kit-generated migration (`0002_curved_yellow_claw.sql`) had a
  real bug: its `INSERT INTO __new_prompts ... SELECT ... FROM prompts`
  listed 5 brand-new columns in the SELECT-FROM-old-table clause, but the
  pre-migration table didn't have them (`no such column: min_char_count`).
  This is a drizzle-kit table-rebuild-strategy defect, not a mistake in the
  schema definition. Fixed by hand: removed the new columns from both the
  target and source column lists so they take their declared defaults for
  pre-existing rows. Verified against both `:memory:` (vitest) and a real
  file-backed DB (`npm run db:migrate`) after the fix. **If a future schema
  migration needs a SQLite full-table-rebuild (new CHECK constraints,
  etc.), read the generated SQL before trusting it — don't assume
  drizzle-kit's INSERT/SELECT column lists are correct.**
- No other failed approaches this session — Yale/Princeton/Georgetown/UC
  research and every code change landed and verified on the first attempt.

## Blockers

None active. (Last session's Claude-CLI-auth blocker was resolved and
confirmed working; not re-blocked this session — this was an interactive
session, not the automated pipeline.)

## Tests/Verification Performed

Every commit this session was verified independently before committing:
lint, strict typecheck, full vitest suite, production build (`next build
--webpack`), and the 80-assertion overnight-orchestration suite — all green
at `898399e`. Plus real runtime smoke tests against the built production
server (not just unit tests): imported Princeton/Yale/Georgetown via actual
HTTP POSTs (reverse-engineered Next.js's Server Action multipart encoding
for this, since a naive curl POST silently no-ops), confirmed conditional
notes and character limits render, confirmed DB verification-status counts
match expectations per school, and manually rewrote an already-imported
prompt's text in the database to prove change detection fires end-to-end
(flagged needs-review, prior text preserved in `promptChangeLog`, no
duplicate row). Every spawned dev/prod server was confirmed killed after
each test round (`lsof`/`ps`).

## Next Steps

1. Expand retrieval coverage toward top-25/top-100, a few schools at a
   time, same method: WebFetch the official source, write a
   `SchoolSourceRecord`, register it. Good next candidates: Columbia, UPenn,
   Duke, Cornell, Brown, Chicago, Dartmouth, UC Los Angeles's PIQ file is
   already done — verify the remaining UC campuses if added, same shared set.
2. Essay editor's deterministic accept/reject suggestion workflow (Phase 4)
   — explicitly deferred this session, not started.
3. Phase 5: JSON export/import preserving relationships; at least one
   Playwright workflow (not installed yet); README/architecture docs.
4. Minor: `/reuse` is still a flat global list, not organized per-school;
   short (~50-word) prompts sometimes get no deterministic classification
   at all (expected for a keyword classifier on very short text).

## Last Verified Commit

`898399e` — "Build a real prompt-retrieval pipeline: adapters, versioning,
dedup, change detection". Working tree clean; full canonical verification
(above) passed immediately before it.
