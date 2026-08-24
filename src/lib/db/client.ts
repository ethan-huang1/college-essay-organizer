import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { migrate as migrateNode } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import path from "node:path";

import { schema } from "./schema";

// Postgres everywhere: Neon in development and production, PGlite in tests.
// Both are the same dialect running the same committed migrations, so a test
// cannot pass against an engine the application never uses.
//
// Every data-layer call is async. Unlike better-sqlite3, no Postgres driver is
// synchronous, which is why nothing below (or above it) returns a plain value.
export type AppDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

function connectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and paste your Neon connection string.",
    );
  }
  return url;
}

/**
 * A pooled connection to the configured Postgres database. `max` is deliberately
 * small: on serverless each instance keeps its own pool, so the limit that
 * matters is the provider's, not this process's.
 *
 * Each connection carries its own migrator so nothing has to sniff the driver
 * at runtime.
 */
export function openDatabase(url = connectionString()) {
  const pool = new Pool({
    connectionString: url,
    max: 5,
    // Neon closes idle connections itself; releasing ours first stops a warm
    // serverless instance from holding a dead socket.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });
  const db = drizzleNode(pool, { schema });
  return {
    db: db as AppDatabase,
    pool,
    migrate: (migrationsFolder = MIGRATIONS_FOLDER) => migrateNode(db, { migrationsFolder }),
    close: () => pool.end(),
  };
}

/**
 * An isolated in-process Postgres for tests: real Postgres compiled to WASM, so
 * jsonb, timestamptz, check constraints and partial unique indexes behave as
 * they will in production, while each test still gets a throwaway database.
 */
export function openTestDatabase() {
  const client = new PGlite();
  const db = drizzlePglite(client, { schema });
  return {
    db: db as AppDatabase,
    client,
    migrate: (migrationsFolder = MIGRATIONS_FOLDER) => migratePglite(db, { migrationsFolder }),
    close: () => client.close(),
  };
}
