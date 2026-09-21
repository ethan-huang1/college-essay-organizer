# Technical notes

Design decisions, invariants and known gaps for anyone reading or changing this
codebase. [README.md](README.md) is the short version and the place to start.
This file is the longer one: why things are the way they are, and which of them
will bite you if you change them without knowing.

---

## 1. What the app is

A workspace for a student applying to many colleges. The premise is that
supplemental essays overlap heavily, so the product's job is to show where one
essay can answer several prompts.

The loop: add a college, its verified 2026-27 prompts import and self-classify,
matching suggests which existing essays could answer them, the student assigns
one or writes a new one.

**Matching itself contains no AI.** It is deterministic and explainable. The
only model in the scoring path is a local ONNX sentence embedder supplying one
of four factors. AI appears in exactly one place, the seven editorial coaches in
the essay editor (§8), and those never rewrite the student's text.

## 2. Architecture

Next.js 16 App Router, React 19 Server Components, Postgres via Drizzle. Neon in
development and production, PGlite (WASM Postgres) in tests, running the same
dialect and the same committed migrations.

- Every mutation is a Server Action driven by a plain `<form>`.
- **Client components are confined to the editor.** Outside
  `src/app/(app)/editor/`, there are four in the whole app: `nav-link.tsx`,
  `local-time.tsx`, `pending-button.tsx` and the error boundary. The editor has
  19, because the coaches, the live word count and autosave genuinely need
  interactivity. Keep that boundary: a new client component outside the editor
  should have to justify itself.
- Progressive disclosure uses `<details>` and URL params, so the app works
  without JavaScript. The account menu uses the native `popover` attribute.
- Nothing is prerendered. Every route reads the workspace cookie and the
  database, so the root layout declares `force-dynamic` and the build needs no
  database connection.
- Deployed on Vercel. `git push origin main` deploys.

---

## 3. Product decisions already settled

### Counting

- **`summarizeWorkload` in `src/lib/workload.ts` is the only place required work
  is counted.** Every count site reads it. Do not count prompt rows anywhere
  else; the sidebar, headers and Overview disagreed with each other when they
  each did their own counting.
- Counts are **essays the schools ask for**, not prompt rows: a choose-4-of-8
  set counts as 4, and a question five campuses share counts once.
- **Conditional and program-specific prompts are excluded from `requiredTotal`**
  until the student says which programs they are applying to. Guessing would
  inflate the count. They are surfaced separately (see §6).

### Reuse scoring

Four weighted factors: **primary 25 / semantic 40 / secondary 20 / function
15**. `Other` uses 0/45/20/20. Four bands, and deliberately no "ready to reuse"
band, because every reused essay needs some tailoring, so the top band is
"slight edits". Full reasoning in [docs/reuse-scoring.md](docs/reuse-scoring.md).

- Word count is a **band ceiling, not a score penalty**.
- Accepting a reuse suggestion must **never** redefine an essay's origin prompt.
- Embeddings must be computed **one text per call**. Batching pads to the
  longest text and mean-pools over the padding.

### Interface

- Naming: **Overview, Your Prompts, Categories, My Essays, Essay Editor,
  Reuse**. Routes did not change (`/`, `/schools`, `/families`, `/essays`,
  `/editor`, `/reuse`) because renaming `/schools` would break every `?school=`
  link.
- **Cards for things you act on, rows for things you scan.** A card nested in a
  card is a defect.
- Plus Jakarta Sans throughout; **Newsreader only** for prompt text and essay
  prose. Both self-hosted at build.
- Desktop-first: composed for 1440px and up to 2880px. Mobile must stay
  *usable*, not polished. That is a deliberate scope decision.
- `aria-current="page"` is reserved for navigation. Filter chips are removal
  links and carry neither `aria-pressed` nor `aria-current`.
- **Logos are live for all 100 colleges.** The trademark position is unresolved
  and stated plainly in [docs/school-logos.md](docs/school-logos.md).
  `SHOW_SCHOOL_LOGOS=0` disables every logo with no code change;
  `DECLINED_SCHOOLS` removes one school.
