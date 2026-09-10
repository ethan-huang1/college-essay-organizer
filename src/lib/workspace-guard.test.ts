import { describe, expect, it } from "vitest";

import { requireWritableWorkspace } from "./workspace-session";

/**
 * The example workspace is one shared row: every account reads and writes the
 * same essays. This guard is the whole reason a beta user cannot edit what
 * another beta user is reading, so it gets a test of its own rather than only
 * the source-text guard in redesign-parity.test.ts.
 */
describe("requireWritableWorkspace", () => {
  it("allows a personal workspace", () => {
    expect(() => requireWritableWorkspace({ workspace: { kind: "personal" } })).not.toThrow();
  });

  it("refuses the shared example workspace", () => {
    expect(() => requireWritableWorkspace({ workspace: { kind: "demo" } }))
      .toThrow(/example workspace is read-only/i);
  });
});
