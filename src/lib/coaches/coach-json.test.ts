import { describe, expect, it } from "vitest";

import { parseCoachJson } from "./coach-json";

describe("parseCoachJson", () => {
  it("parses a bare JSON object", () => {
    expect(parseCoachJson('{"recommendations": []}')).toEqual({ value: { recommendations: [] } });
  });

  it("parses JSON wrapped in a fenced code block", () => {
    expect(parseCoachJson('```json\n{"a": 1}\n```')).toEqual({ value: { a: 1 } });
    expect(parseCoachJson('```\n{"a": 1}\n```')).toEqual({ value: { a: 1 } });
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseCoachJson('\n\n  {"a": 1}  \n')).toEqual({ value: { a: 1 } });
  });

  it("returns null for text that is not JSON", () => {
    expect(parseCoachJson("Here is my analysis, in prose.")).toBeNull();
    expect(parseCoachJson("")).toBeNull();
  });

  it("distinguishes a parsed null from a parse failure", () => {
    // A wrapper object rather than a bare value, so JSON `null` is not
    // mistaken for "could not parse".
    expect(parseCoachJson("null")).toEqual({ value: null });
    expect(parseCoachJson("not json")).toBeNull();
  });
});
