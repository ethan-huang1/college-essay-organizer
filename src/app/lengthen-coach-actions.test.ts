import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/workspace-session", () => ({ getActiveWorkspaceSnapshot: vi.fn() }));
vi.mock("@/lib/coaches/lengthen-coach", async () => {
  const actual = await vi.importActual<typeof import("@/lib/coaches/lengthen-coach")>("@/lib/coaches/lengthen-coach");
  return { ...actual, getLengthenCoachRecommendations: vi.fn() };
});

import { requestLengthenCoachAction } from "./lengthen-coach-actions";
import { getLengthenCoachRecommendations } from "@/lib/coaches/lengthen-coach";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";

const snapshot = { essays: [{ id: "essay-1" }], user: { id: "user-1" }, workspace: { id: "ws-1" } };

describe("requestLengthenCoachAction", () => {
  beforeEach(() => {
    vi.mocked(getActiveWorkspaceSnapshot).mockResolvedValue(snapshot as never);
    vi.mocked(getLengthenCoachRecommendations).mockReset();
    vi.mocked(getLengthenCoachRecommendations).mockResolvedValue({
      status: "ok",
      currentWordCount: 10,
      targetWordCount: 200,
      wordsAvailable: 190,
      opportunities: [],
    });
  });

  it("returns invalid-input when the essay is not in the active workspace, without calling Travila", async () => {
    const result = await requestLengthenCoachAction("missing-essay", "some content", 200);

    expect(result).toMatchObject({ status: "error", reason: "invalid-input" });
    expect(getLengthenCoachRecommendations).not.toHaveBeenCalled();
  });

  it("returns invalid-input for an empty essay - not no-headroom - without calling Travila", async () => {
    const result = await requestLengthenCoachAction("essay-1", "   ", 200);

    expect(result).toEqual({ status: "error", reason: "invalid-input", detail: "Essay is empty." });
    expect(getLengthenCoachRecommendations).not.toHaveBeenCalled();
  });

  it("returns no-headroom when the essay already meets its target, without calling Travila", async () => {
    const content = "word ".repeat(210).trim(); // 210 words

    const result = await requestLengthenCoachAction("essay-1", content, 200);

    expect(result).toEqual({ status: "no-headroom", currentWordCount: 210, targetWordCount: 200 });
    expect(getLengthenCoachRecommendations).not.toHaveBeenCalled();
  });

  it("treats exactly hitting the target as no headroom", async () => {
    const content = "word ".repeat(200).trim();

    const result = await requestLengthenCoachAction("essay-1", content, 200);

    expect(result).toMatchObject({ status: "no-headroom" });
    expect(getLengthenCoachRecommendations).not.toHaveBeenCalled();
  });

  it("delegates when there is real headroom", async () => {
    const content = "word ".repeat(50).trim();

    await requestLengthenCoachAction("essay-1", content, 200);

    expect(getLengthenCoachRecommendations).toHaveBeenCalledWith({
      content,
      targetWordCount: 200,
      userId: "user-1",
    });
  });

  it("delegates with no target at all - there is no fast path to apply", async () => {
    const content = "word ".repeat(50).trim();

    await requestLengthenCoachAction("essay-1", content, null);

    expect(getLengthenCoachRecommendations).toHaveBeenCalledWith({
      content,
      targetWordCount: null,
      userId: "user-1",
    });
  });

  it("passes the coach result straight through", async () => {
    const coachResult = {
      status: "ok" as const,
      currentWordCount: 50,
      targetWordCount: 200,
      wordsAvailable: 150,
      opportunities: [],
    };
    vi.mocked(getLengthenCoachRecommendations).mockResolvedValue(coachResult);

    const result = await requestLengthenCoachAction("essay-1", "word ".repeat(50).trim(), 200);

    expect(result).toBe(coachResult);
  });
});