- No campus photographs are in use. The machinery exists
  ([docs/school-photos.md](docs/school-photos.md)); the registry is empty
  because identifying a campus in an image is a human step.

---

## 4. Routes, data model, key modules

### Routes

| Route | File | Notes |
|---|---|---|
| `/` | `src/app/(app)/page.tsx` | Overview: bands, college cards |
| `/schools` | `src/app/(app)/[section]/page.tsx` | Your Prompts |
| `/families` | same file | Categories |
| `/essays` | same file | My Essays, the per-school progress dashboard |
| `/reuse` | same file | Reuse |
| `/editor` | `src/app/(app)/editor/page.tsx` | Essay Editor: every document |
| `/editor/[essayId]` | `src/app/(app)/editor/[essayId]/page.tsx` | One document, full page |
| `/editor/reuse` | `src/app/(app)/editor/reuse/page.tsx` | The one reuse confirmation page |
| `/photo-credits` | `src/app/(app)/photo-credits/page.tsx` | Image credits |
| `/sign-in`, `/sign-up` | `src/app/sign-in`, `sign-up` | Share `auth-form.tsx` |

`src/app/(app)/[section]/page.tsx` is **~1000 lines holding four views**. It is
the biggest liability in the codebase. Splitting it is legitimate work, but do
it deliberately, not incidentally.

`src/proxy.ts` is the auth gate in front of every route. Its matcher excludes
`_next/static`, `_next/image`, `school-logos` and `favicon.ico`. **Adding a new
public asset directory means updating that matcher.** Forgetting it sent 100
image requests per page load through the edge auth function.

There is also a development-only plan reader under `src/app/(app)/plans/`. It is
a `.dev.tsx` file, excluded from production by `pageExtensions`, and its nav
link is gated on `NODE_ENV`. It reads local files and ships nowhere.

### Data model

16 tables in `src/lib/db/schema.ts`: `users`, `workspaces`, `applicationCycles`,
`schools`, `promptFamilies`, `promptTags`, `prompts`, `promptChangeLog`,
`promptFamilyLinks`, `promptTagLinks`, `essays`, `essayVersions`,
`essayFamilyLinks`, `essayTagLinks`, `essayPromptMatches`,
`assignedEssayResponses`.

```
essays          id workspaceId title currentContent targetWordCount status
                designation adaptedFromEssayId notes schoolSpecificPhrases
                originPromptId originPromptTitle originPromptText
                lastEditedAt createdAt

essayVersions   id workspaceId essayId versionNumber content wordCount
                reason createdAt
```

- `essay_prompt_matches` is a full recompute, not an incremental cache, so a
  stale match cannot survive an edit.
- `assigned_essay_responses` has a unique index on `prompt_id`: a prompt has at
  most one current response. That answers "where is this essay used", which is a
  different question from `essays.origin_prompt_id`, "what was it written for".
  The latter is a nullable FK with `on delete set null`, so an essay outlives
  the prompt record it came from.
- `prompt_family_links` / `essay_family_links` carry one primary plus many
  secondary categories, with a partial unique index enforcing at most one
  primary.
- **Drizzle `text(..., { enum: [...] })` emits plain `text` with no CHECK
  constraint**, so enum vocabularies can grow with no migration. The enum is
  TypeScript-only.

### Key modules

- `src/lib/workload.ts` is the single counting authority
- `src/lib/matching.ts` is the deterministic scorer, plus `ACTION_LABELS`
- `src/lib/progress.ts` holds derived UI numbers, `workState`, `reuseOpportunities`
- `src/lib/essays.ts` is essay CRUD with immutable versions
- `src/lib/schools.ts` has `schoolCatalogueState`, `schoolAvailability`
- `src/lib/travila.ts` is transport only for the coaches (§8)
- `src/app/workload-bands.ts` derives the bands (presentational)
- `src/app/filtering.ts` holds filter predicates, extracted so they are testable
- `src/app/school-mark.tsx`, `src/app/mark-palette.ts` render the logo/initials mark

---

## 5. Invariants that must be preserved

