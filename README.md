# College Essay Organizer

A private workspace for managing the supplemental-essay workload of a real
college application list — built around the observation that a student applying
to 15–25 schools faces 100+ prompts, and that a large share of them are asking
variations of the same handful of questions.

The product exists to make that overlap visible, so the student builds **a
reusable library of essays instead of starting from scratch at every college**.

![Overview dashboard showing progress by school and by category](docs/overview.png)

## The model

```
Schools → Prompts → Essay categories → Essays → Reuse opportunities
```

| View | What it answers |
|---|---|
| **Overview** (`/`) | How much work is there, how much is done, and where can one essay do double duty? |
| **All prompts** (`/schools`) | Every prompt grouped by school, one scannable row each, filterable by school, category, status, or text. |
| **Categories** (`/families`) | The same prompts grouped by the ten-category taxonomy — *Intellectual Curiosity — 14 prompts across 11 schools* — so cross-school overlap is obvious. |
| **My essays** (`/essays`) | The essay library: drafts, immutable versions, and which prompts each essay answers. |
| **Reuse** (`/reuse`) | Per essay: prompts it already answers, prompts it could answer, and prompts it must **not** be reused for. |

![Categories view grouping prompts from different schools under one theme](docs/categories.png)

## Two workspaces

Switch between them in the sidebar's Workspace panel. They never share records.

- **My workspace** — starts empty and private. You add your own colleges with
  **Add a college**, which imports that school's current-cycle prompts from the
  curated registry and classifies them automatically. Colleges can be renamed or
  removed (with a confirmation step) at any time.
- **Example workspace** — a reproducible demo seeded by running the *same* import
  pipeline over 19 real schools, plus 7 clearly labelled sample essays: ~112
  prompts, all ten categories, and real reuse opportunities. "Reset example"
  rebuilds it from scratch and never touches your own work.

## Quick start

