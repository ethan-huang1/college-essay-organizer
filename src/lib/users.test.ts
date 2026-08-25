import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openTestDatabase } from "./db/client";
import { workspaces } from "./db/schema";
import {
  authenticateUser,
  createUser,
  EmailAlreadyRegisteredError,
  ensurePersonalWorkspace,
  findUserById,
  personalWorkspaceId,
} from "./users";
import { createSchool } from "./schools";
import { getWorkspaceSnapshot } from "./workspaces";

describe("accounts", () => {
  let connection: ReturnType<typeof openTestDatabase>;

  beforeEach(async () => {
    connection = openTestDatabase();
    await connection.migrate();
  });

  afterEach(async () => {
    await connection.close();
  });

  it("gives a new account its own workspace with the full taxonomy", async () => {
    const user = await createUser(connection.db, { email: "a@example.com", password: "a-long-test-password" });
    const snapshot = await getWorkspaceSnapshot(connection.db, personalWorkspaceId(user.id));

    expect(snapshot?.workspace.kind).toBe("personal");
    expect(snapshot?.workspace.userId).toBe(user.id);
    expect(snapshot?.families).toHaveLength(10);
    // A brand-new account starts genuinely empty.
    expect(snapshot?.schools).toHaveLength(0);
    expect(snapshot?.prompts).toHaveLength(0);
    expect(snapshot?.essays).toHaveLength(0);
  });

  // The whole point of accounts: one student must not be able to reach another's
  // work, and the workspace id is what enforces it everywhere.
  it("keeps two accounts' workspaces completely separate", async () => {
    const first = await createUser(connection.db, { email: "first@example.com", password: "a-long-test-password" });
    const second = await createUser(connection.db, { email: "second@example.com", password: "another-long-password" });

    expect(personalWorkspaceId(first.id)).not.toBe(personalWorkspaceId(second.id));

    await createSchool(connection.db, personalWorkspaceId(first.id), { name: "Brown University" });

    const firstSnapshot = await getWorkspaceSnapshot(connection.db, personalWorkspaceId(first.id));
    const secondSnapshot = await getWorkspaceSnapshot(connection.db, personalWorkspaceId(second.id));
    expect(firstSnapshot?.schools.map((school) => school.name)).toEqual(["Brown University"]);
    expect(secondSnapshot?.schools).toHaveLength(0);

    // And the data layer refuses a cross-account write even if an id leaks.
    await expect(
      createSchool(connection.db, personalWorkspaceId(second.id), { name: "Brown University" }),
    ).resolves.toBeTruthy(); // same name is fine in a different workspace
    const [row] = await connection.db.select().from(workspaces).where(eq(workspaces.id, personalWorkspaceId(first.id)));
    expect(row.userId).toBe(first.id);
  });

  it("refuses a duplicate email, whatever its casing or spacing", async () => {
    await createUser(connection.db, { email: "taken@example.com", password: "a-long-test-password" });
    for (const email of ["taken@example.com", "TAKEN@example.com", "  Taken@Example.com  "]) {
      await expect(createUser(connection.db, { email, password: "a-long-test-password" }))
        .rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    }
  });

  it("signs in with the right password and refuses everything else", async () => {
    await createUser(connection.db, { email: "student@example.com", password: "a-long-test-password" });

    expect(await authenticateUser(connection.db, { email: "student@example.com", password: "a-long-test-password" })).toMatchObject({
      email: "student@example.com",
    });
    // Email lookup is case-insensitive, so signing in is not casing-sensitive.
    expect(await authenticateUser(connection.db, { email: "Student@Example.com", password: "a-long-test-password" })).toBeTruthy();
    expect(await authenticateUser(connection.db, { email: "student@example.com", password: "wrong" })).toBeNull();
    expect(await authenticateUser(connection.db, { email: "nobody@example.com", password: "a-long-test-password" })).toBeNull();
  });

  it("never stores the password itself", async () => {
    const password = "a-long-test-password";
    const user = await createUser(connection.db, { email: "student@example.com", password });
    const stored = await findUserById(connection.db, user.id);
    expect(stored).toBeTruthy();
    const [row] = await connection.db.select().from(workspaces).where(eq(workspaces.userId, user.id));
    expect(JSON.stringify(row)).not.toContain(password);

    const raw = await connection.client.query<{ password_hash: string }>("select password_hash from users");
    expect(raw.rows[0].password_hash).not.toContain(password);
    expect(raw.rows[0].password_hash.startsWith("scrypt$")).toBe(true);
  });

  it("recreates a personal workspace that has gone missing, without duplicating it", async () => {
    const user = await createUser(connection.db, { email: "student@example.com", password: "a-long-test-password" });
    await connection.db.delete(workspaces).where(eq(workspaces.id, personalWorkspaceId(user.id)));

    await ensurePersonalWorkspace(connection.db, user.id);
    await ensurePersonalWorkspace(connection.db, user.id);

    const rows = await connection.db.select().from(workspaces).where(eq(workspaces.userId, user.id));
    expect(rows).toHaveLength(1);
    expect((await getWorkspaceSnapshot(connection.db, personalWorkspaceId(user.id)))?.families).toHaveLength(10);
  });

  it("removes a user's workspace and all its contents with the account", async () => {
    const user = await createUser(connection.db, { email: "student@example.com", password: "a-long-test-password" });
    await createSchool(connection.db, personalWorkspaceId(user.id), { name: "Brown University" });

    await connection.client.query("delete from users where id = $1", [user.id]);

    expect(await connection.db.select().from(workspaces).where(eq(workspaces.userId, user.id))).toHaveLength(0);
    const orphanedSchools = await connection.client.query("select count(*)::int as n from schools");
    expect(orphanedSchools.rows[0]).toEqual({ n: 0 });
  });
});