1. **The 30 form field names** Server Actions read by string. Renaming one in
   markup is invisible to TypeScript and to every other test.
   `src/app/redesign-parity.test.ts` pins them, and its file list includes
   `essay-ui.tsx` and the editor files, because that is where the essay forms
   live. **Adding a file that renders one of those fields means adding it to
   that list**, or the assertions pass against markup nobody serves.
2. **Category selects map over `snapshot.families`**, never a hard-coded list.
   `src/app/primary-category-controls.test.ts` greps for exactly this.
3. **Filtering behaviour**: same field names, same submit target, same result
   set. Pinned in `redesign-parity.test.ts`.
4. **Routes unchanged.**
5. **Immutable versions.** Saving an essay appends a new `essayVersions` row and
   repoints `currentContent`. Nothing is edited in place; restore adds a new
   version instead of rewinding.
6. **A prompt keeps at most one current response** (`assignedEssayResponses`).
7. **Previous-cycle warnings stay on the collapsed prompt row**, never behind
   disclosure. The spec requires prominence.
8. **The full prompt edit form is fetched via `?edit=<id>`**, not inlined per
   row. 107 inlined copies made `/schools` a 4 MB document.
9. **Bands must sum to `requiredTotal`.** `workload-bands.test.ts` asserts it as
   a property.
10. **Contrast.** `src/app/contrast.test.ts` parses `tokens.css` and fails if a
    colour is added without being checked.

---

## 6. School availability, and why it is seven states

The "No required essays on file" message was one string covering five unrelated
facts, and tracing it showed the bug was not where it looked.

- **A school with `prompts: []` can be correct data.** Columbia publishes its
  questions only inside the Common App. Some schools are in that state; others
  are verified as having no supplement at all. Those two were indistinguishable
  to a student, which was the reported symptom.
- **The actual defect:** schools that have real prompts and no *unconditional*
  required one were told they had nothing to write. Amherst has 3 conditional,
  Georgetown 7 program-specific, Penn 13. A separate group (Bowdoin, Trinity,
  Colorado College, NYU) publishes only optional prompts.

`schoolAvailability()` in `src/lib/schools.ts` resolves seven states, with real
work always outranking a catalogue caveat, so "No supplemental essay required"
appears **only** where that was actually verified. 16 tests in
`src/lib/school-availability.test.ts` cover one school per state drawn from the
live catalogue.

---

## 7. The essay editor

| Route | What |
|---|---|
| `/editor` | Every document, grouped by school, most recently written first |
| `/editor/<id>` | The writing workspace |

My Essays is a dashboard, one card per school, rows grouped Not started / In
progress / Completed, each row naming its document or offering **Start
Writing**. The library card with the reuse ribbon survives for documents
attached to no prompt, under `Reusable library`. Add Essay is a URL-driven panel
(`/essays?new=1`, `&promptId=<id>` prefills); only `designation` and
`schoolSpecificPhrases` sit behind `Advanced settings`.

Every "open this essay" link goes to `/editor/<id>`. `redesign-parity.test.ts`
asserts `/essays#essay-` appears nowhere.

### Decisions worth not relitigating

1. **"Use here" copies, it does not link.** `reuseEssayForPrompt`
   (`src/lib/reuse-essay.ts`) creates a *new document* for the target prompt,
   seeded with the source text exactly, with `adaptedFromEssayId` recording
   where it came from. The two are independent from then on. Every reuse surface
   goes through it.
2. **One transaction, no savepoints.** `insertEssay` and `assignEssayWithinTx`
   are transaction-free helpers taking
   `EssayWriter = Pick<AppDatabase, "select" | "insert" | "update" | "delete">`;
   `createEssay` / `assignEssayToPrompt` are one-line wrappers. Reuse opens the
   single transaction, reads the source `for update` so two simultaneous clicks
   serialise, and does everything inside it.
3. **Ask-first is enforced by the write, not the button.**
   `expectedAssignedEssayId` is checked *inside* the transaction; a reuse that
   would displace an answer nobody named returns `needs-confirmation` and writes
   nothing. A copy that already exists is **reattached** rather than re-copied,
   which is also the repair path when something else took the prompt over.
4. **Mark complete / Reopen** (`setEssayCompletionAction`) sets essay to `ready`
   and every prompt it answers to `complete`, via `setPromptStatus` so canonical
   siblings follow. Nothing else writes either status, so completion survives
   autosave, renaming, saving a version and restoring one. Pinned by a
   persistence test.
