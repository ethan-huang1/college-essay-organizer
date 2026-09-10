import { eq } from "drizzle-orm";

import type { AppDatabase } from "./db/client";
import { seedTaxonomy } from "./db/seed";
import { users, workspaces } from "./db/schema";
import { hashPassword, normalizeEmail, passwordMatches } from "./auth";

// Every user owns exactly one personal workspace, and its id is derived from
// theirs rather than looked up. That keeps workspace resolution a pure function
// of the session (no extra query per request) while the foreign key still
// cascades the workspace away with the user.
export function personalWorkspaceId(userId: string) {
  return `personal:${userId}`;
}

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super("That email address already has an account.");
    this.name = "EmailAlreadyRegisteredError";
  }
}

/**
 * Creates (or repairs) a user's empty personal workspace and its seeded category
 * taxonomy. Idempotent, so it doubles as recovery if the row ever goes missing
 * underneath a live session.
 */
export async function ensurePersonalWorkspace(db: AppDatabase, userId: string) {
  const workspaceId = personalWorkspaceId(userId);
  await db.transaction(async (tx) => {
    await tx.insert(workspaces)
      .values({ id: workspaceId, userId, kind: "personal", name: "My workspace" })
      .onConflictDoNothing();
    await seedTaxonomy(tx, workspaceId);
  });
  return workspaceId;
}

/**
 * Creates an account together with its empty personal workspace and the seeded
 * category taxonomy: a user without a workspace would be a broken account, and
 * a workspace without its taxonomy cannot classify anything.
 */
export async function createUser(db: AppDatabase, input: { email: string; password: string }) {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  const userId = crypto.randomUUID();

  // Checked up front for a clean error message; the unique index below is what
  // actually prevents a duplicate under a race.
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing.length > 0) throw new EmailAlreadyRegisteredError();

  try {
    await db.insert(users).values({ id: userId, email, passwordHash });
  } catch (error) {
    if (error instanceof Error && /users_email_unique/.test(error.message)) {
      throw new EmailAlreadyRegisteredError();
    }
    throw error;
  }

  await ensurePersonalWorkspace(db, userId);
  return { id: userId, email };
}

/**
 * Verifies a sign-in. Returns null for both an unknown email and a wrong
 * password, and deliberately still runs a hash comparison when the email is
 * unknown so the response time does not reveal whether an account exists.
 */
export async function authenticateUser(db: AppDatabase, input: { email: string; password: string }) {
  const email = normalizeEmail(input.email);
  const [user] = await db
    .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email));

  if (!user) {
    // A dummy verification against a real hash shape, so a missing account
    // costs the same as a wrong password.
    await passwordMatches(input.password, DUMMY_HASH);
    return null;
  }

  if (!(await passwordMatches(input.password, user.passwordHash))) return null;

  await db.update(users).set({ lastSignedInAt: new Date() }).where(eq(users.id, user.id));
  return { id: user.id, email: user.email };
}

/**
 * Removes an account and everything it owns.
 *
 * The database cascade does the work: workspaces.userId is `on delete
 * cascade`, and every workspace-scoped table cascades from workspaces, so one
 * delete takes the personal workspace with its schools, prompts, essays,
 * versions, assignments and matches. The shared example workspace has a null
 * userId and is deliberately outside that cascade, so deleting an account
 * never touches it.
 *
 * Returns whether a row was actually removed, so the caller can tell "deleted"
 * from "already gone" rather than assuming.
 */
export async function deleteUser(db: AppDatabase, userId: string) {
  const removed = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
  return removed.length === 1;
}

export async function findUserById(db: AppDatabase, userId: string) {
  const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, userId));
  return user ?? null;
}

// A fixed, valid scrypt hash of an unguessable value, used only to equalise
// timing for unknown emails. It is not a credential.
const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$" +
  "ZGV0ZXJtaW5pc3RpY19wbGFjZWhvbGRlcl9ub3RfYV9yZWFsX3Bhc3N3b3JkX2hhc2hfdmFsdWVfMDAwMDAw";
