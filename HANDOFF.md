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

## 11. Coaches-led editor, reuse without AI, catalogue convergence — **built**

Three changes, one session. The first two are independent of each other; the
third is a database repair that is **not yet applied**.

### 11a. Reuse never invokes an AI rewrite

`reuseEssayForPrompt` always copied `source.currentContent` verbatim, so the
write was already right. What went was everything wrapped around it:

- `ReuseHereControl` (`src/app/essay-ui.tsx`) no longer takes `essayWordCount` /
  `promptMaxWordCount` and no longer detours on length. It diverts to
  `/editor/reuse` for exactly one reason now: displacing another answer.
  That also fixed the inconsistency where `prompt-ui.tsx`'s suggestion button
  never detoured at all — with the detour gone, all four reuse surfaces behave
  identically, and they all say "Use here".
- **Deleted:** `(app)/editor/reuse/shorten/` (both files),
  `acceptReuseWithShortenAction`, and — separately, on the owner's call — the
  rewrite-style editor control: `shorten-control.tsx`,
  `use-shorten-request.ts`, all of `shorten-actions.ts`, `src/lib/word-diff.ts`
  (+ test), and `shortenEssay` / `validateInput` / `ShortenResult` /
  `PROFILE_ID` / `MAX_TARGET_WORD_COUNT` from `src/lib/travila.ts`. The
  `/* shorten */` CSS block (76 lines) went with them; `.shorten-coach-*`
  stayed.
- `src/lib/travila.ts` is now **transport only** — `runTravilaTurn` plus the
  create/send/poll/extract internals. No profile id, no feature logic. Every
  caller is a coach.
- Over-limit state is stated on the writing surface instead:
  `document-surface.tsx` adds one `notice-caution` line, "Use the AI Coaches to
  help adapt this essay to fit this prompt and its requirements", gated on the
  same `limit && words > limit` the live count already computes. Deliberately
  **not** gated on "was reused" — no new state, and an over-limit draft
  deserves the pointer however it got there.
- `needsShortenOffer` (`essay-guidance.ts`) is gone; it was already dead.

**Do not reintroduce a length-based detour.** `redesign-parity.test.ts` guards
it, scoped to `ReuseHereControl`'s own body (`matchAdjustments` below it reads
the same counts legitimately, to *describe* the work rather than act on it).

### 11b. Seven equal coaches, coaches first

Sidebar order is now **AI Coaches → Reference Check → Adapt & reuse → Version
history → Document details**. Coaches lead because they are how a student
adapts a reused essay.

Lineup, in this deliberate order (roughly length → substance → mechanics, which
is why Proofread is last — it is not a ranking):
**Shorten · Lengthen · Flow · Vivid · Prompt Fit · Review · Proofread.**
All seven are peers. No "more coaches" drawer, no primary/secondary styling.
`.coach-tabs` became a `repeat(auto-fit, minmax(6.5rem, 1fr))` grid so seven
items wrap into equal-width rows rather than the ragged last line `flex-wrap`
left.

Flow, Vivid and Proofread are three more instances of the existing hand-copied
four-file pattern (lib coach → server action → hook → control + one array entry
+ one CSS selector). **A coach registry was considered and rejected**: seven
array entries beat an abstraction that would have to absorb seven coaches'
different target-word semantics and phase sets. The existing code comments
already argue this; they are still right.

All three are excerpt-anchored and run `verifyAndDedupeExcerpts`, so a coach
cannot send a student looking for a passage they never wrote. All three treat
`findings: []` as `status: "ok"` — the Lengthen convention, **not** Shorten's
"no valid recommendations → malformed", because "your essay reads cleanly" is a
real answer where "shorten by 200 words but I found nothing to cut" is a
contradiction. Each parser drops individual invalid entries rather than failing
the whole response.

The one substantive asymmetry: **Proofread may emit replacement text**, in one
tightly scoped field. `correction` carries the minimal corrected form of the
quoted phrase and nothing more. Its instruction states that as its own rule, so
the model reads neither the general no-rewriting rule as forbidding the fix nor
the field as licence to restyle. It also enumerates what never to flag
(fragments for effect, And/But openers, conversational phrasing, deliberate
repetition, Oxford comma either way, consistent British spelling) and is told
to stay silent when unsure. Zero findings must read exactly **"No significant
proofreading issues found."**

