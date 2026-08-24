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
overnight handoff regression suite. Database, unit, and browser tests will be
added as their corresponding P0 foundation layers are implemented.
