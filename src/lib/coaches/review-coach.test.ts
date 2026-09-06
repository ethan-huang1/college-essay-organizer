import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REVIEW_AXIS_IDS, getReviewCoachRecommendations, type ReviewCoachAxis } from "./review-coach";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

const REVIEW_ESSAY =
  "The storm took the greenhouse roof in October. " +
  "I wrote my first grant application and it was rejected. " +
  "The February rewrite was honest, unglamorous, and funded.";

function axis(id: string, overrides: Partial<ReviewCoachAxis> = {}) {
  return {
    axis: id,
    rating: "solid",
    comment: `Comment about ${id}.`,
    example: null,
    ...overrides,
  };
}

/** All eight axes, each exactly once - the only shape the parser accepts. */
function allAxes(overrides: Record<string, Partial<ReviewCoachAxis>> = {}) {
  return REVIEW_AXIS_IDS.map((id) => axis(id, overrides[id] ?? {}));
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

async function runWith(body: unknown) {
  const fetchMock = travilaFetchMock(assistantJsonResponse(body));
  vi.stubGlobal("fetch", fetchMock);
  const promise = getReviewCoachRecommendations({ content: REVIEW_ESSAY, userId: "user-1" });
  await vi.runAllTimersAsync();
  return { result: await promise, fetchMock };
}

describe("getReviewCoachRecommendations", () => {
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

    const result = await getReviewCoachRecommendations({ content: REVIEW_ESSAY, userId: "user-1" });

    expect(result).toEqual({ status: "error", reason: "not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty content without a network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getReviewCoachRecommendations({ content: "   ", userId: "user-1" });

    expect(result).toEqual({ status: "error", reason: "invalid-input", detail: "Essay is empty." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a complete eight-axis review", async () => {
    const { result, fetchMock } = await runWith({
      axes: allAxes(),
      overallImpression: "A clear, concrete piece with room to deepen the reflection.",
    });

    expect(result).toMatchObject({ status: "ok" });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.axes).toHaveLength(8);
    expect(result.axes.map((entry) => entry.axis).sort()).toEqual([...REVIEW_AXIS_IDS].sort());
    expect(result.overallImpression).toContain("concrete");
    const sendMessageBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sendMessageBody.setActiveProfileId).toBe("college_essay_review_coach");
  });

  it("accepts not-applicable as an ordinary rating, with its axis still present", async () => {
    const { result } = await runWith({
      axes: allAxes({
        hook: { rating: "not-applicable", comment: "This 40-word supplement has no separable opening beat." },
        conclusion: { rating: "strong", comment: "Lands on the funded rewrite." },
      }),
      overallImpression: "Tight and specific for its length.",
    });

    expect(result).toMatchObject({ status: "ok" });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.axes).toHaveLength(8);
    expect(result.axes.find((entry) => entry.axis === "hook")).toMatchObject({ rating: "not-applicable" });
  });

  it("reports malformed when an axis is missing", async () => {
    const { result } = await runWith({
      axes: allAxes().slice(0, 7),
      overallImpression: "Seven axes only.",
    });

    expect(result).toMatchObject({ status: "error", reason: "malformed" });
  });

  it("reports malformed when an axis is duplicated in place of another", async () => {
    const axes = allAxes();
    axes[7] = axis("structure"); // duplicate structure, drop redundancy - still length 8
    const { result } = await runWith({ axes, overallImpression: "Duplicated axis." });

    expect(result).toMatchObject({ status: "error", reason: "malformed" });
  });

  it("reports malformed when an unknown axis id appears", async () => {
    const axes = allAxes();
    axes[7] = axis("originality"); // not one of the eight
    const { result } = await runWith({ axes, overallImpression: "Unknown axis." });

    expect(result).toMatchObject({ status: "error", reason: "malformed" });
  });

  it("reports malformed when an axis has an invalid rating", async () => {
    const { result } = await runWith({
      axes: allAxes({ voice: { rating: "excellent" as ReviewCoachAxis["rating"] } }),
      overallImpression: "Bad rating value.",
    });

    expect(result).toMatchObject({ status: "error", reason: "malformed" });
  });

  it("reports malformed when an axis comment is empty", async () => {
    const { result } = await runWith({
      axes: allAxes({ clarity: { comment: "   " } }),
      overallImpression: "Empty comment.",
    });

    expect(result).toMatchObject({ status: "error", reason: "malformed" });
  });

  it("reports malformed when overallImpression is missing", async () => {
    const { result } = await runWith({ axes: allAxes() });

    expect(result).toMatchObject({ status: "error", reason: "malformed" });
  });

  it("reports malformed when the response is not valid JSON", async () => {
    const fetchMock = travilaFetchMock(
      jsonResponse({
        messageHistory: [
          { role: "ROLE_ASSISTANT", generatedBy: "run-1", content: [{ type: "CONTENT_PART_TYPE_TEXT", content: "nope" }] },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getReviewCoachRecommendations({ content: REVIEW_ESSAY, userId: "user-1" });
    await vi.runAllTimersAsync();

    expect(await promise).toMatchObject({ status: "error", reason: "malformed" });
  });

  it("keeps a verbatim example and nulls one that is not in the essay", async () => {
    const { result } = await runWith({
      axes: allAxes({
        specificity: { example: "The February rewrite was honest, unglamorous, and funded." },
        voice: { example: "A sentence the student never wrote." },
        hook: { rating: "not-applicable", comment: "No separable hook.", example: "Also never written." },
      }),
      overallImpression: "Mixed examples.",
    });

    expect(result).toMatchObject({ status: "ok" });
    if (result.status !== "ok") throw new Error("expected ok");
    const byAxis = Object.fromEntries(result.axes.map((entry) => [entry.axis, entry]));
    expect(byAxis.specificity.example).toBe("The February rewrite was honest, unglamorous, and funded.");
    expect(byAxis.voice.example).toBeNull();
    // Verification applies regardless of rating, including not-applicable.
    expect(byAxis.hook.example).toBeNull();
    expect(byAxis.hook.rating).toBe("not-applicable");
  });

  it("passes light framing context without asking for prompt-fit judgment", async () => {
    const fetchMock = travilaFetchMock(
      assistantJsonResponse({ axes: allAxes(), overallImpression: "Fine." }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = getReviewCoachRecommendations({
      content: REVIEW_ESSAY,
      essayTitle: "Greenhouse",
      schoolName: "Test College",
      userId: "user-1",
    });
    await vi.runAllTimersAsync();
    await promise;

    const instruction = JSON.parse(fetchMock.mock.calls[1][1].body).userMessage.content[0].content;
    expect(instruction).toContain("Greenhouse · Test College");
    expect(instruction).toContain("Do not evaluate how well it fits any prompt");
  });

  it("times out if the run never completes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ thread: { threadId: "thread-1" } }))
      .mockResolvedValueOnce(jsonResponse({ runId: "run-1" }))
      .mockResolvedValue(jsonResponse({ messageHistory: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = getReviewCoachRecommendations({ content: REVIEW_ESSAY, userId: "user-1" });
    await vi.runAllTimersAsync();

    expect(await promise).toEqual({ status: "error", reason: "timeout" });
  });
});
