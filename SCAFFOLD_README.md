# College Essay Organizer scaffold

This checkpoint contains the local Next.js application shell for the College
Essay Organizer MVP. Product requirements and implementation priorities live in
`MVP_SPEC.md`; overnight operating rules live in `OVERNIGHT_TASK.md`.

## Local setup

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. No API key, account, database service, or external
resource is required for this scaffold.

## Verification

Run the repository's canonical verification command:

```bash
./run_tests.sh
```

It runs ESLint, strict TypeScript checking, a production build, and the existing
overnight handoff regression suite. It also runs the local SQLite persistence
tests, which apply the real migration to an isolated in-memory database.

## Local data foundation

The typed Drizzle schema is in `src/lib/db/schema.ts`; generated SQLite
migrations are committed under `drizzle/`. The normal local database path is
`data/college-essay-organizer.sqlite`, which is ignored by Git.

```bash
npm run db:migrate   # create or update the local database
npm run db:generate  # generate a migration after an intentional schema change
```

The seed layer creates the empty personal workspace independently from the
clearly labeled synthetic demo workspace. `resetDemoWorkspace` replaces only
demo-owned records; it never deletes personal data.

Browser workflow tests remain later P0 work.