5. **Delete is two-step** (`?delete=1`) and states that copies and originals are
   untouched. `on delete set null` on `adapted_from_essay_id` is what makes that
   true.
6. **Autosave writes the draft in place** (`saveEssayDraft`): no version row, no
   `recomputeWorkspaceMatches` (that runs real embeddings), no `revalidatePath`.
   Versions stay snapshots the student asked for. Every route is
   `force-dynamic`, so counts are fresh anyway.
7. **Save version keeps its old behaviour**: appends an immutable version and
   rescores. It is also the only thing that refreshes the matcher's adaptation
   notes, which is why the Adapt & reuse panel is headed `Based on version <n>`.
8. **The writing textarea *is* the version form's `content` field.** No hidden
   mirror, so the editor works with JavaScript disabled.
9. **Autosave is coordinated on the server.** `saveEssayDraft` takes
   `expectedLastEditedAt` and writes only if the stored timestamp still matches,
   so a restore (which bumps it) or a delete (which removes the row) cannot be
   overwritten by a request in flight across it. The client also flushes a
   pending autosave before submitting a version, and on unmount.
10. **Reuse never triggers an automated rewrite.** There is no length-based
    detour: the only reason `ReuseHereControl` diverts to `/editor/reuse` is
    displacing another answer. Over-limit state is stated on the writing surface
    instead, as one `notice-caution` line. `redesign-parity.test.ts` guards this,
    scoped to `ReuseHereControl`'s own body.
11. **My Essays says "N answered", not "N done".** `summarizeWorkload` counts a
    prompt with an essay attached as done; the row groups deliberately separate
    *finished* from *drafted*.

### Modules

- `src/app/essay-ui.tsx`: shared essay UI (`EssayFields`, `OriginPromptFields`,
  `essayOrigin`, `essayPromptContext`, `EssayVersionHistory`, `ReuseRibbon`,
  `essayRibbonEntries`, `matchAdjustments`, `documentName`)
- `src/app/essay-dashboard.ts` (+ test): school grouping and the three row states
- `src/app/essay-guidance.ts` (+ test): live word-limit notes
- `src/app/(app)/editor/[essayId]/autosave.ts` (+ test): the autosave state
  machine, one request in flight, out-of-order responses discarded, conflict and
  deletion terminal
- `src/app/(app)/editor/[essayId]/document-surface.tsx`: the app's second client
  component
- `src/app/styles/features/editor.css`

`essayPromptContext` falls back to the *assigned* prompt when an essay has no
origin, since every example-workspace essay is in that state and "no prompt
attached" over an assigned document would be false. It never writes an origin;
the panel says `Assigned to answer` rather than `Writing for`.

---

## 8. The AI coaches

Sidebar order is **AI Coaches, Reference Check, Adapt & reuse, Version history,
Document details**. Coaches lead because they are how a student adapts a reused
essay.

Seven peers, in this deliberate order (roughly length, then substance, then
mechanics, which is why Proofread is last; it is not a ranking):
**Shorten, Lengthen, Flow, Vivid, Prompt Fit, Review, Proofread.** No "more
coaches" drawer, no primary/secondary styling. `.coach-tabs` is a
`repeat(auto-fit, minmax(6rem, 1fr))` grid so seven items wrap into equal-width
rows.

`src/lib/travila.ts` is **transport only**: `runTravilaTurn` plus the
create/send/poll/extract internals, and nothing else. It holds no profile id and
no feature logic. Every caller is a coach in `src/lib/coaches/*.ts`, and each
coach owns its own profile id, instruction, result types and parsing. Nothing in
that file throws; a failed call is an expected state the UI renders.

Each coach is an instance of a hand-copied four-file pattern (lib coach, server
action, hook, control, plus one array entry and one CSS selector). **A coach
registry was considered and rejected**: seven array entries beat an abstraction
that would have to absorb seven coaches' different target-word semantics and
phase sets.

Shared rules:

- All coaches are excerpt-anchored and run `verifyAndDedupeExcerpts`, so a coach
  cannot send a student looking for a passage they never wrote.
