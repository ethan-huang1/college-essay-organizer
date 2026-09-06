import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/workspace-session", () => ({ getActiveWorkspaceSnapshot: vi.fn() }));
vi.mock("@/lib/coaches/shorten-coach", async () => {
  const actual = await vi.importActual<typeof import("@/lib/coaches/shorten-coach")>("@/lib/coaches/shorten-coach");
  return { ...actual, getShortenCoachRecommendations: vi.fn() };
});

import { requestShortenCoachAction } from "./shorten-coach-actions";
import { getShortenCoachRecommendations } from "@/lib/coaches/shorten-coach";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";

const snapshot = { essays: [{ id: "essay-1" }], user: { id: "user-1" }, workspace: { id: "ws-1" } };

describe("requestShortenCoachAction", () => {
  beforeEach(() => {
    vi.mocked(getActiveWorkspaceSnapshot).mockResolvedValue(snapshot as never);
    vi.mocked(getShortenCoachRecommendations).mockReset();
  });

  it("returns invalid-input when the essay is not in the active workspace, without calling Travila", async () => {
    const result = await requestShortenCoachAction("missing-essay", "some content", 10);

    expect(result).toMatchObject({ status: "error", reason: "invalid-input" });
    expect(getShortenCoachRecommendations).not.toHaveBeenCalled();
  });

  it("returns invalid-input for an empty essay, not under-target, without calling Travila", async () => {
    const result = await requestShortenCoachAction("essay-1", "   ", 10);

    expect(result).toEqual({ status: "error", reason: "invalid-input", detail: "Essay is empty." });
    expect(getShortenCoachRecommendations).not.toHaveBeenCalled();
  });

  it("returns invalid-input for a non-positive target, without calling Travila", async () => {
    const result = await requestShortenCoachAction("essay-1", "word ".repeat(20).trim(), 0);

    expect(result).toMatchObject({ status: "error", reason: "invalid-input" });
    expect(getShortenCoachRecommendations).not.toHaveBeenCalled();
  });

  it("returns under-target when valid content is already at or under the target, without calling Travila", async () => {
    const content = "word ".repeat(10).trim(); // 10 words

    const result = await requestShortenCoachAction("essay-1", content, 20);

    expect(result).toEqual({ status: "under-target", currentWordCount: 10, targetWordCount: 20 });
    expect(getShortenCoachRecommendations).not.toHaveBeenCalled();
  });

  it("delegates to getShortenCoachRecommendations and passes its result through unchanged when over target", async () => {
    const content = "word ".repeat(50).trim(); // 50 words
    const travilaResult = {
      status: "ok" as const,
      currentWordCount: 50,
      targetWordCount: 20,
      wordsToShorten: 30,
      recommendations: [],
    };
    vi.mocked(getShortenCoachRecommendations).mockResolvedValue(travilaResult);

    const result = await requestShortenCoachAction("essay-1", content, 20);

    expect(getShortenCoachRecommendations).toHaveBeenCalledWith({ content, targetWordCount: 20, userId: "user-1" });
    expect(result).toBe(travilaResult);
  });
});
