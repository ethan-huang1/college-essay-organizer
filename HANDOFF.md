# Session handoff

Sections 1–8 were written at commit `5c0aed9` (clean tree, `origin/main` in
sync). **Section 9 was rewritten after the Essay Editor was built**; those
changes are in the working tree and **not yet committed or deployed** — see the
end of §10. Verified against the repository, `git log` and a live run, not from
conversation memory.

> **Relationship to [AGENT_HANDOFF.md](AGENT_HANDOFF.md).** That file is the
> repo's long-lived handoff, maintained per [CLAUDE.md](CLAUDE.md), and it is
> still the authority on the overnight pipeline, the reuse-scoring work, and the
> wider P0 backlog. This file is narrower: what happened in *this* session and
> what the next one needs. Where they disagree about the UI, this file is newer.
> **AGENT_HANDOFF.md has not been updated for this session's work** — see
> "Loose ends".

---

## 1. What the app is

A private workspace for a student applying to many colleges. The premise is that
supplemental essays overlap heavily, so the product's job is to show **where one
essay can answer several prompts** rather than to be a to-do list.

The loop: add a college → its verified 2026–27 prompts import and self-classify
→ matching suggests which existing essays could answer them → the student
assigns one or writes a new one.

**There is no AI in the product.** Matching is deterministic and explainable.
The only model involved is a local ONNX sentence embedder used for one of four
scoring factors. Do not add an "AI assistant" surface; the interface deliberately
implies none.

### Architecture

Next.js 16.3.2 App Router, React 19 Server Components, Postgres via Drizzle.
Neon in dev and production, PGlite (WASM Postgres) in tests — same dialect, same
committed migrations.

- Every mutation is a Server Action driven by a plain `<form>`.
- **One client component in the whole app**: `src/app/nav-link.tsx`, which marks
  the current nav section. Keep it that way unless a change genuinely needs
  interactivity.
- Progressive disclosure uses `<details>` and URL params, so the app works
  without JavaScript. The account menu uses the native `popover` attribute.
- Nothing is prerendered — every route reads the workspace cookie and the
  database — so the root layout declares `force-dynamic` and the build needs no
  database.
- Deployed on Vercel; **`git push origin main` deploys**. There is no Vercel CLI
  installed.

---

## 2. Product and design decisions already settled

Do not relitigate these without being asked.

### Counting

- **`summarizeWorkload` in `src/lib/workload.ts` is the only place required work
  is counted.** Every count site reads it. Do not count prompt rows anywhere
  else; the sidebar, headers and Overview disagreed with each other when they
  each did their own counting.
- Counts are **essays the schools ask for**, not prompt rows: a choose-4-of-8
  set counts as 4, and a question five campuses share counts once.
- **Conditional and program-specific prompts are excluded from `requiredTotal`**
  until the student says which programs they are applying to. Guessing would
  inflate the count. They are surfaced separately (see availability states).

### Reuse scoring

Four weighted factors, deployed and audited: **primary 25 / semantic 40 /
secondary 20 / function 15**. `Other` uses 0/45/20/20. Four bands, no "ready to
reuse" band — every reused essay needs some tailoring, so the top band is
"slight edits". Full reasoning in [docs/reuse-scoring.md](docs/reuse-scoring.md).

- Word count is a **band ceiling, not a score penalty**.
- Accepting a reuse suggestion must **never** redefine an essay's origin prompt.
- Embeddings must be computed **one text per call** — batching pads to the
  longest text and mean-pools over padding.

### Interface

- Naming: **Overview · Your Prompts · Categories · My Essays · Reuse**. Routes
  did not change (`/`, `/schools`, `/families`, `/essays`, `/reuse`) because
  renaming `/schools` would break every `?school=` link.
- **Cards for things you act on, rows for things you scan.** A card nested in a
  card is a defect.
- Plus Jakarta Sans throughout; **Newsreader only** for prompt text and essay
  prose. Both self-hosted at build.
- Desktop-first: composed for 1440px and up to 2880px. Mobile must stay
  *usable*, not polished — that is a deliberate scope decision.
- `aria-current="page"` is reserved for navigation. Filter chips are removal
  links and carry neither `aria-pressed` nor `aria-current`.
