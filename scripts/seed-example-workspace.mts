/**
 * Builds (or rebuilds) the shared example workspace.
 *
 * Switching to the example workspace in the UI only selects it - it never
 * seeds, because a button every new user is told to press must not delete and
 * reimport 20 colleges out from under whoever else is reading them. Seeding is
 * this out-of-band script instead.
 *
 * It runs the real Add College pipeline over DEMO_SCHOOLS, so the example holds
 * genuine cited prompts; only the nine essays are written for the demo, and each
 * is labelled so it cannot be mistaken for a student's own writing.
 *
 * Destructive for the example workspace only. Personal workspaces are untouched.
 *
 *   npm run db:seed-example
 */
import { openDatabase } from "../src/lib/db/client.ts";
import { resetDemoWorkspace } from "../src/lib/db/demo-workspace.ts";

const { db, close } = openDatabase();
try {
  const summary = await resetDemoWorkspace(db);
  console.log(
    `Example workspace rebuilt: ${summary.schools} schools, ${summary.prompts} prompts, ` +
    `${summary.essays} essays, ${summary.assignments} assignments, ${summary.matches} matches.`,
  );
} finally {
  await close();
}
