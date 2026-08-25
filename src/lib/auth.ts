import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

// Accounts are real now: anyone can sign up, each user owns exactly one private
// workspace, and the session cookie carries which user it belongs to.
//
// The session is still stateless - the cookie holds the user id, an expiry, and
// an HMAC over both - so verifying it needs no database round-trip and the auth
// gate can run before any query. The trade is that a single session cannot be
// revoked; rotating AUTH_SECRET signs everyone out.
export const SESSION_COOKIE = "college-essay-session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 200;
const MAX_EMAIL_LENGTH = 254;

// scrypt is in node:crypto, so a strong password KDF needs no dependency. The
// parameters are stored in the hash so they can be raised later without
// invalidating existing passwords.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

function constantTimeEqual(a: Buffer, b: Buffer) {
  // timingSafeEqual throws on a length mismatch, so lengths are compared first.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ------------------------------------------------------------- credentials */

/** Lower-cased and trimmed, so uniqueness and lookup are case-insensitive. */
export function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

export function emailProblem(email: string) {
  if (!email) return "Enter your email address.";
  if (email.length > MAX_EMAIL_LENGTH) return "That email address is too long.";
  // Deliberately permissive: the only reliable email validation is sending one.
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(email)) return "That doesn't look like an email address.";
  return null;
}

export function passwordProblem(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return "That password is too long.";
  return null;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function passwordMatches(password: string, stored: string) {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltPart, keyPart] = parts;
  const options = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Object.values(options).every((value) => Number.isInteger(value) && value > 0)) return false;

  const expected = Buffer.from(keyPart, "base64url");
  let derived: Buffer;
  try {
    derived = await scrypt(password, Buffer.from(saltPart, "base64url"), expected.length, options);
  } catch {
    return false;
  }
  return constantTimeEqual(derived, expected);
}

/* ----------------------------------------------------------------- sessions */

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(
  userId: string,
  secret: string,
  nowMs: number,
  maxAgeSeconds = SESSION_MAX_AGE_SECONDS,
) {
  const payload = `${userId}.${nowMs + maxAgeSeconds * 1000}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** The signed-in user's id, or null if the cookie is missing, forged, or expired. */
export function sessionUserId(token: string | undefined, secret: string | undefined, nowMs: number) {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAt, signature] = parts;
  if (!userId || !expiresAt) return null;

  // Verify the signature before trusting either value it carries.
  if (!constantTimeEqual(Buffer.from(signature, "utf8"), Buffer.from(sign(`${userId}.${expiresAt}`, secret), "utf8"))) {
    return null;
  }

  const expiresAtMs = Number(expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return null;
  return userId;
}

/* -------------------------------------------------------------- navigation */

/**
 * Sanitises the post-sign-in redirect target. Only a path on this site is
 * allowed: anything protocol-relative, absolute, or otherwise off-site would
 * turn the sign-in page into an open redirect.
 */
export function safeNextPath(raw: string | null | undefined) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  // A backslash can be normalised to a forward slash by some clients, which
  // would smuggle "/\\evil.com" past the checks above.
  if (raw.includes("\\")) return "/";
  const path = raw.split("?")[0];
  return path === "/sign-in" || path === "/sign-up" ? "/" : raw;
}
