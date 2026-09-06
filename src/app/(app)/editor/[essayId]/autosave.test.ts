import { describe, expect, it } from "vitest";

import {
  autosaveReducer,
  initialAutosaveState,
  isDirty,
  type AutosaveEvent,
  type AutosaveState,
  type SaveRequest,
} from "./autosave";

/**
 * The three failures this machine exists to prevent: overlapping writes, a slow
 * early response describing newer text, and a pending write landing on top of a
 * restore or a delete.
 */

function run(state: AutosaveState, events: AutosaveEvent[]) {
  const requests: SaveRequest[] = [];
  let current = state;
  for (const event of events) {
    const next = autosaveReducer(current, event);
    current = next.state;
    if (next.request) requests.push(next.request);
  }
  return { state: current, requests };
}

const start = () => initialAutosaveState("one", 1000);

describe("autosave", () => {
  it("sends the buffered text once, with the timestamp it believes current", () => {
    const { state, requests } = run(start(), [{ type: "edit", text: "one two" }, { type: "flush" }]);
    expect(requests).toEqual([{ text: "one two", revision: 1, expectedLastEditedAt: 1000 }]);
    expect(state.status).toBe("saving");
  });

  it("never runs two writes at once, and follows up with only the newest text", () => {
    const { state, requests } = run(start(), [
      { type: "edit", text: "a" },
      { type: "flush" },
      { type: "edit", text: "ab" },
      { type: "flush" },
      { type: "edit", text: "abc" },
      { type: "flush" },
      { type: "settled", revision: 1, result: { status: "saved", savedAt: 2000 } },
    ]);
    expect(requests.map((request) => request.text)).toEqual(["a", "abc"]);
    // The follow-up guards against the timestamp the first write returned.
    expect(requests[1].expectedLastEditedAt).toBe(2000);
    expect(state.status).toBe("saving");
  });

  it("ignores a response from a request that is no longer in flight", () => {
    const { state } = run(start(), [
      { type: "edit", text: "a" },
      { type: "flush" },
      { type: "settled", revision: 1, result: { status: "error" } },
      { type: "flush" },
      // The first, slow request finally answers. It described "a"; the document
      // has moved on, and it must not report success for it.
      { type: "settled", revision: 1, result: { status: "saved", savedAt: 9999 } },
    ]);
    expect(state.savedAt).toBe(1000);
    expect(state.status).toBe("saving");
  });

  it("reports saved only when nothing is waiting", () => {
    const { state } = run(start(), [
      { type: "edit", text: "a" },
      { type: "flush" },
      { type: "settled", revision: 1, result: { status: "saved", savedAt: 2000 } },
    ]);
    expect(state).toMatchObject({ status: "saved", savedText: "a", savedAt: 2000, pendingText: null });
    expect(isDirty(state)).toBe(false);
  });

  it("keeps the text dirty and retryable after a failed write", () => {
    const { state, requests } = run(start(), [
      { type: "edit", text: "a" },
      { type: "flush" },
      { type: "settled", revision: 1, result: { status: "error" } },
      { type: "flush" },
    ]);
    expect(state.savedText).toBe("one");
    expect(requests.map((request) => request.text)).toEqual(["a", "a"]);
  });

  it("stops writing when a restore moved the document under it", () => {
    const { state, requests } = run(start(), [
      { type: "edit", text: "a" },
      { type: "flush" },
      { type: "settled", revision: 1, result: { status: "conflict", savedAt: 5000 } },
      { type: "edit", text: "ab" },
      { type: "flush" },
    ]);
    expect(state.status).toBe("stale");
    expect(state.note).toContain("changed elsewhere");
    expect(requests).toHaveLength(1);
  });

  it("stops writing when the document has been deleted, rather than recreating it", () => {
    const { state, requests } = run(start(), [
      { type: "edit", text: "a" },
      { type: "flush" },
      { type: "settled", revision: 1, result: { status: "missing" } },
      { type: "edit", text: "ab" },
      { type: "flush" },
    ]);
    expect(state.status).toBe("stale");
    expect(state.note).toContain("deleted");
    expect(requests).toHaveLength(1);
  });

  it("treats typing back to the saved text as nothing to save", () => {
    const { requests } = run(start(), [{ type: "edit", text: "one x" }, { type: "edit", text: "one" }, { type: "flush" }]);
    expect(requests).toEqual([]);
  });
});
