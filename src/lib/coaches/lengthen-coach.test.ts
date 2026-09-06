import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getLengthenCoachRecommendations } from "./lengthen-coach";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

const LENGTHEN_ESSAY =
  "I applied for the grant and it was rejected. " +
  "I rewrote the budget and applied again in February. " +
  "The second attempt was funded, and the greenhouse reopened in May.";

function assistantJsonResponse(body: unknown) {
  return jsonResponse({
    messageHistory: [
      {
        role: "ROLE_ASSISTANT",
        generatedBy: "run-1",
        content: [{ type: "CONTENT_PART_TYPE_TEXT", content: JSON.stringify(body) }],
      },
    ],
  });
}

function travilaFetchMock(finalResponse: Response) {
  return vi.fn()
    .mockResolvedValueOnce(jsonResponse({ thread: { threadId: "thread-1" } }))
    .mockResolvedValueOnce(jsonResponse({ runId: "run-1" }))
    .mockResolvedValueOnce(finalResponse);
}

describe("getLengthenCoachRecommendations", () => {
  const originalKey = process.env.TRAVILA_API_KEY;

  beforeEach(() => {
    process.env.TRAVILA_API_KEY = "test-key";
    vi.useFakeTimers();
  });

  afterEach(() => {
    process.env.TRAVILA_API_KEY = originalKey;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("refuses when the key is not configured, without making a network call", async () => {
    delete process.env.TRAVILA_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getLengthenCoachRecommendations({
      content: LENGTHEN_ESSAY,
      targetWordCount: 400,
      userId: "user-1",
    });

    expect(result).toEqual({ status: "error", reason: "not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty content without a network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getLengthenCoachRecommendations({ content: "  ", targetWordCount: 400, userId: "user-1" });

    expect(result).toEqual({ status: "error", reason: "invalid-input", detail: "Essay is empty." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a null target - no target is a valid request, not an edge case", async () => {
    const fetchMock = travilaFetchMock(
      assistantJsonResponse({
        opportunities: [
          {
            excerpt: "I applied for the grant and it was rejected.",
            expansionSize: "moderate",
            reason: "The rejection lands with no reaction to it.",
            suggestion: "Add how you responded in the moment.",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getLengthenCoachRecommendations({
      content: LENGTHEN_ESSAY,
      targetWordCount: null,
      userId: "user-1",
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "ok", targetWordCount: null, wordsAvailable: null });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.opportunities).toHaveLength(1);
    const sendMessageBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sendMessageBody.setActiveProfileId).toBe("college_essay_lengthen_coach");
    expect(sendMessageBody.userMessage.content[0].content).toContain("has not set a target length");
  });

  it("rejects a non-integer or non-positive target when one is given", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await getLengthenCoachRecommendations({ content: LENGTHEN_ESSAY, targetWordCount: 0, userId: "user-1" }))
      .toMatchObject({ status: "error", reason: "invalid-input" });
    expect(await getLengthenCoachRecommendations({ content: LENGTHEN_ESSAY, targetWordCount: 10.5, userId: "user-1" }))
      .toMatchObject({ status: "error", reason: "invalid-input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tells the model the real remaining headroom when a target is set", async () => {
    const fetchMock = travilaFetchMock(assistantJsonResponse({ opportunities: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = getLengthenCoachRecommendations({
      content: LENGTHEN_ESSAY, // 29 words
      targetWordCount: 200,
      userId: "user-1",
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "ok", currentWordCount: 29, targetWordCount: 200, wordsAvailable: 171 });
    const instruction = JSON.parse(fetchMock.mock.calls[1][1].body).userMessage.content[0].content;
    expect(instruction).toContain("about 171 more words");
    expect(instruction).toContain("should not exceed about 171");
  });

  it("reports zero headroom when the essay already meets the target", async () => {
    const fetchMock = travilaFetchMock(assistantJsonResponse({ opportunities: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = getLengthenCoachRecommendations({
      content: LENGTHEN_ESSAY, // 29 words
      targetWordCount: 20,
      userId: "user-1",
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "ok", wordsAvailable: 0 });
  });

  it("treats an explicitly empty opportunities array as a valid answer", async () => {
    const fetchMock = travilaFetchMock(assistantJsonResponse({ opportunities: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = getLengthenCoachRecommendations({
      content: LENGTHEN_ESSAY,
      targetWordCount: 200,
      userId: "user-1",
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "ok", opportunities: [] });
  });

  it("reports malformed when a non-empty opportunities array has no usable entries", async () => {
    const fetchMock = travilaFetchMock(
      assistantJsonResponse({
        opportunities: [
          { excerpt: "I applied for the grant and it was rejected.", expansionSize: "enormous", reason: "x", suggestion: "y" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getLengthenCoachRecommendations({
      content: LENGTHEN_ESSAY,
      targetWordCount: 200,
      userId: "user-1",
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "error", reason: "malformed" });
  });

  it("drops an entry with an invalid expansionSize but keeps the valid ones", async () => {
    const fetchMock = travilaFetchMock(
      assistantJsonResponse({
        opportunities: [
          { excerpt: "I applied for the grant and it was rejected.", expansionSize: "huge", reason: "x", suggestion: "y" },
          {
            excerpt: "The second attempt was funded, and the greenhouse reopened in May.",
            expansionSize: "small",
            reason: "The reopening is told, not shown.",
            suggestion: "Add one concrete detail from that day.",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getLengthenCoachRecommendations({
      content: LENGTHEN_ESSAY,
      targetWordCount: 200,
      userId: "user-1",
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "ok" });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0].expansionSize).toBe("small");
  });

  it("drops an entry whose excerpt is missing", async () => {
    const fetchMock = travilaFetchMock(
      assistantJsonResponse({
        opportunities: [
          { expansionSize: "small", reason: "no excerpt", suggestion: "y" },
          {
            excerpt: "I rewrote the budget and applied again in February.",
            expansionSize: "moderate",
            reason: "Skips what changed in the rewrite.",
            suggestion: "Say what you fixed.",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getLengthenCoachRecommendations({
      content: LENGTHEN_ESSAY,
      targetWordCount: 200,
      userId: "user-1",
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "ok" });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.opportunities).toHaveLength(1);
  });

  it("drops an opportunity whose excerpt is not verbatim, and keeps no unverifiable text", async () => {
    const fetchMock = travilaFetchMock(
      assistantJsonResponse({
        opportunities: [
          {
            excerpt: "A sentence the student never wrote at all.",
            expansionSize: "moderate",
            reason: "Invented quote.",
            suggestion: "n/a",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getLengthenCoachRecommendations({
      content: LENGTHEN_ESSAY,
      targetWordCount: 200,
      userId: "user-1",
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    // Parsing succeeded, verification removed it: an ok result with nothing to show.
    expect(result).toMatchObject({ status: "ok", opportunities: [] });
  });

  it("keeps only the earlier of two overlapping opportunities", async () => {
    const fetchMock = travilaFetchMock(
      assistantJsonResponse({
        opportunities: [
          {
            excerpt: "I applied for the grant and it was rejected.",
            expansionSize: "moderate",
            reason: "First.",
            suggestion: "a",
          },
          {
            excerpt: "it was rejected. I rewrote the budget and applied again in February.",
            expansionSize: "small",
            reason: "Overlaps the first.",
            suggestion: "b",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getLengthenCoachRecommendations({
      content: LENGTHEN_ESSAY,
      targetWordCount: 200,
      userId: "user-1",
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "ok" });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0].excerpt).toBe("I applied for the grant and it was rejected.");
  });

  it("never reports a words-to-add number - sizing stays qualitative", async () => {
    const fetchMock = travilaFetchMock(
      assistantJsonResponse({
        opportunities: [
          {
            excerpt: "I applied for the grant and it was rejected.",
            expansionSize: "moderate",
            reason: "x",
            suggestion: "y",
            estimatedWordsToAdd: 120, // not part of the schema; must not survive
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getLengthenCoachRecommendations({
      content: LENGTHEN_ESSAY,
      targetWordCount: 200,
      userId: "user-1",
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "ok" });
    if (result.status !== "ok") throw new Error("expected ok");
    // The stray field is not read by anything, and no derived count is added.
    expect(result.opportunities[0]).not.toHaveProperty("estimatedWordsSaved");
  });

  it("times out if the run never completes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ thread: { threadId: "thread-1" } }))
      .mockResolvedValueOnce(jsonResponse({ runId: "run-1" }))
      .mockResolvedValue(jsonResponse({ messageHistory: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = getLengthenCoachRecommendations({
      content: LENGTHEN_ESSAY,
      targetWordCount: 200,
      userId: "user-1",
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ status: "error", reason: "timeout" });
  });
});
