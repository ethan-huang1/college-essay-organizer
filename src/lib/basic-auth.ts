import { timingSafeEqual } from "node:crypto";

// HTTP Basic auth in front of the whole app. This deployment has exactly one
// principal - there are no accounts, and both workspaces belong to whoever
// holds the credentials - so a single shared gate is the appropriate control.
// It is NOT a per-user authorization model: anyone who authenticates can read
// and edit everything.
export const BASIC_AUTH_REALM = "College Essay Organizer";

export type AuthResult =
  | { ok: true }
  | { ok: false; reason: "unauthenticated" }
  | { ok: false; reason: "unconfigured" };

function equals(a: string, b: string) {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // timingSafeEqual throws on length mismatch, so compare lengths first. That
  // does leak credential length, which is not worth defending here.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Decides whether a request may proceed.
 *
 * Deliberately fails *closed* in production: if the credentials are not
 * configured, every request is refused rather than served without a gate. A
 * missing environment variable is the most likely way this protection would
 * silently disappear, so it must be loud instead. Development skips the gate so
 * local work needs no setup.
 */
export function checkBasicAuth(
  authorizationHeader: string | null,
  env: { user?: string; password?: string; isProduction: boolean },
): AuthResult {
  const { user, password, isProduction } = env;

  if (!user || !password) {
    return isProduction ? { ok: false, reason: "unconfigured" } : { ok: true };
  }

  const [scheme, encoded] = (authorizationHeader ?? "").split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) return { ok: false, reason: "unauthenticated" };

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return { ok: false, reason: "unauthenticated" };
  }

  // Only the first colon separates the two fields, so a password may contain
  // colons (RFC 7617).
  const separator = decoded.indexOf(":");
  if (separator === -1) return { ok: false, reason: "unauthenticated" };
  const suppliedUser = decoded.slice(0, separator);
  const suppliedPassword = decoded.slice(separator + 1);

  // Both compared unconditionally so a wrong username costs the same as a
  // wrong password.
  const userMatches = equals(suppliedUser, user);
  const passwordMatches = equals(suppliedPassword, password);
  return userMatches && passwordMatches ? { ok: true } : { ok: false, reason: "unauthenticated" };
}
