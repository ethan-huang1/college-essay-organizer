import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/workspace-session", () => ({ getActiveWorkspaceSnapshot: vi.fn() }));
vi.mock("@/lib/coaches/review-coach", async () => {
  const actual = await vi.importActual<typeof import("@/lib/coaches/review-coach")>("@/lib/coaches/review-coach");
  return { ...actual, getReviewCoachRecommendations: vi.fn() };
});

import { requestReviewCoachAction } from "./review-coach-actions";
import { REVIEW_AXIS_IDS, getReviewCoachRecommendations } from "@/lib/coaches/review-coach";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";

const ESSAY = "The storm took the greenhouse roof, and the February rewrite was funded.";

function snapshot() {
  return {
    user: { id: "user-1" },
    workspace: { id: "ws-1" },
    schools: [{ id: "school-1", name: "Test College" }],
    prompts: [{ id: "prompt-1", title: "Challenge", promptText: "Describe a challenge.", schoolId: "school-1" }],
    essays: [
      {
        id: "essay-1",
        title: "Greenhouse",
        originPromptId: "prompt-1",
        originPromptTitle: null,
        originPromptText: null,
        linkedPrompts: [],
      },
    ],
  };
}

const okResult = {
  status: "ok" as const,
  axes: REVIEW_AXIS_IDS.map((axis) => ({
    axis,
    rating: "solid" as const,
    comment: `Comment about ${axis}.`,
    example: null,
  })),
  overallImpression: "Solid throughout.",
};

describe("requestReviewCoachAction", () => {
  beforeEach(() => {
    vi.mocked(getActiveWorkspaceSnapshot).mockResolvedValue(snapshot() as never);
    vi.mocked(getReviewCoachRecommendations).mockReset();
    vi.mocked(getReviewCoachRecommendations).mockResolvedValue(okResult);
  });

  it("returns invalid-input when the essay is not in the active workspace, without calling Travila", async () => {
    const result = await requestReviewCoachAction("missing-essay", ESSAY);

    expect(result).toMatchObject({ status: "error", reason: "invalid-input" });
    expect(getReviewCoachRecommendations).not.toHaveBeenCalled();
  });

  it("delegates with server-resolved framing context", async () => {
    await requestReviewCoachAction("essay-1", ESSAY);

    expect(getReviewCoachRecommendations).toHaveBeenCalledWith({
      content: ESSAY,
      essayTitle: "Greenhouse",
      schoolName: "Test College",
      userId: "user-1",
    });
  });

  it("passes the coach result straight through", async () => {
    const result = await requestReviewCoachAction("essay-1", ESSAY);

    expect(result).toBe(okResult);
  });
});
