import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { schema } from "./schema";

export function openDatabase(filename = path.join(process.cwd(), "data", "college-essay-organizer.sqlite")) {
  if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });

  const sqlite = new Database(filename);
  sqlite.pragma("foreign_keys = ON");
  if (filename !== ":memory:") sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });

  return { db, sqlite, close: () => sqlite.close() };
}

export type AppDatabase = ReturnType<typeof openDatabase>["db"];

export function migrateDatabase(db: AppDatabase, migrationsFolder = path.join(process.cwd(), "drizzle")) {
  migrate(db, { migrationsFolder });
}