- **Logos are live and published.** All 100 colleges. The trademark position is
  unresolved and stated plainly in
  [docs/school-logos.md](docs/school-logos.md). `SHOW_SCHOOL_LOGOS=0` disables
  every logo with no code change; `DECLINED_SCHOOLS` removes one school.
- No campus photographs are in use. The machinery exists
  ([docs/school-photos.md](docs/school-photos.md)); the registry is empty
  because identifying a campus in an image is a human step.

---

## 3. What changed this session

Seven commits, `f322260` → `5c0aed9`, all pushed and deployed.

| Commit | What |
|---|---|
| `f322260` | Style layer rebuilt on tokens; Plans reader added |
| `76013d4` | Interface rebuilt around cards, rows, the reuse ribbon |
| `eae1834` | Measured performance cost of the redesign |
| `1c57059` | Recorded the score audit result and that axe was not run |
| `aa2ebe8` | Logo fetcher (off by default at that point) |
| `b28ffbb` | Workload bands, availability states, logos shipped |
| `5c0aed9` | Logo assets excluded from the auth middleware |

Substantively:

1. **Full UI redesign.** Left sidebar replaced with top navigation. Its school
   list was navigation duplicating the filter's school select, already hidden
   below 900px. `globals.css` went from 2311 undifferentiated lines to a short
   list of imports over `tokens.css`, `base.css`, `primitives.css` and one
   partial per view.
2. **Overview rebuilt as five workload bands** (Completed / Slight / Moderate /
   Major / Write from scratch), plus per-college band breakdowns.
3. **Availability states** — the "No required essays on file" fix (see §6).
4. **100 college logos**, normalised and published.
5. **Plans reader** at `/plans`, reading `~/.claude/plans`.
6. **`npm run auth:set-password`** — CLI password reset, because no email
   provider is configured so a self-service reset flow cannot deliver a link.

---

## 4. Files, routes, data model

### Routes

| Route | File | Notes |
|---|---|---|
| `/` | `src/app/(app)/page.tsx` | Overview: bands, college cards |
| `/schools` | `src/app/(app)/[section]/page.tsx` | Your Prompts |
| `/families` | same file | Categories |
| `/essays` | same file | My Essays — the per-school progress dashboard (§9) |
| `/reuse` | same file | Reuse |
| `/editor` | `src/app/(app)/editor/page.tsx` | Essay Editor: every document |
| `/editor/[essayId]` | `src/app/(app)/editor/[essayId]/page.tsx` | One document, full page |
| `/photo-credits` | `src/app/(app)/photo-credits/page.tsx` | Image credits |
| `/plans/[[...slug]]` | `src/app/(app)/plans/` | Local plan reader |
| `/sign-in`, `/sign-up` | `src/app/sign-in`, `sign-up` | Share `auth-form.tsx` |

`src/app/(app)/[section]/page.tsx` is **~1000 lines holding four views**. It is
the biggest liability in the codebase. Splitting it is legitimate work but do it
deliberately, not incidentally.

`src/proxy.ts` is the auth gate in front of every route. Its matcher excludes
`_next/static`, `_next/image`, `school-logos`, `favicon.ico`. **Adding a new
public asset directory means updating that matcher** — forgetting it sent 100
image requests per page load through the edge auth function.

### Data model — `src/lib/db/schema.ts`

`users`, `workspaces`, `applicationCycles`, `schools`, `promptFamilies`,
`promptTags`, `prompts`, `promptChangeLog`, `promptFamilyLinks`,
`promptTagLinks`, `essays`, `essayVersions`, `essayFamilyLinks`,
`essayTagLinks`, `essayPromptMatches`, `assignedEssayResponses`.

Relevant to the next feature:

```
essays          id workspaceId title currentContent targetWordCount status
                designation adaptedFromEssayId notes schoolSpecificPhrases
                originPromptId originPromptTitle originPromptText
                lastEditedAt createdAt

essayVersions   id workspaceId essayId versionNumber content wordCount
                reason createdAt
```

**Drizzle `text(..., { enum: [...] })` emits plain `text` with no CHECK
constraint**, so enum vocabularies can grow with no migration.