`ponytail:` note in `proofread-coach.ts` — `verifyAndDedupeExcerpts` drops the
later of two overlapping findings, so two genuine errors in one quoted span
collapse to one. Mitigated by demanding a two-to-six-word excerpt. Give it its
own nesting-tolerant dedupe if students report missed second errors.

`saveEssayVersion`'s `expectedLastEditedAt` guard lost its only production
caller with `acceptShortenAction`. It was kept (with a `ponytail:` note) —
correct lib-level concurrency check, and any future apply-a-proposal path wants
it.

### 11c. Reference Check is a collapsible checklist

`src/lib/reference-check.ts` detection is **unchanged**, and
`ReferenceFlagsList` already rendered every flag untruncated. Only
`reference-check-panel.tsx` changed:

- Native `<details>`, house style, no `useState` for show/hide. The count lives
  in the `<summary>` ("3 references to review" / "None detected"), since that
  is the only question the collapsed state needs to answer.
- **It no longer hides itself.** The old `if (!isReusedEssay && flags.length === 0) return null`
  meant a student could not tell "checked, all clear" from "this feature does
  not exist". `isReusedEssay` is no longer a prop.
- Open state is frozen at mount: `const [initiallyOpen] = useState(() => flags.length > 0)`.
  **This matters** — `live.text` changes on every keystroke, so a re-derived
  `open` would spring the section back open the moment the flag count crossed
  zero, overriding a student who had just closed it. Frozen, React never touches
  the attribute again. Do not "fix" this into a controlled prop.

### 11d. Catalogue convergence — **applied to Neon**

Root cause of "Current prompts not yet verified" / "Not yet verified" on
verified schools. The committed catalogue was always correct; the live rows
could not converge. Three defects, all fixed in `src/lib/college-import.ts`
and `src/lib/top-universities.ts`:

1. `promptContentChanged` compares only what a student reads — not `cycleId`,
   not `verificationStatus`. Harvard's text was byte-identical across the
   promotion in `8cf57ef`, so all five prompts counted "unchanged" and nothing
   was written; they still say cycle `2025–26`. `upsertPrompts` now has a
   **fourth outcome, `reconciled`**: content identical but cycle or status
   drifted → minimal two-column update, **no `promptChangeLog` row and no
   `flagged` count**, because nothing the student wrote or reads moved.
   `cycleId` was also missing from the content-change `set` block; added.
2. `verificationStatus` was hard-coded to `"needs-review"` on any content
   change and never written back — 136 live rows stuck there. It now follows
   the catalogue record. **`needs-review` means "the catalogue is unsure"**; a
   reworded officially-verified prompt is more verified, not less, and that it
   moved is what `promptChangeLog` and `counts.flagged` are for. Consequence:
   the Overview "attention" tile drops to ~0, which is correct —
   `qa-catalogue.mts` fails the build on a `needs-review` record, so the
   catalogue can never ship one. `persistence.test.ts:1106` asserted the old
   behaviour; that assertion **was the bug written down** and was changed
   deliberately.
3. One school row was literally named `"University of Maryland"`, which matches
   no registry key, so it imported as `manual` with zero prompts.
   `canonicalizeUniversityName` now consults a small explicit
   `ALIASES_BY_LOWERCASE` map (Maryland, North Carolina, Texas).
   **A generated rule was tried first and rejected**: splitting on `", "` /
   `" at "` yields only those same three entries once ambiguous prefixes are
   dropped, so the generator would be more code than its output.
   `"University of California"` is deliberately absent — seven campuses claim
   it, and passing it through as a correctable manual entry beats silently
   picking Berkeley.

`scripts/reimport-catalogue.mts` gained a real `--dry-run` (it previously only
printed "would re-import X", which previewed nothing) reporting every rename
candidate and every drifted row, plus a write-path rename for non-canonical
names that **skips and logs loudly** if the canonical name is already taken in
that workspace — a merge is a human decision.

**APPLIED to Neon on 2026-09-06**, after the owner reviewed the dry run
(1 rename, 10 cycle moves, 158 status corrections, 0 blocked renames, 0 schools
without a record). Result: `created 6, updated 0, unchanged 129, reconciled 158,
flagged 0, retired 0, removed 0, renamed 1, failed 0, recomputed 4`.

    node --env-file-if-exists=.env.local --experimental-strip-types \
      --import ./scripts/ts-resolve.mjs scripts/reimport-catalogue.mts [--dry-run]

Note the `--import ./scripts/ts-resolve.mjs` — the doc comment in that file
omits it, but `.ts` imports need it.

