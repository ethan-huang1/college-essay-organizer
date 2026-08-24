import { openDatabase } from "./client";
import { initializePersonalWorkspace } from "./seed";

type DatabaseConnection = ReturnType<typeof openDatabase>;

const databaseGlobal = globalThis as typeof globalThis & {
  collegeEssayDatabase?: DatabaseConnection;
  collegeEssayReady?: Promise<void>;
};

// The pool is cached per process (per warm serverless instance). Migrations are
// deliberately NOT run here: on serverless, several instances can cold-start at
// once, and racing migrations against each other is how you corrupt a schema.
// They run once at deploy time instead - see `npm run db:migrate`.
export function getAppDatabase() {
  databaseGlobal.collegeEssayDatabase ??= openDatabase();
  return databaseGlobal.collegeEssayDatabase;
}

// The whole app assumes an empty personal workspace and its seeded taxonomy
// exist. Both inserts are idempotent, so this runs once per warm instance
// rather than once per request - and clears itself on failure so a transient
// connection error is retried instead of cached forever.
//
// `force` re-runs it after the cached promise has already resolved. That
// matters when the row disappears underneath a live process - a restored
// backup, a switched Neon branch, a manually dropped workspace - which would
// otherwise hard-fail every request until the process recycled.
export async function getReadyDatabase(options: { force?: boolean } = {}) {
  const connection = getAppDatabase();
  if (options.force) databaseGlobal.collegeEssayReady = undefined;
  databaseGlobal.collegeEssayReady ??= initializePersonalWorkspace(connection.db).catch((error) => {
    databaseGlobal.collegeEssayReady = undefined;
    throw error;
  });
  await databaseGlobal.collegeEssayReady;
  return connection;
}