Requires Node.js 20+ and a Postgres database. [Neon](https://neon.tech) is what
this is built and deployed against; its free tier is enough.

```bash
npm install
cp .env.example .env.local     # paste your Neon pooled connection string
npm run db:migrate             # apply the committed migrations
npm run dev                    # http://localhost:3000
```

`.env.local` is gitignored. See [Access control](#access-control) for the
`AUTH_*` variables, which are optional locally and required in production.

The personal workspace and its taxonomy are created automatically on first
request, so a freshly migrated database opens to an empty workspace ready for
its first college.

Useful scripts: `npm run db:generate` (after an intentional schema change),
`npm run db:studio` (browse the data), `npm run db:migrate` (apply migrations).

## Access control

The app is guarded by a single shared account with a real sign-in page at
`/sign-in`, not the browser's Basic-auth dialog. Credentials are exchanged for
an HMAC-signed session cookie; the gate lives in [`src/proxy.ts`](src/proxy.ts)
(Next.js 16 renamed `middleware.ts` to `proxy.ts`) and the logic in
[`auth.ts`](src/lib/auth.ts).

```bash
AUTH_USERNAME="you"
AUTH_PASSWORD="a long random string"
AUTH_SECRET="another long random string"   # signs the session cookie
```

Generate the secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Behaviour worth knowing:

- **It fails closed in production.** If any of the three is missing, every
  route redirects to a sign-in page that explains it is unconfigured, rather
  than serving your essays unprotected. A missing environment variable is the
  likeliest way this protection would silently disappear.
- **Local development is not gated** while the variables are unset, so `npm run
  dev` needs no setup. Set them locally and the gate applies there too.
- Sessions are **stateless**: the cookie carries its own expiry (14 days) and a
  signature over it, so nothing is stored server-side. Consequently individual
  sessions cannot be revoked — rotating `AUTH_SECRET` signs everyone out.
- The cookie is `httpOnly`, `sameSite=lax`, and `secure` in production.
- The sign-in page renders under a deliberately minimal root layout, so it
  works even when the database is unreachable. The sidebar and its workspace
  queries live in the `(app)` route group's layout, behind the gate.
- The post-sign-in redirect is validated to be a same-site path, so the page
  cannot be turned into an open redirect.

This is one shared credential, not a user system: anyone who signs in can read
and edit everything in both workspaces. That matches the product today — one
student, one private deployment — but it is the thing to replace first if this
is ever shared. There is also no rate limiting on the sign-in form; the
protection is the password's entropy, so use a long random one.

## How prompts get into the app

Prompt text is **not** scraped at runtime and not generated by a model. It comes
from a committed, typed registry of school records under
[`src/lib/retrieval/sources/`](src/lib/retrieval/sources/), each one researched
against that institution's own admissions pages and carrying its source URL,
cycle label, and a note explaining what was and was not confirmed.

Every school in the 100-school picker has exactly one outcome, and the
distinction between them is deliberately preserved rather than flattened:

| Outcome | Schools | Meaning |
|---|---|---|
| `officially-verified` | 46 | Exact current-cycle wording published on an official page. |
| `no-supplement-confirmed` | 12 | Officially confirmed to require no supplement. |
| `needs-review` | 36 | Official sources checked, but exact wording was not publicly available (portal-only text, missing cycle label, or incomplete conditional coverage). Imports **zero** prompts rather than guessing. |
| `previous-cycle` | 6 | Official wording from 2025–26 only. Imported as planning material, labelled in the UI, and excluded from current-cycle completion counts. |

255 prompts are curated in total. A school that isn't in the registry can still
be added by hand — it just arrives with no prompts and a note saying so.

Re-importing a school is idempotent: prompts are matched on a stable
`externalRef`, unchanged prompts are left alone, and a prompt whose official
wording has changed is flagged `needs-review` with the previous text recorded in
`prompt_change_log`.

## Classification and matching are deterministic

There is no LLM in the request path. Both systems are pure functions that are
fully explainable from their inputs, which is what makes them testable and what
lets the UI show *why* it suggested something.

- **Classification** ([`classification.ts`](src/lib/classification.ts)) scores
  prompt text against keyword sets for the ten categories and assigns one
  primary plus up to three secondary categories. Any classification can be
  overridden per prompt, which is recorded as a manual override.
- **Matching** ([`matching.ts`](src/lib/matching.ts)) scores each essay against
  each prompt on category overlap, word-count fit, and
  institution-specificity risk — independently, so a strong thematic match with
  another school's name in it is still correctly downgraded. It returns a score,
  the matched themes, the missing requirements, and one of
  `ready-to-reuse` / `minor-adaptation` / `major-adaptation` / `new-response`.

An essay that names one school is flagged **high risk** against a different
school's fit prompt and surfaced as "Do not reuse here" rather than quietly
hidden.

## Architecture

Next.js App Router with React Server Components on Postgres (Drizzle ORM),
deployed on Vercel with Neon. Every mutation is a server action driven by a
plain `<form>`; the only client component in the app is the one that highlights
the active sidebar link. Progressive disclosure is done with `<details>` and URL
parameters, so the interface works without JavaScript.

Nothing is prerendered — every route reads the workspace cookie and the
database — so the root layout declares `force-dynamic` and the build needs no
database connection.

```
src/app/
  layout.tsx            minimal root: no database, so /sign-in always renders
  sign-in/page.tsx      the sign-in form
  proxy.ts (src/)       the auth gate, in front of every route
  (app)/layout.tsx      sidebar navigation, per-school progress, workspace switch
  (app)/page.tsx        Overview dashboard
  (app)/[section]/      All prompts / Categories / My essays / Reuse
  prompt-ui.tsx         the shared prompt row used by two views
  *-actions.ts          server actions (auth, college, school, prompt, essay)
src/lib/
  retrieval/            typed school records + registry + validation
  college-import.ts     the single "Add College" entry point
  classification.ts     deterministic prompt classifier
  matching.ts           deterministic essay↔prompt scorer
  reuse.ts              recomputes every match for a workspace
  progress.ts           derived UI numbers (nothing persisted)
  essays.ts             essay CRUD with immutable versions
  db/                   Drizzle schema, migrations, seeds, demo workspace
    client.ts           Neon pool for the app, PGlite for tests
    server.ts           cached pool + one-time workspace initialization
```

**The data layer is entirely async.** No Postgres driver is synchronous, so
every function that touches the database returns a promise, all the way up
through the server actions. An un-awaited call here is silent data loss — the
action returns, the page revalidates against stale rows, and on serverless the
instance can be frozen mid-write — so `no-floating-promises` and
`await-thenable` are enabled as errors. Worth knowing: those rules do **not**
recognise a Drizzle query builder as thenable, so they cannot catch an
un-awaited builder; the persistence tests are what covers that.

**Workspace isolation** is enforced at the data layer, not the UI: every query
is scoped by `workspaceId`, and every mutation verifies the record belongs to
the active workspace before writing. Attempting to link a personal prompt to a
demo category throws.

**Derived, never duplicated.** Progress, completion, and reuse counts are
recomputed from the snapshot on every render
([`progress.ts`](src/lib/progress.ts)) rather than stored, so they cannot go
stale. Completion counts deliberately cover current-cycle prompts only.

## Data model

15 tables under [`src/lib/db/schema.ts`](src/lib/db/schema.ts). The parts worth
knowing:

- `essays` holds current content; `essay_versions` is append-only. Editing never
  overwrites — it writes a new version, and restoring an old one also writes a
  new version, so history is never destroyed.
- `prompt_family_links` / `essay_family_links` carry one primary plus many
  secondary categories, with a partial unique index enforcing "at most one
  primary".
- `essay_prompt_matches` is a full recompute, not an incremental cache, so a
  stale match cannot survive an edit.
- `assigned_essay_responses` has a unique index on `prompt_id`: a prompt has at
  most one current response.

## Verification

```bash
./run_tests.sh
```

Runs ESLint (including type-aware promise rules), a strict TypeScript check,
the Vitest suite (72 tests), a production build, and the 80-test
overnight-orchestration suite.

The persistence tests run against **PGlite** — real Postgres compiled to WASM,
in-process — applying the same committed migrations as production. So `jsonb`,
`timestamptz`, check constraints and partial unique indexes are all exercised
on the dialect that actually ships, while each test still gets a throwaway
database. It needs no network and no credentials.

Individually: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Limitations and known gaps

Recorded honestly rather than papered over:

- **The classifier does not recognise real "why us" prompts.** Its keywords
  match organizer-side phrasing ("why us", "our campus") that actual
  supplements never use — they say "Why are you applying to Nursing". Those
  prompts currently land in *Community & Contribution*, and the *Why This
  School / Program* category will stay empty in a personal workspace until the
  keyword list is widened. Not fixed yet because it changes classifications for
  every existing prompt.
- **36 of 100 schools import no prompts** (`needs-review` above). This is a
  data-availability limit, not a bug, and each record says exactly what was
  unresolved.
- Single user and a single shared credential rather than accounts; no
  multi-device sync, no password reset, no rate limiting on sign-in. Workspaces
  are separated by a cookie, not by identity, so everyone who signs in shares
  the same personal workspace.
- Migrations are applied manually (`npm run db:migrate`), deliberately not on
  boot: concurrent serverless instances racing migrations is how a schema gets
  corrupted.
- The editing-suggestion workflow (prompt-fit / clarity / concision suggestions
  with individual accept and reject) is specified but not built.
- JSON export/import of a whole workspace is specified but not built.
- Layout is verified at 1440 / 1200 / 1024 / 768 px; 390 px has not been
  verified on a real device.

## Where AI would slot in later

The deterministic layer is deliberately shaped so a model could be added
*beside* it, never underneath it:

- `classifyText()` and `scoreMatch()` are pure functions with explicit return
  shapes. A model-backed implementation could return the same shape, and the
  `classificationSource` column already distinguishes `deterministic` from
  `manual` — a third value is the only schema change needed.
- Prompt retrieval is already separated into typed source records with citations,
  so a model could *propose* a record for human confirmation without ever
  writing directly to the prompt table.
- Editing suggestions were specified from the start as discrete accept/reject
  items that create new immutable versions, which is what makes model-generated
  edits reviewable instead of destructive.

Anything model-generated should stay clearly labelled and never silently
replace a cited official prompt.

## Project documents

- [MVP_SPEC.md](MVP_SPEC.md) — the product specification this is built against.
- [AGENT_HANDOFF.md](AGENT_HANDOFF.md) — live status, decisions, and what's next.
- [OVERNIGHT_TASK.md](OVERNIGHT_TASK.md) — operating rules for autonomous runs.
- [CLAUDE.md](CLAUDE.md) — repo instructions for coding agents.