Verified after the write: **0** rows at `needs-review`, **0** rows on a
non-current cycle, Harvard's 5 prompts `officially-verified` on `2026–27` in
both workspaces, UMD holding 6 `officially-verified` prompts, all 39 schools
`catalogue_status = current`, no duplicate school name within a workspace, no
duplicate `external_ref` within a school, no orphaned assignments or matches,
and all 21 assignments intact. A pre-write snapshot of every affected column was
taken first (287 prompt rows, 39 school rows).

**Gotcha for whoever reads those verification queries:** there are *three*
personal workspaces all displaying the name "My workspace"
(`personal:17a7ffa7…`, `personal:27ab3658…`, `personal:e837ef0a…`). A query
grouped by workspace *name* looks like it is showing duplicate school rows when
it is not — group by `workspace_id`.

### 11e. `common-app-verified` renamed to `corroborated`

Follow-up to the Stanford question, done rather than deferred. The old name
asserted a provenance those prompts never had: the generator
(`build-catalogue.mts`) maps the master record's `CORROBORATED` to it, meaning
"not read off the school's own page, but agreed on by several independent
current-cycle sources" — which for Stanford was four essay-consultant sites, not
the Common App. The UI rendered that as a **"Common App"** badge, which is
false, and it collided with the separate and correct
`application_platform = 'common-app'` column.

Renamed across `schema.ts`, `retrieval/types.ts`, `build-catalogue.mts`, the 12
affected catalogue source files, `normalize.ts`, `prompt-ui.tsx` (badge label is
now **"✓ Corroborated"**), and the tests. The tone stays `verified` — a green ✓
— because a corroborated record still carries prompts, must be current-cycle,
and must not cite a secondary-source URL. `persistence.test.ts` still asserts
the two statuses do not collapse into one badge.

`drizzle/0006_corroborated_status.sql` is the data migration: a single `UPDATE`,
safe because `verification_status` is a plain `text` column with **no CHECK
constraint and no Postgres enum** — the enum in `schema.ts` is TypeScript-only,
so there was no type to alter. Reversible by swapping the two values. Applied to
Neon; 41 rows moved, 0 `common-app-verified` remain, `application_platform`
untouched. The three affected schools are Northwestern (12), Stanford (16) and
USC (13).

**Do not "fix" the count in `persistence.test.ts`'s comment** ("83 schools
publish their prompts, 12 are corroborated"). That counts *catalogue records*
and is correct. The master JSON's raw `verification_status` is 86 `VERIFIED` /
13 `CORROBORATED` / 1 `NO_SUPPLEMENT`; the numbers differ because a `VERIFIED`
school with zero prompts becomes `no-supplement-confirmed`. Both are right, with
different denominators. This was mis-flagged as doc drift once already.

### 11f. Coach hooks no longer dead-end on a thrown action

Found during browser verification and fixed in **all seven** hooks, not just the
new three. None of them guarded the awaited server action, so if it *threw*
rather than returning an error — the platform killing a slow request at the
route's `maxDuration`, or a dropped connection — the rejection landed in the
control's `void request(...)`, the phase stayed `"loading"`, and the student was
left with a spinner that never resolved and no way back but a reload. Each
`request()` now try/catches and falls into the error phase.

This is reachable, not theoretical: one Flow run during verification exceeded
`POLL_TIMEOUT_MS` (75s). Which brings up the **known mismatch, still open**:
`POLL_TIMEOUT_MS = 75_000` in `travila.ts` exceeds `export const maxDuration = 60`
on the editor route, so in production the platform kills a slow coach run before
the graceful `timeout` reason can be returned. With 11f in place that now
degrades to "That took too long, or the connection dropped — try again" instead
of an infinite spinner, which is why the numbers were left alone. Closing it
properly means either lowering the poll timeout under `maxDuration` (more
failures, friendlier message) or raising `maxDuration` (needs the Vercel plan's
ceiling checked first). Deliberately not decided here.

### Browser-verified

Done against a **throwaway PGlite database**, never production — the pattern in
§10, `.dev-db.mjs` on port 5433, shell `DATABASE_URL` beating `.env.local`. The
owner's Chrome and `chrome-devtools-mcp` profile were both already in use and
were left alone; an isolated headless Chrome on `--remote-debugging-port=9333`
with its own `user-data-dir` was driven over CDP instead. Seeded one user, three
colleges, and one 552-word essay planting each coach's target problems. All of
that was torn down afterwards and the owner's `next dev` restarted against Neon.