### Key modules

- `src/lib/workload.ts` — the single counting authority
- `src/lib/matching.ts` — deterministic scorer, `ACTION_LABELS`
- `src/lib/progress.ts` — derived UI numbers, `workState`, `reuseOpportunities`
- `src/lib/essays.ts` — essay CRUD with immutable versions
- `src/lib/schools.ts` — `schoolCatalogueState`, `schoolAvailability`
- `src/app/workload-bands.ts` — band derivation (presentational)
- `src/app/filtering.ts` — filter predicates, extracted so they are testable
- `src/app/school-mark.tsx`, `src/app/mark-palette.ts` — logo/initials mark

---

## 5. Functionality that must be preserved

1. **The 30 form field names** Server Actions read by string. Renaming one in
   markup is invisible to TypeScript and to every other test.
   `src/app/redesign-parity.test.ts` pins them — and its file list now includes
   `essay-ui.tsx` and the two editor files, because that is where the essay
   forms live. **Adding a file that renders one of those fields means adding it
   to that list**, or the assertions pass against markup nobody serves.
2. **Category selects map over `snapshot.families`** — never a hard-coded list.
   `src/app/primary-category-controls.test.ts` greps for exactly this.
3. **Filtering behaviour** — same field names, same submit target, same result
   set. Pinned in `redesign-parity.test.ts`.
4. **Routes unchanged.**
5. **Immutable versions.** Saving an essay appends a new `essayVersions` row and
   repoints `currentContent`. Nothing is edited in place; restore adds a new
   version rather than rewinding.
6. **A prompt keeps at most one current response** (`assignedEssayResponses`).
7. **Previous-cycle warnings stay on the collapsed prompt row**, never behind
   disclosure — the spec requires prominence.
8. **The full prompt edit form is fetched via `?edit=<id>`**, not inlined per
   row. 107 inlined copies made `/schools` a 4 MB document.
9. **Bands must sum to `requiredTotal`.** `workload-bands.test.ts` asserts it as
   a property.
10. **Contrast.** `src/app/contrast.test.ts` parses `tokens.css` and fails if a
    colour is added without being checked.

---

## 6. The "No required essays" investigation (worth not repeating)

The displayed sentence was one string covering five unrelated facts. Tracing it
found the bug was **not** where it looked.

- **Columbia is correct data.** Its source record genuinely has `prompts: []`
  because Columbia publishes its questions only inside the Common App. 36 of the
  100 schools are in that state; 12 more are verified as having no supplement.
  Those two were indistinguishable to a student, which was the reported symptom.
- **The actual defect:** 13 schools have real prompts and no *unconditional*
  required one — Amherst 3 conditional, Georgetown 7 program-specific, Penn 13.
  They were told they had nothing to write. A separate group (Bowdoin, Trinity,
  Colorado College, NYU) publishes only optional prompts.

`schoolAvailability()` in `src/lib/schools.ts` now resolves seven states, with
real work always outranking a catalogue caveat, so "No supplemental essay
required" appears **only** where that was actually verified. 16 tests in
`src/lib/school-availability.test.ts` cover Columbia by name and one school per
state drawn from the live catalogue.

---

## 7. Known bugs, limitations, open questions

### Limitations accepted on purpose

- **Mobile is usable, not polished.** No horizontal scroll at 390px on any view;
  beyond that it is unrefined by decision.
- **12 logos are faint engraved seals** that read as a smudge at 44px (Scripps
  1.6% ink, UCSB, Vanderbilt, NYU, Case Western, Carleton, Williams, Pitzer,
  GWU, Claremont McKenna, Vassar, Haverford). **Five UC campuses** carry
  near-identical UC-styled seals. Washington kept a seal because its own icons
  are all under the 64px floor. Colorado Boulder is 64px, the lowest in the set.
- **46 of 100 logos are secondary-sourced** (Wikidata/Wikipedia), mostly
  non-free fair-use uploads. Recorded, not resolved.

### Real open items

- **axe was never run.** Not a dependency. The specific rules were checked by
  hand against the live DOM, which is not the same thing.
