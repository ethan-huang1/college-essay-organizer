import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  emailProblem,
  hashPassword,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  passwordMatches,
  passwordProblem,
  safeNextPath,
  sessionUserId,
} from "./auth";

const SECRET = "s3cret-signing-key";
const USER = "8f1a1d1e-0000-4000-8000-000000000001";
const NOW = 1_760_000_000_000;

describe("email handling", () => {
  it("normalises case and surrounding space so accounts cannot be duplicated", () => {
    expect(normalizeEmail("  Ethan@Example.COM ")).toBe("ethan@example.com");
  });

  it("rejects obvious non-addresses and accepts ordinary ones", () => {
    expect(emailProblem("ethan@example.com")).toBeNull();
    expect(emailProblem("ethan+tag@sub.example.co.uk")).toBeNull();
    for (const bad of ["", "ethan", "ethan@", "@example.com", "ethan@example", "a b@example.com"]) {
      expect(emailProblem(bad)).toBeTruthy();
    }
  });
});

describe("password policy", () => {
  it("requires a minimum length and bounds the maximum", () => {
    expect(passwordProblem("x".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
    expect(passwordProblem("x".repeat(MIN_PASSWORD_LENGTH - 1))).toBeTruthy();
    expect(passwordProblem("x".repeat(5000))).toBeTruthy();
  });
});

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await passwordMatches("correct horse battery staple", stored)).toBe(true);
    expect(await passwordMatches("correct horse battery stapl", stored)).toBe(false);
    expect(await passwordMatches("", stored)).toBe(false);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
    expect(await passwordMatches("same password", a)).toBe(true);
    expect(await passwordMatches("same password", b)).toBe(true);
  });

  it("records its parameters so they can be raised later", async () => {
    const stored = await hashPassword("whatever");
    expect(stored.split("$").slice(0, 4)).toEqual(["scrypt", "16384", "8", "1"]);
  });

  it("rejects malformed stored hashes instead of throwing", async () => {
    for (const stored of ["", "nonsense", "scrypt$1$2$3", "bcrypt$16384$8$1$aaaa$bbbb", "scrypt$0$8$1$aaaa$bbbb"]) {
      expect(await passwordMatches("whatever", stored)).toBe(false);
    }
  });
});

describe("session tokens", () => {
  it("round-trips the user id it was issued for", () => {
    expect(sessionUserId(createSessionToken(USER, SECRET, NOW), SECRET, NOW)).toBe(USER);
  });

  it("rejects a token signed with a different secret", () => {
    expect(sessionUserId(createSessionToken(USER, "other-key", NOW), SECRET, NOW)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = createSessionToken(USER, SECRET, NOW, 60);
    expect(sessionUserId(token, SECRET, NOW + 59_000)).toBe(USER);
    expect(sessionUserId(token, SECRET, NOW + 61_000)).toBeNull();
  });

  // The signature covers the user id and the expiry together, so neither can be
  // swapped for another value.
  it("rejects a token whose expiry was extended", () => {
    const token = createSessionToken(USER, SECRET, NOW, 60);
    const signature = token.split(".")[2];
    expect(sessionUserId(`${USER}.${NOW + 999_999_999}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it("rejects a token re-pointed at a different user", () => {
    const token = createSessionToken(USER, SECRET, NOW);
    const [, expiresAt, signature] = token.split(".");
    const otherUser = "8f1a1d1e-0000-4000-8000-000000000002";
    expect(sessionUserId(`${otherUser}.${expiresAt}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it("rejects malformed and missing tokens instead of throwing", () => {
    for (const token of [undefined, "", ".", "a.b", "a.b.c.d", `${USER}..sig`, `.${NOW}.sig`]) {
      expect(sessionUserId(token, SECRET, NOW)).toBeNull();
    }
    expect(sessionUserId(createSessionToken(USER, SECRET, NOW), undefined, NOW)).toBeNull();
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

  it("does not bounce back to the auth pages themselves", () => {
    expect(safeNextPath("/sign-in")).toBe("/");
    expect(safeNextPath("/sign-up")).toBe("/");
    expect(safeNextPath("/sign-in?next=%2Fschools")).toBe("/");
  });
});