Confirmed:

- **Sidebar order** — `AI COACHES → REFERENCE CHECK → ADAPT & REUSE → VERSION HISTORY → DOCUMENT DETAILS`.
- **Seven coach tabs**, all seven mounted (six `hidden`), every tab the same
  103×30px, laid out 3 columns × 3 rows. `minmax()` was tightened from `6.5rem`
  to `6rem` because 6.5rem fell to 2 columns × 4 rows at sidebar width, leaving
  a lonelier orphan. At 390px it is 2 columns × 134px with no horizontal
  overflow and no label wrapping.
- **Reuse** — `/reuse` renders 20 "Use here" forms and **zero**
  `/editor/reuse` detour links, i.e. no length-based detour anywhere. Clicking
  one went straight to the new document (not the confirmation page); the copied
  text was **byte-identical** to the source (558 → 558 words); the count read
  `558 / 150 words` with `.over`; guidance read `408 over the 150-word limit —
  cut 408`; the caution read *"Use the AI Coaches to help adapt this essay to
  fit this prompt and its requirements."*; and the words "shorten
  automatically" appear nowhere on the page.
- **Reference Check** — summary `4 references to review`, four flags listed
  (Princeton, Professor Whitman, CS 106A, The Firestone Library), no "show
  more". Collapsed it, typed into the essay, and it **stayed collapsed** with
  its results intact; reopening showed the same four. The `useState`-frozen
  `open` is what makes that work.
- **Live Travila runs** (real API, real key): Vivid returned 9 findings, each
  quoting real text and naming the *kind* of detail needed without inventing
  any. Proofread returned exactly 2 — `"since three years"` → `"for three
  years"`, and the comma between subject and verb — and correctly declined to
  flag the repetitive padding or restyle anything. Flow returned 5 (abrupt
  transition, logic jump, out-of-order, two unclear connections). The essay's
  word count was unchanged after every run: **no coach writes**.
- One redundancy fixed: the framing paragraph added above the reference list
  said the same thing as `ReferenceReviewNotice` directly below it. Deleted.

### 11h. C6b production AI verification — FAILED, and 11g is why

Run 2026-09-10 against production `32d5bb3` with `TRAVILA_API_KEY` configured,
using a marked throwaway account. Four of seven coaches work; three do not.

| Coach | Result |
|---|---|
| Shorten | ✅ real finding (caught the repeated section) |
| Lengthen | ✅ correct precondition ("already at or over your target") |
| Prompt Fit | ✅ 2 findings |
| Review | ✅ 8 findings |
| **Flow** | ❌ `"reason":"http"` `"detail":"send-message: 404"` |
| **Vivid** | ❌ same |
| **Proofread** | ❌ same |

**The key is fine.** `create-thread` succeeds — that is the authenticated call.
It is `send-message` that 404s, and only for the three profile ids added in
§11d/11e: `college_essay_flow_coach`, `college_essay_vivid_coach`,
`college_essay_proofread_coach`. The four coaches whose profiles genuinely
exist all work.

**This corrects the impression left by §11g.** Those three appeared to work in
local testing because the Travila account behind the *local* key silently falls
back to a default agent for an unknown `setActiveProfileId` (HTTP 200,
`profileVersion: undefined`, `profileId` echo `null`). The production account
does not fall back — it returns 404. So the earlier local success was the
fallback agent answering, never a configured profile. §11g's action item is now
a hard launch blocker rather than a tidiness issue.

**Action: create the three agent profiles in the Travila console**, then re-run
C6b. Nothing in this repo needs to change; do not repoint the coaches at an
existing profile, which would give them the wrong instruction and model config.