- Flow, Vivid and Proofread treat `findings: []` as `status: "ok"`, following
  the Lengthen convention rather than Shorten's "no valid recommendations means
  malformed", because "your essay reads cleanly" is a real answer where "shorten
  by 200 words but I found nothing to cut" is a contradiction.
- Each parser drops individual invalid entries instead of failing the whole
  response.
- **No coach writes to the essay.** The word count is unchanged after every run.

The one substantive asymmetry: **Proofread may emit replacement text**, in one
tightly scoped field. `correction` carries the minimal corrected form of the
quoted phrase and nothing more. Its instruction states that as its own rule, so
the model reads neither the general no-rewriting rule as forbidding the fix nor
the field as licence to restyle. It also enumerates what never to flag
(fragments for effect, And/But openers, conversational phrasing, deliberate
repetition, Oxford comma either way, consistent British spelling) and is told to
stay silent when unsure.

**Every hook guards the awaited server action.** If the action throws rather
than returning an error, say because the platform kills a slow request at the
route's `maxDuration` or a connection drops, an unguarded `void request(...)`
leaves the phase stuck on `"loading"` and the student staring at a spinner with
no way back but a reload. Each `request()` try/catches and falls into the error
phase. Keep it that way in any new coach.

`POLL_TIMEOUT_MS` in `travila.ts` is 48s, chosen to sit under the editor route's
`export const maxDuration = 60` with room for the pre-poll round trips and a
trailing poll. If you raise one, check the other.

There is a `ponytail:` note in `proofread-coach.ts`: `verifyAndDedupeExcerpts`
drops the later of two overlapping findings, so two genuine errors in one quoted
span collapse to one. It is mitigated by demanding a two-to-six-word excerpt.
Give it its own nesting-tolerant dedupe if students report missed second errors.

`saveEssayVersion`'s `expectedLastEditedAt` guard has no production caller. It
was kept with a `ponytail:` note: it is the correct lib-level concurrency check,
and any future apply-a-proposal path wants it.

---

## 9. Reference Check