- **Production score audit reports 1130/1156 (97.8%)**, not 1156/1156. All 26
  differences are ±1 point with no band change. The redesign provably cannot be
  the cause. Likely a linux/x64-vs-arm64 float difference in the ONNX runtime —
  **unconfirmed**.
- **Function size 227 MB** of a 250 MB limit, and `scripts/prune-onnx-binaries.mjs`
  is a **no-op on Vercel** (`pruned 0 platform(s)`) because npm only installs
  `linux/x64` there. Not re-measured since; static assets do not count toward it.
- **First-load bytes +63%** from the redesign (144 KB → 236 KB gzipped); 85 KB is
  the two typefaces. Warm LCP +57 ms. CLS 0.00. See
  [docs/evaluation/redesign-performance.md](docs/evaluation/redesign-performance.md).
- **Sessions are stateless signed tokens**, so changing a password does **not**
  sign out existing sessions. Only rotating `AUTH_SECRET` does, and that signs
  out everyone. Matters if the app goes multi-user.
- **`vitest.config.mts` `testTimeout` is 30 s.** A pre-existing flake: the
  semantic-matching test rescores the demo workspace four times with real
  embeddings, takes ~4.4 s alone, and cleared the 5 s default only until another
  file competed for CPU.

### Traps that cost time this session

1. **Local dev `DATABASE_URL` points at the production Neon database.** Do not
   sign up test accounts against it. For UI work, use a throwaway PGlite socket
   server (`@electric-sql/pglite-socket`) with **`maxConnections: 200`** — the
   default of 1, and even 20, gives `ECONNRESET` because `openDatabase` uses a
   5-connection pool and the app opens ~8 queries in parallel.
2. **A bare `"@"` alias in `vitest.config.mts` is a prefix match** and also
   rewrites `@huggingface/transformers`. It is anchored on `/^@\//`; do not
   "simplify" it back to a string key.
3. **Never clear `SCHOOL_LOGOS` before a long fetch run.** The registry is only
   rewritten at the end, so the app renders initials for the ~25 minutes it
   runs. The fetcher merges; clearing is unnecessary.
4. **Measure rendered pages, not error pages.** A round of "all zeros" alignment
   measurements turned out to be measuring a server-error page after the
   throwaway database died. Screenshot before trusting numbers.

---

## 8. Tests and build

```bash
./run_tests.sh   # the canonical gate: lint → typecheck → vitest → build → orchestration
npm run lint
npm run typecheck
npm test
npm run build
```

**Latest result — run immediately before writing §9, on the uncommitted Essay
Editor tree:**

```
EXIT=0
Test Files  29 passed (29)
Tests       762 passed (762)
=== 103 passed, 0 failed ===   (orchestration suite)
```

The `5c0aed9` baseline was 25 files / 717 tests. The four new files are
`essay-dashboard.test.ts`, `essay-guidance.test.ts`, `text.test.ts` and
`(app)/editor/[essayId]/autosave.test.ts`; `persistence.test.ts` gained the
reuse-copy, ask-first and completion-persists cases.

Other useful commands:

```bash
npm run logos:fetch -- --report   # re-resolve logos; merges, does not wipe
npm run logos:sheet               # contact sheets of all 100 marks
npm run auth:set-password -- --list
npm run db:migrate
```

Deploy: `git push origin main`. Production:
<https://college-essay-organizer.vercel.app>

---

## 9. Essay Editor, My Essays dashboard, Add Essay — **built**

Requested in the previous session, built in this one. Verified live against a
throwaway PGlite database with the 20-college example workspace, and by the full
gate (28 files / 746 tests, `EXIT=0`).

### What shipped

| Route | File | What |
|---|---|---|
| `/editor` | `src/app/(app)/editor/page.tsx` | Every document, most recently written first |
| `/editor/<id>` | `src/app/(app)/editor/[essayId]/page.tsx` | The writing workspace |

- **Nav** carries a fifth tab, `Essay Editor` (no badge — no single number
  belongs to it).
- **My Essays is a dashboard**, one card per school, rows grouped
  Not started / In progress / Completed, each row naming its document or
  offering **Start Writing**. The library card (with the reuse ribbon) survives
  for documents attached to no prompt: `Reusable library`.
