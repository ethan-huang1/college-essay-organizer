import { migrateDatabase, openDatabase } from "./client";
import { initializePersonalWorkspace } from "./seed";

type DatabaseConnection = ReturnType<typeof openDatabase>;

const databaseGlobal = globalThis as typeof globalThis & {
  collegeEssayDatabase?: DatabaseConnection;
};

export function getAppDatabase() {
  if (!databaseGlobal.collegeEssayDatabase) {
    const connection = openDatabase();
    migrateDatabase(connection.db);
    initializePersonalWorkspace(connection.db);
    databaseGlobal.collegeEssayDatabase = connection;
  }

  return databaseGlobal.collegeEssayDatabase;
}
