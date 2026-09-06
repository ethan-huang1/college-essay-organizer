import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { computeOverallFit, getPromptFitCoachRecommendations, type PromptFitDimension } from "./prompt-fit-coach";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

const FIT_ESSAY =
  "I spent two years rebuilding the school's greenhouse after a storm collapsed it. " +
  "We raised the money ourselves through three bake sales and a grant application. " +
  "I learned that persistence matters more than the first plan you make. " +
  "My favourite band is a four-piece from Leeds I have seen eleven times.";

const FIT_PROMPT = "Describe a challenge you faced, what you did about it, and what you learned.";

function dimension(status: PromptFitDimension["status"], evidence: string | null = null): PromptFitDimension {
  return { dimension: `ask (${status})`, status, evidence, note: "note" };
}

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

describe("computeOverallFit", () => {
  it("is strong only when every dimension is strong", () => {
    expect(computeOverallFit([dimension("strong"), dimension("strong")])).toBe("strong");
  });

  it("is partial when every dimension is merely partial - never strong", () => {
    expect(computeOverallFit([dimension("partial"), dimension("partial"), dimension("partial")])).toBe("partial");
  });

  it("is partial when a strong/partial majority survives some missing asks", () => {
    expect(computeOverallFit([dimension("strong"), dimension("strong"), dimension("missing")])).toBe("partial");
  });

  it("is weak when missing asks are at least half of the list", () => {
    expect(computeOverallFit([dimension("strong"), dimension("missing")])).toBe("weak");
    expect(computeOverallFit([dimension("strong"), dimension("missing"), dimension("missing")])).toBe("weak");
  });

  it("is weak when every dimension is missing", () => {
    expect(computeOverallFit([dimension("missing"), dimension("missing")])).toBe("weak");
  });

  it("is strong for a single strong ask (a one-ask prompt is normal)", () => {
    expect(computeOverallFit([dimension("strong")])).toBe("strong");
  });
});