`src/lib/reference-check.ts` finds phrases in a draft that name a specific
school, professor, course or building, so a reused essay does not arrive at the
wrong college still naming the last one. It renders as a native `<details>`
checklist, with the count in the `<summary>` ("3 references to review" or "None
detected").

Two things worth knowing before you change `reference-check-panel.tsx`:

- **It no longer hides itself when empty.** The old early return meant a student
  could not tell "checked, all clear" from "this feature does not exist".
- **Open state is frozen at mount**:
  `const [initiallyOpen] = useState(() => flags.length > 0)`. This matters.
  `live.text` changes on every keystroke, so a re-derived `open` would spring
  the section back open the moment the flag count crossed zero, overriding a
  student who had just closed it. Frozen, React never touches the attribute
  again. Do not "fix" this into a controlled prop.

---

## 10. Catalogue import and convergence

The committed catalogue is the source of truth for prompts. Live rows converge
on it through `src/lib/college-import.ts`. Three defects made that fail to
converge, and the fixes are worth understanding before touching the importer.

1. **`promptContentChanged` compares only what a student reads**, not `cycleId`
   and not `verificationStatus`. A prompt whose text was byte-identical across a
   cycle promotion counted as "unchanged", so nothing was written and it kept
   the old cycle. `upsertPrompts` now has a **fourth outcome, `reconciled`**:
   content identical but cycle or status drifted, giving a minimal two-column
   update with **no `promptChangeLog` row and no `flagged` count**, because
   nothing the student wrote or reads moved. `cycleId` was also missing from the
   content-change `set` block.
2. **`verificationStatus` was hard-coded to `"needs-review"`** on any content
   change and never written back. It now follows the catalogue record.
   **`needs-review` means "the catalogue is unsure"**; a reworded
   officially-verified prompt is more verified, not less, and the fact that it
   moved is what `promptChangeLog` and `counts.flagged` are for.
   `qa-catalogue.mts` fails the build on a `needs-review` record, so the
   catalogue can never ship one.
3. **School names that match no registry key import as `manual` with zero
   prompts.** `canonicalizeUniversityName` consults a small explicit
   `ALIASES_BY_LOWERCASE` map (Maryland, North Carolina, Texas). **A generated
   rule was tried first and rejected**: splitting on `", "` and `" at "` yields
   only those same three entries once ambiguous prefixes are dropped, so the
   generator would be more code than its output. `"University of California"` is
   deliberately absent, because seven campuses claim it and passing it through
   as a correctable manual entry beats silently picking Berkeley.

`scripts/reimport-catalogue.mts` has a real `--dry-run` reporting every rename
candidate and every drifted row, plus a write-path rename for non-canonical
names that **skips and logs loudly** if the canonical name is already taken in
that workspace, because a merge is a human decision.

```bash
node --env-file-if-exists=.env.local --experimental-strip-types \
  --import ./scripts/ts-resolve.mjs scripts/reimport-catalogue.mts [--dry-run]
```

Note the `--import ./scripts/ts-resolve.mjs`. The doc comment in that file omits
it, but `.ts` imports need it.

### `corroborated`, formerly `common-app-verified`

The old name asserted a provenance those prompts never had.
`build-catalogue.mts` maps the master record's `CORROBORATED` to it, meaning
"not read off the school's own page, but agreed on by several independent
current-cycle sources", which for some schools meant essay-consultant sites
rather than the Common App. The UI rendered that as a **"Common App"** badge,
which was false, and it collided with the separate and correct
`application_platform = 'common-app'` column. The badge is now **"✓
Corroborated"**. The tone stays `verified`, because a corroborated record still
carries prompts, must be current-cycle, and must not cite a secondary-source
URL.

`drizzle/0006_corroborated_status.sql` is the data migration, a single `UPDATE`,
safe because `verification_status` is plain `text` with no CHECK constraint and
no Postgres enum. Reversible by swapping the two values.

**Do not "fix" the count in `persistence.test.ts`'s comment** ("83 schools
publish their prompts, 12 are corroborated"). That counts *catalogue records*
and is correct. The master JSON's raw `verification_status` is 86 `VERIFIED` /
13 `CORROBORATED` / 1 `NO_SUPPLEMENT`; the numbers differ because a `VERIFIED`
school with zero prompts becomes `no-supplement-confirmed`. Both are right, with
different denominators. This has been mis-flagged as doc drift once already.

---

## 11. Limitations and open items

### Accepted on purpose

- **Mobile is usable, not polished.** No horizontal scroll at 390px on any view;
  beyond that it is unrefined by decision. Chrome's window has a 500px floor on
  macOS, so the 390px check is made in a 390px-wide iframe, which gets its own
  viewport so media queries apply.
- **12 logos are faint engraved seals** that read as a smudge at 44px (Scripps
  at 1.6% ink, UCSB, Vanderbilt, NYU, Case Western, Carleton, Williams, Pitzer,
  GWU, Claremont McKenna, Vassar, Haverford). **Five UC campuses** carry
  near-identical UC-styled seals. Colorado Boulder is 64px, the lowest in the
  set.
- **46 of 100 logos are secondary-sourced** (Wikidata/Wikipedia), mostly
  non-free fair-use uploads. Recorded, not resolved.
- **Migrations are applied by hand.** Concurrent serverless instances racing
  migrations is how a schema gets corrupted.

### Open

- **Two embedding tests fail.** They assert that re-running the model reproduces
  the committed prompt vectors to within a cosine of 0.9995; all 525 now come
  back around 0.99. The weights are byte-identical and package versions match
  the lockfile, so the drift appears to come from the ONNX runtime producing
  slightly different numbers in a different environment. Regenerating the
  vectors would pass here and fail for the next person, so they were left. The
  same effect is the likely cause of the production score audit reporting
  1130/1156 (97.8%), where all 26 differences are ±1 point with no band change.
- **`scripts/prune-onnx-binaries.mjs` is a no-op on Vercel** (`pruned 0
  platform(s)`), because npm only installs `linux/x64` there. The function is
  large regardless, and cold starts are slower for it. Static assets do not
  count toward the limit.
- **First-load bytes are +63% from the redesign** (144 KB to 236 KB gzipped), of
  which 85 KB is the two typefaces. Warm LCP +57 ms, CLS 0.00. See
  [docs/evaluation/redesign-performance.md](docs/evaluation/redesign-performance.md).
- **Sessions are stateless signed tokens**, so changing a password does not sign
  out existing sessions. Only rotating `AUTH_SECRET` does, and that signs out
  everyone.
- **axe was never run.** It is not a dependency. The specific rules were checked
  by hand against the live DOM, which is not the same thing.
- **No real essays have been evaluated.** Every number in `docs/evaluation/`
  comes from catalogue prompts standing in for essays, or from the nine demo
  essays.
- JSON export and import of a whole workspace is specified and not built.

---

## 12. Traps worth knowing

1. **Point local development at a throwaway database, not production.** The app
   reads `DATABASE_URL`, and shell env beats `.env.local` (verified against
   `@next/env`), which is what makes it safe to run `next dev` against a scratch
   database. If you use a PGlite socket server for this, set
   **`maxConnections: 200`**: the default of 1, and even 20, gives `ECONNRESET`,
   because `openDatabase` uses a 5-connection pool and the app opens around 8
   queries in parallel.
2. **A bare `"@"` alias in `vitest.config.mts` is a prefix match** and also
   rewrites `@huggingface/transformers`. It is anchored on `/^@\//`; do not
   "simplify" it back to a string key.
3. **Never clear `SCHOOL_LOGOS` before a long fetch run.** The registry is only
   rewritten at the end, so the app renders initials for the roughly 25 minutes
   it runs. The fetcher merges; clearing is unnecessary.
4. **Measure rendered pages, not error pages.** A round of "all zeros" alignment
   measurements turned out to be measuring a server-error page after a scratch
   database had died. Screenshot before trusting numbers.
5. **Group verification queries by `workspace_id`, not workspace name.** Several
   personal workspaces can all be displaying the name "My workspace", which makes
   a name-grouped query look like it is showing duplicate school rows when it is
   not.
6. **`next-env.d.ts` flips** between `.next/types` and `.next/dev/types`
   depending on whether `next dev` or `next build` ran last. It is deliberately
   kept at the build variant; do not commit the dev variant.

---

## 13. Tests and commands

```bash
./run_tests.sh   # the canonical gate: lint, typecheck, vitest, build, orchestration
```

Individually: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

Current state: **992 passing, 8 skipped, 2 failing across 49 files**, plus the
103-assertion orchestration suite passing. The two failures are the embedding
reproducibility tests described in §11.

`scripts/qa-catalogue.mts` passes, reporting
`{officially-verified: 83, corroborated: 12, no-supplement-confirmed: 5}`.

Notes on the suite:

- Embeddings are **disabled** suite-wide, so assertions hold identically with or
  without the model cached. Two files opt back in and skip themselves when the
  model is genuinely absent.
- Persistence tests run against **PGlite** applying the same committed
  migrations as production, so `jsonb`, `timestamptz`, check constraints and
  partial unique indexes are exercised on the dialect that ships. No network and
  no credentials.
- `vitest.config.mts` sets `testTimeout` to 30s. The semantic-matching test
  rescores the demo workspace four times with real embeddings and takes ~4.4s
  alone, which cleared the 5s default only until another file competed for CPU.
- `src/lib/coaches/finding-coaches.test.ts` is **table-driven over three
  coaches** rather than three copied files. The production modules stay separate
  per the existing convention; only these assertions are genuinely identical.
- The `.tsx` surfaces get **no coverage beyond the source-text guards** in
  `redesign-parity.test.ts`, because `vitest.config.mts` includes
  `src/**/*.test.ts` only.

Other commands:

```bash
npm run db:migrate                # apply committed migrations
npm run db:seed-example           # build the example workspace (20 colleges, 144 prompts, 9 essays)
npm run db:studio                 # browse the data
npm run auth:set-password -- --list
npm run logos:fetch -- --report   # re-resolve logos; merges, does not wipe
npm run logos:sheet               # contact sheets of all 100 marks
```

Deploy: `git push origin main`. Production:
<https://college-essay-organizer.vercel.app>