Degradation is safe meanwhile: the essay is untouched, the error is explicit,
and "Try again" recovers. Stale-result handling was verified working in
production (edit during results → "This essay has changed since these
recommendations were generated" + Re-analyze).

### 11g. HUMAN-REQUIRED: the three new Travila profiles do not exist yet

Measured, not guessed. A controlled probe sent the same one-line instruction to
three profile ids and compared `generationContext`:

| `setActiveProfileId` | HTTP | `profileVersion` | `profileId` echo | model | promptTokens |
|---|---|---|---|---|---|
| `college_essay_shorten_coach` (pre-existing) | 200 | `1` | `"college_essay_shorten_coach"` | `google/gemini-3.7-flash` | 6,874 |
| `college_essay_flow_coach` (added here) | 200 | `undefined` | `null` | `deepseek/deepseek-v4-flash-0731` | 11,647 |
| `definitely_not_a_real_profile_zzz_<ts>` | 200 | `undefined` | `null` | `deepseek/deepseek-v4-flash-0731` | 11,647 |

The new profile is **indistinguishable from a randomly generated nonexistent
one** - same fallback model, same prompt-token count, and
`generationContext` carrying only `turn, model, resolvedMcpServers` instead of
the configured profile's `turn, profileId, model, promptSource, profileVersion,
resolvedPromptHash`.

**Travila answers HTTP 200 for an unknown `setActiveProfileId` and silently
falls back to a default agent.** There is no error to catch, which is why the
coaches appeared to work: Flow, Vivid and Proofread are running entirely on the
instruction text in the request body, which is self-contained enough to produce
good output (verified - see §Browser-verified). Nothing is broken for a student
today.

What is nonetheless wrong until someone creates the profiles in Travila:

- **No per-coach model or reasoning config is applied.** Whatever was intended
  by a Flow/Vivid/Proofread profile is not in effect.
- **Billing moves.** The configured profile reports `isByok: true`; the fallback
  does not, so those runs are on Travila's inference billing rather than the
  project's own key.
- **The fallback carries a bigger system prompt than the real profile** (11,647
  vs 6,874 prompt tokens) and both attach `built-in:firecrawl` and
  `built-in:tavily` on every call - web-scraping and search tools no coach asks
  for or needs. Worth confirming with Travila that an unused MCP server cannot
  be invoked with essay text in it; student essays are the payload here.

Action: create `college_essay_flow_coach`, `college_essay_vivid_coach` and
`college_essay_proofread_coach` in Travila, then re-probe and confirm
`profileVersion` comes back defined. `[travila:debug]` in `travila.ts` already
logs it in dev and now carries a comment saying why it is the tell.

Related, and now partly answered: the `TEMPORARY` comment on
`POLL_TIMEOUT_MS` asks whether `reasoning.maxTokens` is honored. Reasoning
tokens *are* reported (`completionTokensDetails.reasoningTokens` came back
4,546 / 177 / 3,097 across the three live coach runs), but with no profile
resolving, any profile-level reasoning config cannot be in effect for these
three. Re-test after the profiles exist.

One small reporting inconsistency seen once, worth a note to Travila rather than
action here: a Flow run returned `completionTokens: 3067` with
`reasoningTokens: 3097` - reasoning exceeding the completion total it is
normally a subset of. Every other observed run held the subset relationship.

### Tests

`npm run typecheck`, `npm run lint`, `npm test` (966 passed, 8 skipped, 47
files) and `npm run build` all clean. `scripts/qa-catalogue.mts` also passes,
reporting `{officially-verified: 83, corroborated: 12, no-supplement-confirmed: 5}`.

One flake worth not chasing: three PGlite-backed suites timed out their 30s
`beforeEach` migrate hook during one run, while the Neon reimport was running
concurrently on the same machine. Measured in isolation the hook takes
~1.2–1.9s, so it is contention, not migration `0006` adding cost.

- **`src/lib/coaches/finding-coaches.test.ts` is table-driven over all three
  new coaches**, not three copied files. The production modules stay separate
  per the existing convention; only these assertions are genuinely identical,
  and three copies would be three places to forget. Per-coach instruction text
  and profile ids are asserted in a second block in the same file.
- `travila.test.ts` was **retargeted from `shortenEssay` to `runTravilaTurn`**
  so transport coverage did not leave with the shortener. The six
  `validateInput` cases went; each coach owns its own validator and tests it.
- New: `top-universities.test.ts`, the three `*-coach-actions.test.ts`, a
  `reconciled` case in `persistence.test.ts`, and four guards in
  `redesign-parity.test.ts` (no shorten detour, the coaches pointer, the
  seven-coach order, coaches-first sidebar). Those source-text guards are the
  **only** coverage the `.tsx` surfaces get — `vitest.config.mts` includes
  `src/**/*.test.ts` only.

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
- **The Essay Editor work in §9 is committed as of §11's commit; §11 itself is
  committed but undeployed.** `git push origin main` deploys, so pushing ships
  it — and note the database is *already* migrated, so the deploy is the second
  half of a change whose first half is live.
- **§11d's database repair and §11e's rename are both applied to Neon.** The
  code and the data agree; nothing is pending there.
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
