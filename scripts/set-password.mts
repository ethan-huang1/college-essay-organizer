/**
 * Sets an account's password directly, for when the owner is locked out.
 *
 * This is the recovery path that actually works for this deployment: a
 * self-service "forgot password" email needs a mail provider, and none is
 * configured. Running this requires the database connection string, so anyone
 * who can run it could already read and rewrite the whole database - it grants
 * no access that was not already implied.
 *
 * The new password is read from the terminal rather than taken as an argument,
 * so it never lands in shell history or in the process list where `ps` would
 * show it.
 *
 *   npm run auth:set-password -- ehuang547@gmail.com
 *   npm run auth:set-password -- --list
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Writable } from "node:stream";

import { eq } from "drizzle-orm";

import { MIN_PASSWORD_LENGTH, hashPassword, normalizeEmail, passwordProblem } from "../src/lib/auth.ts";
import { openDatabase } from "../src/lib/db/client.ts";
import { users } from "../src/lib/db/schema.ts";

const args = process.argv.slice(2);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run this with --env-file=.env.local, or use npm run auth:set-password.");
  process.exit(2);
}

const { db, close } = openDatabase();

try {
  const accounts = await db.select({ id: users.id, email: users.email, createdAt: users.createdAt })
    .from(users)
    .execute();

  if (args.includes("--list") || args.length === 0) {
    console.log(`${accounts.length} account(s) in this database:\n`);
    for (const account of [...accounts].sort((a, b) => a.email.localeCompare(b.email))) {
      console.log(`  ${account.email}   created ${new Date(account.createdAt).toISOString().slice(0, 10)}`);
    }
    console.log("\nTo set one's password:  npm run auth:set-password -- <email>");
    process.exit(0);
  }

  const email = normalizeEmail(args[0]);
  const account = accounts.find((candidate) => candidate.email === email);
  if (!account) {
    console.error(`No account with the email ${email}.`);
    console.error("Run with --list to see which accounts exist.");
    process.exit(1);
  }

  /**
   * Reads the new password twice.
   *
   * A terminal gets a masked prompt. A pipe gets its lines read up front,
   * because readline closes the moment a piped stream ends and a second
   * question against a closed interface throws - which is how this was first
   * written, and it failed on the confirmation step.
   */
  const readTwice = async (): Promise<[string, string]> => {
    if (!stdin.isTTY) {
      const chunks: Buffer[] = [];
      for await (const chunk of stdin) chunks.push(chunk as Buffer);
      const lines = Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
      return [(lines[0] ?? "").trim(), (lines[1] ?? "").trim()];
    }

    // Masking without patching process.stdout globally: readline writes its
    // echo to whatever stream it is given, so it gets a proxy that drops writes
    // while a password is being typed.
    let muted = false;
    const echo = new Writable({
      write(chunk, _encoding, callback) {
        if (!muted) stdout.write(chunk as Buffer);
        callback();
      },
    });
    const prompt = createInterface({ input: stdin, output: echo, terminal: true });
    const ask = async (question: string) => {
      stdout.write(question);
      muted = true;
      const answer = await prompt.question("");
      muted = false;
      stdout.write("\n");
      return answer.trim();
    };
    try {
      return [
        await ask(`New password for ${email} (at least ${MIN_PASSWORD_LENGTH} characters): `),
        await ask("Type it again: "),
      ];
    } finally {
      prompt.close();
    }
  };

  const [first, second] = await readTwice();

  const problem = passwordProblem(first);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  if (first !== second) {
    console.error("The two entries did not match. Nothing was changed.");
    process.exit(1);
  }

  await db.update(users)
    .set({ passwordHash: await hashPassword(first) })
    .where(eq(users.id, account.id))
    .execute();

  console.log(`\nPassword updated for ${email}.`);
  // Sessions are stateless signed tokens rather than database rows, so existing
  // ones stay valid until they expire. Rotating AUTH_SECRET is what invalidates
  // them, and that would sign everyone out.
  console.log("Existing sessions are unaffected; sign in with the new password.");
} finally {
  await close();
}
