import { describe, expect, it } from "vitest";

import { schoolCatalogueState } from "./schools";

const prompt = (over: Partial<{ isCurrentCycle: boolean; verificationStatus: string }> = {}) => ({
  isCurrentCycle: true,
  verificationStatus: "officially-verified",
  ...over,
});

describe("schoolCatalogueState", () => {
  it("reports a college with current prompts as current", () => {
    expect(schoolCatalogueState("current", [prompt()])).toBe("current");
  });

  // The four zero-prompt states are the whole point: they used to collapse into
  // one blank cell, so "no essay required" was indistinguishable from "we never
  // checked".
  it("keeps the four zero-prompt states distinct", () => {
    expect(schoolCatalogueState("no-supplement", [])).toBe("no-supplement");
    expect(schoolCatalogueState("not-published", [])).toBe("not-published");
    expect(schoolCatalogueState("previous-cycle", [])).toBe("previous-cycle-only");
    expect(schoolCatalogueState("manual", [])).toBe("manual");
  });

  // Rows written before the column existed must not read as "done".
  it("treats an unset status as unverified rather than current", () => {
    expect(schoolCatalogueState(null, [])).toBe("manual");
    expect(schoolCatalogueState("current", [])).toBe("manual");
  });

  it("prefers a changed prompt over every other signal", () => {
    expect(schoolCatalogueState("current", [prompt(), prompt({ verificationStatus: "needs-review" })]))
      .toBe("needs-review");
  });

  it("reports previous-cycle-only when no prompt belongs to this cycle", () => {
    expect(schoolCatalogueState("current", [prompt({ isCurrentCycle: false })])).toBe("previous-cycle-only");
    // One current prompt is enough to make the college current.
    expect(schoolCatalogueState("current", [prompt({ isCurrentCycle: false }), prompt()])).toBe("current");
  });
});
