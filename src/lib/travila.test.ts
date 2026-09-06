import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { shortenEssay } from "./travila";

const LONG_ESSAY = "word ".repeat(400).trim(); // 400 words

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("shortenEssay", () => {
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

    const result = await shortenEssay({ content: LONG_ESSAY, targetWordCount: 100, userId: "user-1" });

    expect(result).toEqual({ status: "error", reason: "not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty content without a network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await shortenEssay({ content: "   ", targetWordCount: 100, userId: "user-1" });

    expect(result).toEqual({ status: "error", reason: "invalid-input", detail: "Essay is empty." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects content over the 20,000 character cap", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await shortenEssay({ content: "a".repeat(20001), targetWordCount: 100, userId: "user-1" });

    expect(result).toMatchObject({ status: "error", reason: "invalid-input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-integer or non-positive target word count", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await shortenEssay({ content: LONG_ESSAY, targetWordCount: 0, userId: "user-1" }))
      .toMatchObject({ status: "error", reason: "invalid-input" });
    expect(await shortenEssay({ content: LONG_ESSAY, targetWordCount: -5, userId: "user-1" }))
      .toMatchObject({ status: "error", reason: "invalid-input" });
    expect(await shortenEssay({ content: LONG_ESSAY, targetWordCount: 50.5, userId: "user-1" }))
      .toMatchObject({ status: "error", reason: "invalid-input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an absurdly large target word count", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await shortenEssay({ content: LONG_ESSAY, targetWordCount: 20_000, userId: "user-1" });

    expect(result).toMatchObject({ status: "error", reason: "invalid-input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a target that is not below the essay's current word count", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await shortenEssay({ content: LONG_ESSAY, targetWordCount: 400, userId: "user-1" });

    expect(result).toMatchObject({ status: "error", reason: "invalid-input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the shortened text, joining text parts and dropping reasoning parts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ thread: { threadId: "thread-1" } }))
      .mockResolvedValueOnce(jsonResponse({ runId: "run-1" }))
      .mockResolvedValueOnce(jsonResponse({
        messageHistory: [
          {
            role: "ROLE_ASSISTANT",
            generatedBy: "run-1",
            content: [
              { type: "CONTENT_PART_TYPE_REASONING", content: "internal thinking" },
              { type: "CONTENT_PART_TYPE_TEXT", content: "Shortened part one." },
              { type: "CONTENT_PART_TYPE_TEXT", content: "Shortened part two." },
            ],
          },
        ],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = shortenEssay({ content: LONG_ESSAY, targetWordCount: 100, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ status: "ok", shortenedContent: "Shortened part one.\n\nShortened part two." });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sendMessageBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sendMessageBody.setActiveProfileId).toBe("college_essay_editor");
    expect(sendMessageBody.userMessage.content[0].content).toContain("no more than 100 words");
    expect(sendMessageBody).not.toHaveProperty("targetWordCount");
  });

  it("polls again when the matching assistant message has not arrived yet", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ thread: { threadId: "thread-1" } }))
      .mockResolvedValueOnce(jsonResponse({ runId: "run-1" }))
      .mockResolvedValueOnce(jsonResponse({ messageHistory: [] }))
      .mockResolvedValueOnce(jsonResponse({
        messageHistory: [
          { role: "ROLE_ASSISTANT", generatedBy: "run-1", content: [{ type: "CONTENT_PART_TYPE_TEXT", content: "Done." }] },
        ],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = shortenEssay({ content: LONG_ESSAY, targetWordCount: 100, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ status: "ok", shortenedContent: "Done." });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("times out if the run never completes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ thread: { threadId: "thread-1" } }))
      .mockResolvedValueOnce(jsonResponse({ runId: "run-1" }))
      .mockResolvedValue(jsonResponse({ messageHistory: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = shortenEssay({ content: LONG_ESSAY, targetWordCount: 100, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ status: "error", reason: "timeout" });
  });

  it("reports a malformed response when the assistant message has no text parts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ thread: { threadId: "thread-1" } }))
      .mockResolvedValueOnce(jsonResponse({ runId: "run-1" }))
      .mockResolvedValueOnce(jsonResponse({
        messageHistory: [
          { role: "ROLE_ASSISTANT", generatedBy: "run-1", content: [{ type: "CONTENT_PART_TYPE_REASONING", content: "only thinking" }] },
        ],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = shortenEssay({ content: LONG_ESSAY, targetWordCount: 100, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "error", reason: "malformed" });
  });

  it("reports an http error and stops on a non-2xx response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}, false, 500));
    vi.stubGlobal("fetch", fetchMock);

    const result = await shortenEssay({ content: LONG_ESSAY, targetWordCount: 100, userId: "user-1" });

    expect(result).toMatchObject({ status: "error", reason: "http" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