- **Add Essay** is a URL-driven panel (`/essays?new=1`, `&promptId=<id>`
  prefills) with every student-facing field visible; only `designation` and
  `schoolSpecificPhrases` sit behind `Advanced settings`.
- **Every "open this essay" link now goes to `/editor/<id>`** — prompt rows,
  the reuse ribbon, the Reuse page. `redesign-parity.test.ts` asserts
  `/essays#essay-` appears nowhere.

### Review round two — what the owner's live review changed

Six fixes on top of the above, all verified live and by the gate.

1. **"Use here" copies instead of linking.** `src/lib/reuse-essay.ts`
   (`reuseEssayForPrompt`) creates a *new document* for the target prompt,
   seeded with the source's text exactly, named
   `<School> — <Prompt> — Reused from <Source school> <Source prompt>`, with
   `adaptedFromEssayId` recording where the text came from. The two are
   independent from then on. Every reuse surface goes through it: the editor's
   Shorten & adapt panel, the Reuse page, the Overview, and the suggestions in
   a prompt row. `assignEssayAction` had no callers left and was deleted;
   `assignEssayToPrompt` in `src/lib/assignments.ts` is still the one write.
2. **One transaction, no savepoints.** `insertEssay` and `assignEssayWithinTx`
   are transaction-free helpers taking
   `EssayWriter = Pick<AppDatabase, "select" | "insert" | "update" | "delete">`;
   `createEssay` / `assignEssayToPrompt` are now one-line wrappers around them.
   Reuse opens the single transaction, reads the source `for update` (so two
   simultaneous clicks serialise), and does everything inside it.
3. **Ask-first is enforced by the write, not the button.**
   `expectedAssignedEssayId` is checked *inside* the transaction; a reuse that
   would displace an answer nobody named returns `needs-confirmation` and
   writes nothing. `/editor/reuse` is the one shared confirmation page. A copy
   that already exists is **reattached** rather than re-copied, which is also
   the repair path when something else took the prompt over.
4. **Mark complete / Reopen** in the editor header
   (`setEssayCompletionAction`): essay → `ready`, every prompt it answers →
   `complete`, via `setPromptStatus` so canonical siblings follow. Reopen
   reverses it. Nothing else writes either status, so completion survives
   autosave, renaming, saving a version and restoring one — pinned by a
   persistence test.
5. **Delete is two-step** (`?delete=1`), matching the school-removal pattern,
   and states that copies and originals are untouched. `on delete set null` on
   `adapted_from_essay_id` is what makes that true.
6. **Sentence case and save times.** `src/app/text.ts` (`sentenceCase`,
   `sentenceList`, `statusLabel`) capitalises feedback phrases and status
   vocabularies at the presentation layer only — prompt titles, categories and
   the catalogue's own sentence-case summaries are never re-cased, and the
   official prompt wording is never touched. Version history and both document
   lists read as **save times** rather than `v3`, via `src/app/local-time.tsx`
   (the server renders an explicit UTC fallback; the browser localises it).

### Decisions worth not relitigating

1. **Autosave writes the draft in place** (`saveEssayDraft`, `src/lib/essays.ts`)
   — no version row, no `recomputeWorkspaceMatches` (that runs real
   embeddings), and no `revalidatePath`. Versions stay snapshots the student
   asked for. Verified: typing then navigating in-app shows fresh counts
   without revalidation, because every route is `force-dynamic`.
2. **Save version keeps its old behaviour exactly** — appends an immutable
   version and rescores. It is also the only thing that refreshes the matcher's
   adaptation notes, which is why the editor's Shorten & adapt panel is headed
   `Based on version <n>`.
3. **The writing textarea *is* the version form's `content` field.** No hidden
   mirror, so the editor works with JavaScript disabled — verified by posting
   the server-rendered form and watching a version appear.
4. **Autosave is coordinated on the server, not by wiring buttons.**
   `saveEssayDraft` takes `expectedLastEditedAt` and writes only if the stored
   timestamp still matches; a restore (which bumps it) or a delete (which
   removes the row) therefore cannot be overwritten by a request that was in
   flight across it. The client also flushes a pending autosave before
   submitting a version, and on unmount.
