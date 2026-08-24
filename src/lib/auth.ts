import { createHmac, timingSafeEqual } from "node:crypto";

// A single shared credential guarding the whole app, exchanged for a signed
// session cookie so the student sees a real sign-in page instead of the
// browser's native Basic-auth dialog.
//
// The session is stateless: the cookie carries its own expiry and an HMAC over
// it, so nothing is stored server-side. That means there is no way to revoke an
// individual session short of rotating AUTH_SECRET, which is an acceptable
// trade for an app with exactly one principal and no accounts.
export const SESSION_COOKIE = "college-essay-session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export type AuthEnv = {
  username?: string;
  password?: string;
  secret?: string;
  isProduction: boolean;
};

function equals(a: string, b: string) {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // timingSafeEqual throws on a length mismatch, so lengths are compared first.
  // That leaks length, which is not worth defending here.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function isAuthConfigured(env: AuthEnv) {
  return Boolean(env.username && env.password && env.secret);
}

/**
 * Whether the gate applies at all. Production always requires configuration —
 * see `isAuthConfigured` — while development runs ungated until the variables
 * are set, so `npm run dev` needs no setup.
 */
export function authRequired(env: AuthEnv) {
  return env.isProduction || isAuthConfigured(env);
}

export function credentialsValid(env: AuthEnv, username: string, password: string) {
  if (!env.username || !env.password) return false;
  // Both are always compared so a wrong username costs the same as a wrong
  // password.
  const userMatches = equals(username, env.username);
  const passwordMatches = equals(password, env.password);
  return userMatches && passwordMatches;
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(secret: string, nowMs: number, maxAgeSeconds = SESSION_MAX_AGE_SECONDS) {
  const expiresAt = String(nowMs + maxAgeSeconds * 1000);
  return `${expiresAt}.${sign(expiresAt, secret)}`;
}

export function sessionTokenValid(token: string | undefined, secret: string | undefined, nowMs: number) {
  if (!token || !secret) return false;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;

  const expiresAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  // Verify the signature before trusting the expiry it claims.
  if (!equals(signature, sign(expiresAt, secret))) return false;

  const expiresAtMs = Number(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
}

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
  return raw === "/sign-in" || raw.startsWith("/sign-in?") ? "/" : raw;
}
