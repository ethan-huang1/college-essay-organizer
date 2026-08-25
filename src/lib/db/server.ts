import { openDatabase } from "./client";

type DatabaseConnection = ReturnType<typeof openDatabase>;

const databaseGlobal = globalThis as typeof globalThis & {
  collegeEssayDatabase?: DatabaseConnection;
};

// The pool is cached per process (per warm serverless instance). Migrations are
// deliberately NOT run here: on serverless, several instances can cold-start at
// once, and racing migrations against each other is how you corrupt a schema.
// They run once at deploy time instead - see `npm run db:migrate`.
//
// Nothing is seeded on boot either: a workspace and its taxonomy are created
// when a user signs up.
export function getAppDatabase() {
  databaseGlobal.collegeEssayDatabase ??= openDatabase();
  return databaseGlobal.collegeEssayDatabase;
}
