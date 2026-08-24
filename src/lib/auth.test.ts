import { describe, expect, it } from "vitest";

import {
  authRequired,
  createSessionToken,
  credentialsValid,
  isAuthConfigured,
  safeNextPath,
  sessionTokenValid,
} from "./auth";

const ENV = { username: "ethan", password: "correct horse: battery", secret: "s3cret-signing-key", isProduction: true };
const NOW = 1_760_000_000_000;

describe("credentialsValid", () => {
  it("accepts the configured pair and nothing else", () => {
    expect(credentialsValid(ENV, "ethan", "correct horse: battery")).toBe(true);
    expect(credentialsValid(ENV, "ethan", "wrong")).toBe(false);
    expect(credentialsValid(ENV, "someone", "correct horse: battery")).toBe(false);
    expect(credentialsValid(ENV, "", "")).toBe(false);
  });

  it("never accepts anything when nothing is configured", () => {
    expect(credentialsValid({ isProduction: true }, "", "")).toBe(false);
    expect(credentialsValid({ isProduction: true }, "ethan", "correct horse: battery")).toBe(false);
  });
});

describe("configuration gating", () => {
  it("requires all three values to count as configured", () => {
    expect(isAuthConfigured(ENV)).toBe(true);
    expect(isAuthConfigured({ ...ENV, secret: undefined })).toBe(false);
    expect(isAuthConfigured({ ...ENV, password: undefined })).toBe(false);
    expect(isAuthConfigured({ ...ENV, username: undefined })).toBe(false);
  });

  // Production must never serve unprotected because a variable went missing.
  it("still gates production when unconfigured, but not development", () => {
    expect(authRequired({ isProduction: true })).toBe(true);
    expect(authRequired({ isProduction: false })).toBe(false);
    expect(authRequired({ ...ENV, isProduction: false })).toBe(true);
  });
});

describe("session tokens", () => {
  it("accepts a token it just issued", () => {
    const token = createSessionToken(ENV.secret, NOW);
    expect(sessionTokenValid(token, ENV.secret, NOW)).toBe(true);
  });

  it("rejects a token signed with a different secret", () => {
    const token = createSessionToken("a-different-key", NOW);
    expect(sessionTokenValid(token, ENV.secret, NOW)).toBe(false);
  });

  it("rejects an expired token", () => {
    const token = createSessionToken(ENV.secret, NOW, 60);
    expect(sessionTokenValid(token, ENV.secret, NOW + 59_000)).toBe(true);
    expect(sessionTokenValid(token, ENV.secret, NOW + 61_000)).toBe(false);
  });

  // The signature covers the expiry, so a forged expiry must not be trusted.
  it("rejects a token whose expiry was extended", () => {
    const token = createSessionToken(ENV.secret, NOW, 60);
    const signature = token.slice(token.lastIndexOf(".") + 1);
    const forged = `${NOW + 999_999_999}.${signature}`;
    expect(sessionTokenValid(forged, ENV.secret, NOW)).toBe(false);
  });

  it("rejects malformed and missing tokens instead of throwing", () => {
    for (const token of [undefined, "", ".", "abc", "abc.def", `${NOW + 1000}.`, `.${NOW}`]) {
      expect(sessionTokenValid(token, ENV.secret, NOW)).toBe(false);
    }
    expect(sessionTokenValid(createSessionToken(ENV.secret, NOW), undefined, NOW)).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps a same-site path, including its query", () => {
    expect(safeNextPath("/schools")).toBe("/schools");
    expect(safeNextPath("/schools?school=abc&status=complete")).toBe("/schools?school=abc&status=complete");
  });

  // An open redirect on a sign-in page is a phishing primitive.
  it("refuses anything that could leave the site", () => {
    for (const path of ["//evil.com", "https://evil.com", "http://evil.com", "/\\evil.com", "\\\\evil.com", "evil.com", ""]) {
      expect(safeNextPath(path)).toBe("/");
    }
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });

  it("does not bounce back to the sign-in page itself", () => {
    expect(safeNextPath("/sign-in")).toBe("/");
    expect(safeNextPath("/sign-in?next=%2Fschools")).toBe("/");
  });
});
