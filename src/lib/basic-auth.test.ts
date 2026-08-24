import { describe, expect, it } from "vitest";

import { checkBasicAuth } from "./basic-auth";

const CONFIGURED = { user: "ethan", password: "correct horse: battery", isProduction: true };

function header(user: string, password: string) {
  return `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;
}

describe("checkBasicAuth", () => {
  it("accepts the configured credentials", () => {
    expect(checkBasicAuth(header("ethan", "correct horse: battery"), CONFIGURED)).toEqual({ ok: true });
  });

  it("keeps colons in the password", () => {
    // RFC 7617: only the first colon separates the fields.
    expect(checkBasicAuth(header("ethan", "a:b:c"), { ...CONFIGURED, password: "a:b:c" })).toEqual({ ok: true });
  });

  it("rejects a wrong password, a wrong user, and a missing header", () => {
    expect(checkBasicAuth(header("ethan", "wrong"), CONFIGURED)).toEqual({ ok: false, reason: "unauthenticated" });
    expect(checkBasicAuth(header("someone", "correct horse: battery"), CONFIGURED)).toEqual({ ok: false, reason: "unauthenticated" });
    expect(checkBasicAuth(null, CONFIGURED)).toEqual({ ok: false, reason: "unauthenticated" });
  });

  it("rejects malformed headers instead of throwing", () => {
    for (const value of ["", "Basic", "Basic ", "Bearer abc", "Basic !!!not-base64!!!", header("ethan", "").replace(":", "")]) {
      expect(checkBasicAuth(value, CONFIGURED).ok).toBe(false);
    }
  });

  it("accepts a case-insensitive scheme", () => {
    expect(checkBasicAuth(header("ethan", "correct horse: battery").replace("Basic", "basic"), CONFIGURED)).toEqual({ ok: true });
  });

  // The important one: a missing environment variable is the most likely way
  // this protection would silently vanish, so production must refuse to serve
  // rather than serve unprotected.
  it("fails closed in production when credentials are not configured", () => {
    expect(checkBasicAuth(header("ethan", "x"), { isProduction: true })).toEqual({ ok: false, reason: "unconfigured" });
    expect(checkBasicAuth(null, { user: "ethan", isProduction: true })).toEqual({ ok: false, reason: "unconfigured" });
    expect(checkBasicAuth(null, { password: "x", isProduction: true })).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("does not gate local development when credentials are not configured", () => {
    expect(checkBasicAuth(null, { isProduction: false })).toEqual({ ok: true });
  });

  it("still enforces credentials in development once they are configured", () => {
    expect(checkBasicAuth(null, { ...CONFIGURED, isProduction: false })).toEqual({ ok: false, reason: "unauthenticated" });
  });
});