5. **Shorten/adapt surfaces existing guidance only.** Length is live
   (`src/app/essay-guidance.ts`, same thresholds as `matchAdjustments`); the
   per-prompt notes and `Use here` come from the matcher. **No AI, and no
   automated rewriting** — the extension point is another action beside
   `wordLimitNotes`, not a change to it.
6. **My Essays says "N answered", not "N done".** `summarizeWorkload` counts a
   prompt with an essay attached as done; the row groups deliberately separate
   *finished* from *drafted*. Same numbers, one word changed, so the two
   readings stop looking contradictory.
7. **Deleting redirects to `/essays`** — it is only offered inside a document,
   and that URL no longer exists afterwards.

### New modules

- `src/app/essay-ui.tsx` — shared essay UI: `EssayFields`,
  `OriginPromptFields`, `essayOrigin`, `essayPromptContext`,
  `EssayVersionHistory`, `ReuseRibbon`, `essayRibbonEntries`,
  `matchAdjustments`, `documentName`
- `src/app/essay-dashboard.ts` (+ test) — school grouping and the three row
  states; every count via `workspaceWorkload`
- `src/app/essay-guidance.ts` (+ test) — live word-limit notes
- `src/app/(app)/editor/[essayId]/autosave.ts` (+ test) — the autosave state
  machine: one request in flight, out-of-order responses discarded, conflict
  and deletion terminal
- `src/app/(app)/editor/[essayId]/document-surface.tsx` — the app's second real
  client component
- `src/app/styles/features/editor.css` — the editor layout, moved out of
  `essays.css`

### Two display subtleties

- `essayPromptContext` falls back to the *assigned* prompt when an essay has no
  origin — every example-workspace essay is in that state, and "no prompt
  attached" over an assigned document would be false. It never writes an
  origin; the panel says `Assigned to answer` rather than `Writing for`.
- The conflict/stale-editor path is covered by `autosave.test.ts` and
  `persistence.test.ts`, not by a browser reproduction: two-tab racing was not
  staged by hand.

## 10. Loose ends

- **[AGENT_HANDOFF.md](AGENT_HANDOFF.md) is stale for this session.** Its "UI
  architecture" section was updated for the redesign, but the workload bands,
  availability states, published logos and the deploy are not reflected. Its
  "Last Verified Commit" still reads `76013d4`. Either update it or treat this
  file as authoritative for UI matters.
- `src/app/styles/primitives/` is an **empty directory** left from the redesign
  scaffolding. Untracked by git, harmless, delete when convenient.
- `.screenshots/` is gitignored and holds this session's contact sheets and
  verification screenshots, plus `logo-audit.json` (the per-school logo
  provenance trail).
- `next-env.d.ts` flips between `.next/types` and `.next/dev/types` depending on
  whether `next dev` or `next build` ran last. It is deliberately kept at the
  build variant; ignore the churn.
- The demo/example workspace is 20 colleges, 117 prompts, 9 sample essays, and
  is rebuilt by the same import pipeline as real data. Use it for UI work.
- **The Essay Editor work in §9, including review round two, is uncommitted and
  undeployed.** Nothing else in the tree is dirty. `git push origin main` deploys, so committing it ships it.
- **UI verification needs `@electric-sql/pglite-socket`, which is not a
  dependency.** It was installed with `npm install --no-save` (so neither
  `package.json` nor the lockfile changed) and removed afterwards. The throwaway
  server script lived at `.dev-db.mjs` in the repo root — it has to be in the
  repo root, not the scratchpad, to resolve `@electric-sql/pglite` — and was
  deleted. `maxConnections: 200`, port 5433, then
  `DATABASE_URL=... node node_modules/drizzle-kit/bin.cjs migrate`.
  **Shell env beats `.env.local`** (verified against `@next/env`), which is what
  makes it safe to run `next dev` against the throwaway database while
  `.env.local` still points at production Neon.
- Chrome's window has a **500px floor** on macOS, so the 390px check was made
  in a 390px-wide iframe (its own viewport, so media queries apply). No
  horizontal overflow at 390px on `/essays`, `/editor` or `/editor/<id>`.
