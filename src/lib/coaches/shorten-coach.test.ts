import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getShortenCoachRecommendations } from "./shorten-coach";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

const SHORTEN_ESSAY =
  "I walked into the lab for the first time and felt nervous. " +
  "The lab smelled like burnt coffee and old plastic. " +
  "Over the summer I learned to run the centrifuge on my own. " +
  "In the end, I realized science was less about answers and more about questions.";

function assistantJsonResponse(recommendations: unknown) {
  return jsonResponse({
    messageHistory: [
      {
        role: "ROLE_ASSISTANT",
        generatedBy: "run-1",
        content: [{ type: "CONTENT_PART_TYPE_TEXT", content: JSON.stringify({ recommendations }) }],
      },
    ],
  });
}

describe("getShortenCoachRecommendations", () => {
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

    const result = await getShortenCoachRecommendations({ content: SHORTEN_ESSAY, targetWordCount: 10, userId: "user-1" });

    expect(result).toEqual({ status: "error", reason: "not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty content without a network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getShortenCoachRecommendations({ content: "   ", targetWordCount: 10, userId: "user-1" });

    expect(result).toEqual({ status: "error", reason: "invalid-input", detail: "Essay is empty." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("computes estimatedWordsSaved from the excerpt itself, ignoring any number the model provides", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ thread: { threadId: "thread-1" } }))
      .mockResolvedValueOnce(jsonResponse({ runId: "run-1" }))
      .mockResolvedValueOnce(
        assistantJsonResponse([
          {
            excerpt: "The lab smelled like burnt coffee and old plastic.",
            estimatedWordsSaved: 99999, // must be ignored - not part of the requested schema
            reason: "Sensory detail that doesn't advance the story.",
            tradeoff: "Loses a bit of atmosphere, but nothing essential.",
            shortenPriority: "shorten-first",
          },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getShortenCoachRecommendations({ content: SHORTEN_ESSAY, targetWordCount: 20, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "ok" });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]).toMatchObject({
      excerpt: "The lab smelled like burnt coffee and old plastic.",
      estimatedWordsSaved: 9,
      shortenPriority: "shorten-first",
    });
    const sendMessageBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sendMessageBody.setActiveProfileId).toBe("college_essay_shorten_coach");
  });

  it("reports malformed when the response is not valid JSON", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ thread: { threadId: "thread-1" } }))
      .mockResolvedValueOnce(jsonResponse({ runId: "run-1" }))
      .mockResolvedValueOnce(
        jsonResponse({
          messageHistory: [
            { role: "ROLE_ASSISTANT", generatedBy: "run-1", content: [{ type: "CONTENT_PART_TYPE_TEXT", content: "not json" }] },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getShortenCoachRecommendations({ content: SHORTEN_ESSAY, targetWordCount: 20, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "error", reason: "malformed" });
  });

  it("reports malformed when the recommendations field is missing", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ thread: { threadId: "thread-1" } }))
      .mockResolvedValueOnce(jsonResponse({ runId: "run-1" }))
      .mockResolvedValueOnce(
        jsonResponse({
          messageHistory: [
            { role: "ROLE_ASSISTANT", generatedBy: "run-1", content: [{ type: "CONTENT_PART_TYPE_TEXT", content: "{}" }] },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getShortenCoachRecommendations({ content: SHORTEN_ESSAY, targetWordCount: 20, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "error", reason: "malformed" });
  });

  it("drops a recommendation with a missing or invalid shortenPriority", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ thread: { threadId: "thread-1" } }))
      .mockResolvedValueOnce(jsonResponse({ runId: "run-1" }))
      .mockResolvedValueOnce(
        assistantJsonResponse([
          {
            excerpt: "I walked into the lab for the first time and felt nervous.",
            reason: "Setup.",
            tradeoff: "Loses the opening beat.",
            shortenPriority: "not-a-real-priority",
          },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getShortenCoachRecommendations({ content: SHORTEN_ESSAY, targetWordCount: 20, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "error", reason: "malformed" });
  });

  it("drops a recommendation whose excerpt is not a verbatim substring of the essay", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ thread: { threadId: "thread-1" } }))
      .mockResolvedValueOnce(jsonResponse({ runId: "run-1" }))
      .mockResolvedValueOnce(
        assistantJsonResponse([
          {
            excerpt: "This sentence was never in the essay.",
            reason: "Invented.",
            tradeoff: "N/A",
            shortenPriority: "shorten-first",
          },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getShortenCoachRecommendations({ content: SHORTEN_ESSAY, targetWordCount: 20, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "error", reason: "malformed" });
  });

  it("keeps only the earlier of two overlapping excerpts, so words are never double-counted", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ thread: { threadId: "thread-1" } }))
      .mockResolvedValueOnce(jsonResponse({ runId: "run-1" }))
      .mockResolvedValueOnce(
        assistantJsonResponse([
          {
            excerpt: "The lab smelled like burnt coffee and old plastic.",
            reason: "Sensory detail.",
            tradeoff: "Minor.",
            shortenPriority: "shorten-first",
          },
          {
            // Overlaps the excerpt above (shares "old plastic. Over the summer").
            excerpt: "old plastic. Over the summer I learned to run the centrifuge on my own.",
            reason: "Overlapping candidate.",
            tradeoff: "Should be dropped.",
            shortenPriority: "optional",
          },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getShortenCoachRecommendations({ content: SHORTEN_ESSAY, targetWordCount: 20, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "ok" });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].excerpt).toBe("The lab smelled like burnt coffee and old plastic.");
  });

  it("times out if the run never completes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ thread: { threadId: "thread-1" } }))
      .mockResolvedValueOnce(jsonResponse({ runId: "run-1" }))
      .mockResolvedValue(jsonResponse({ messageHistory: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = getShortenCoachRecommendations({ content: SHORTEN_ESSAY, targetWordCount: 20, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ status: "error", reason: "timeout" });
  });
});