describe("getPromptFitCoachRecommendations", () => {
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

    const result = await getPromptFitCoachRecommendations({
      content: FIT_ESSAY,
      promptText: FIT_PROMPT,
      userId: "user-1",
    });

    expect(result).toEqual({ status: "error", reason: "not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty content without a network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getPromptFitCoachRecommendations({ content: "   ", promptText: FIT_PROMPT, userId: "user-1" });

    expect(result).toEqual({ status: "error", reason: "invalid-input", detail: "Essay is empty." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty prompt text without a network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getPromptFitCoachRecommendations({ content: FIT_ESSAY, promptText: "  ", userId: "user-1" });

    expect(result).toMatchObject({ status: "error", reason: "invalid-input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns verified dimensions, off-topic passages, and a computed coverage verdict", async () => {
    const fetchMock = travilaFetchMock(
      assistantJsonResponse({
        dimensions: [
          {
            dimension: "Describes a challenge",
            status: "strong",
            evidence: "I spent two years rebuilding the school's greenhouse after a storm collapsed it.",
            note: "The collapse and rebuild are concrete.",
          },
          {
            dimension: "What the student did about it",
            status: "strong",
            evidence: "We raised the money ourselves through three bake sales and a grant application.",
            note: "Specific actions.",
          },
          {
            dimension: "What the student learned",
            status: "partial",
            evidence: "I learned that persistence matters more than the first plan you make.",
            note: "Stated but not explored.",
          },
        ],
        offTopicPassages: [
          {
            excerpt: "My favourite band is a four-piece from Leeds I have seen eleven times.",
            reason: "Unrelated to the challenge this prompt asks about.",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getPromptFitCoachRecommendations({ content: FIT_ESSAY, promptText: FIT_PROMPT, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "ok" });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.dimensions).toHaveLength(3);
    // Two strong plus one partial, no missing -> partial, never strong.
    expect(result.overallFit).toBe("partial");
    expect(result.offTopicPassages).toHaveLength(1);
    const sendMessageBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sendMessageBody.setActiveProfileId).toBe("college_essay_prompt_fit_coach");
    expect(sendMessageBody.userMessage.content[0].content).toContain(FIT_PROMPT);
  });

  it("does not let off-topic passages change the coverage verdict", async () => {
    const dimensions = [
      {
        dimension: "Describes a challenge",
        status: "strong",
        evidence: "I spent two years rebuilding the school's greenhouse after a storm collapsed it.",
        note: "Concrete.",
      },
    ];
    const withOffTopic = travilaFetchMock(
      assistantJsonResponse({
        dimensions,
        offTopicPassages: [
          {
            excerpt: "My favourite band is a four-piece from Leeds I have seen eleven times.",
            reason: "Unrelated.",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", withOffTopic);
    const withOffTopicPromise = getPromptFitCoachRecommendations({
      content: FIT_ESSAY,
      promptText: FIT_PROMPT,
      userId: "user-1",
    });
    await vi.runAllTimersAsync();
    const withOffTopicResult = await withOffTopicPromise;

    vi.unstubAllGlobals();
    const withoutOffTopic = travilaFetchMock(assistantJsonResponse({ dimensions, offTopicPassages: [] }));
    vi.stubGlobal("fetch", withoutOffTopic);
    const withoutOffTopicPromise = getPromptFitCoachRecommendations({
      content: FIT_ESSAY,
      promptText: FIT_PROMPT,
      userId: "user-1",
    });
    await vi.runAllTimersAsync();
    const withoutOffTopicResult = await withoutOffTopicPromise;

    expect(withOffTopicResult).toMatchObject({ status: "ok", overallFit: "strong" });
    expect(withoutOffTopicResult).toMatchObject({ status: "ok", overallFit: "strong" });
  });

  it("treats an absent offTopicPassages field as no off-topic passages", async () => {
    const fetchMock = travilaFetchMock(
      assistantJsonResponse({
        dimensions: [
          {
            dimension: "Describes a challenge",
            status: "strong",
            evidence: "I spent two years rebuilding the school's greenhouse after a storm collapsed it.",
            note: "Concrete.",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getPromptFitCoachRecommendations({ content: FIT_ESSAY, promptText: FIT_PROMPT, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "ok", offTopicPassages: [] });
  });

  it("reports malformed when the response is not valid JSON", async () => {
    const fetchMock = travilaFetchMock(
      jsonResponse({
        messageHistory: [
          { role: "ROLE_ASSISTANT", generatedBy: "run-1", content: [{ type: "CONTENT_PART_TYPE_TEXT", content: "not json" }] },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getPromptFitCoachRecommendations({ content: FIT_ESSAY, promptText: FIT_PROMPT, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "error", reason: "malformed" });
  });

  it("reports malformed when the dimensions array is missing", async () => {
    const fetchMock = travilaFetchMock(assistantJsonResponse({ offTopicPassages: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = getPromptFitCoachRecommendations({ content: FIT_ESSAY, promptText: FIT_PROMPT, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "error", reason: "malformed" });
  });

  it("drops a dimension with an invalid status but keeps the valid ones", async () => {
    const fetchMock = travilaFetchMock(
      assistantJsonResponse({
        dimensions: [
          { dimension: "Bad status", status: "off-topic", evidence: null, note: "invalid" },
          {
            dimension: "Describes a challenge",
            status: "strong",
            evidence: "I spent two years rebuilding the school's greenhouse after a storm collapsed it.",
            note: "Concrete.",
          },
        ],
        offTopicPassages: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getPromptFitCoachRecommendations({ content: FIT_ESSAY, promptText: FIT_PROMPT, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "ok" });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.dimensions).toHaveLength(1);
    expect(result.dimensions[0].dimension).toBe("Describes a challenge");
  });

  it("reports malformed when every dimension entry is invalid", async () => {
    const fetchMock = travilaFetchMock(
      assistantJsonResponse({
        dimensions: [{ dimension: "Bad", status: "nonsense", evidence: null, note: "x" }],
        offTopicPassages: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getPromptFitCoachRecommendations({ content: FIT_ESSAY, promptText: FIT_PROMPT, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "error", reason: "malformed" });
  });

  it("nulls non-verbatim dimension evidence but keeps the dimension", async () => {
    const fetchMock = travilaFetchMock(
      assistantJsonResponse({
        dimensions: [
          {
            dimension: "What the student learned",
            status: "partial",
            evidence: "A sentence the student never actually wrote.",
            note: "Paraphrased quote.",
          },
        ],
        offTopicPassages: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getPromptFitCoachRecommendations({ content: FIT_ESSAY, promptText: FIT_PROMPT, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "ok" });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.dimensions).toHaveLength(1);
    expect(result.dimensions[0]).toMatchObject({ status: "partial", evidence: null });
  });

  it("drops an off-topic passage whose excerpt is not verbatim", async () => {
    const fetchMock = travilaFetchMock(
      assistantJsonResponse({
        dimensions: [
          {
            dimension: "Describes a challenge",
            status: "strong",
            evidence: "I spent two years rebuilding the school's greenhouse after a storm collapsed it.",
            note: "Concrete.",
          },
        ],
        offTopicPassages: [{ excerpt: "Text that is not in the essay at all.", reason: "Invented." }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getPromptFitCoachRecommendations({ content: FIT_ESSAY, promptText: FIT_PROMPT, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ status: "ok", offTopicPassages: [] });
  });

  it("times out if the run never completes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ thread: { threadId: "thread-1" } }))
      .mockResolvedValueOnce(jsonResponse({ runId: "run-1" }))
      .mockResolvedValue(jsonResponse({ messageHistory: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = getPromptFitCoachRecommendations({ content: FIT_ESSAY, promptText: FIT_PROMPT, userId: "user-1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ status: "error", reason: "timeout" });
  });
});
