import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/workspace-session", () => ({ getActiveWorkspaceSnapshot: vi.fn() }));
vi.mock("@/lib/coaches/prompt-fit-coach", async () => {
  const actual = await vi.importActual<typeof import("@/lib/coaches/prompt-fit-coach")>(
    "@/lib/coaches/prompt-fit-coach",
  );
  return { ...actual, getPromptFitCoachRecommendations: vi.fn() };
});

import { requestPromptFitCoachAction } from "./prompt-fit-coach-actions";
import { getPromptFitCoachRecommendations } from "@/lib/coaches/prompt-fit-coach";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";

const ESSAY = "I rebuilt the greenhouse after the storm, and learned persistence beats the first plan.";

/** Minimal shape of what essayPromptContext reads: an essay's origin/linked
 * prompt ids plus the workspace's prompt and school lists. */
function snapshotWith(overrides: {
  originPromptId?: string | null;
  originPromptTitle?: string | null;
  originPromptText?: string | null;
  linkedPrompts?: { id: string; schoolName: string | null }[];
  prompts?: { id: string; title: string; promptText: string | null; schoolId: string }[];
}) {
  return {
    user: { id: "user-1" },
    workspace: { id: "ws-1" },
    schools: [{ id: "school-1", name: "Test College" }],
    prompts: overrides.prompts ?? [],
    essays: [
      {
        id: "essay-1",
        originPromptId: overrides.originPromptId ?? null,
        originPromptTitle: overrides.originPromptTitle ?? null,
        originPromptText: overrides.originPromptText ?? null,
        linkedPrompts: overrides.linkedPrompts ?? [],
      },
    ],
  };
}

describe("requestPromptFitCoachAction", () => {
  beforeEach(() => {
    vi.mocked(getPromptFitCoachRecommendations).mockReset();
    vi.mocked(getPromptFitCoachRecommendations).mockResolvedValue({
      status: "ok",
      overallFit: "strong",
      dimensions: [{ dimension: "ask", status: "strong", evidence: null, note: "note" }],
      offTopicPassages: [],
    });
  });

  it("returns invalid-input when the essay is not in the active workspace, without calling Travila", async () => {
    vi.mocked(getActiveWorkspaceSnapshot).mockResolvedValue(
      snapshotWith({ originPromptText: "Describe a challenge." }) as never,
    );

    const result = await requestPromptFitCoachAction("missing-essay", ESSAY);

    expect(result).toMatchObject({ status: "error", reason: "invalid-input" });
    expect(getPromptFitCoachRecommendations).not.toHaveBeenCalled();
  });

  it("returns invalid-input for an empty essay - not no-prompt - without calling Travila", async () => {
    // Both conditions hold at once (empty essay AND no prompt attached); the
    // empty essay must win, so a real problem is never masked by a calm state.
    vi.mocked(getActiveWorkspaceSnapshot).mockResolvedValue(snapshotWith({}) as never);

    const result = await requestPromptFitCoachAction("essay-1", "   ");

    expect(result).toEqual({ status: "error", reason: "invalid-input", detail: "Essay is empty." });
    expect(getPromptFitCoachRecommendations).not.toHaveBeenCalled();
  });

  it("returns no-prompt when the essay has no prompt attached, without calling Travila", async () => {
    vi.mocked(getActiveWorkspaceSnapshot).mockResolvedValue(snapshotWith({}) as never);

    const result = await requestPromptFitCoachAction("essay-1", ESSAY);

    expect(result).toEqual({ status: "no-prompt" });
    expect(getPromptFitCoachRecommendations).not.toHaveBeenCalled();
  });

  it("returns no-prompt when the attached prompt has no text, without calling Travila", async () => {
    vi.mocked(getActiveWorkspaceSnapshot).mockResolvedValue(
      snapshotWith({
        originPromptId: "prompt-1",
        prompts: [{ id: "prompt-1", title: "Untitled", promptText: "   ", schoolId: "school-1" }],
      }) as never,
    );

    const result = await requestPromptFitCoachAction("essay-1", ESSAY);

    expect(result).toEqual({ status: "no-prompt" });
    expect(getPromptFitCoachRecommendations).not.toHaveBeenCalled();
  });

  it("resolves the prompt text server-side from the essay's origin prompt", async () => {
    vi.mocked(getActiveWorkspaceSnapshot).mockResolvedValue(
      snapshotWith({
        originPromptId: "prompt-1",
        prompts: [
          { id: "prompt-1", title: "Challenge", promptText: "Describe a challenge you faced.", schoolId: "school-1" },
        ],
      }) as never,
    );

    await requestPromptFitCoachAction("essay-1", ESSAY);

    expect(getPromptFitCoachRecommendations).toHaveBeenCalledWith({
      content: ESSAY,
      promptText: "Describe a challenge you faced.",
      userId: "user-1",
    });
  });

  it("falls back to the prompt the essay is assigned to answer when it has no origin prompt", async () => {
    vi.mocked(getActiveWorkspaceSnapshot).mockResolvedValue(
      snapshotWith({
        linkedPrompts: [{ id: "prompt-2", schoolName: "Test College" }],
        prompts: [
          { id: "prompt-2", title: "Community", promptText: "Tell us about your community.", schoolId: "school-1" },
        ],
      }) as never,
    );

    await requestPromptFitCoachAction("essay-1", ESSAY);

    expect(getPromptFitCoachRecommendations).toHaveBeenCalledWith({
      content: ESSAY,
      promptText: "Tell us about your community.",
      userId: "user-1",
    });
  });

  it("passes the coach result straight through", async () => {
    vi.mocked(getActiveWorkspaceSnapshot).mockResolvedValue(
      snapshotWith({ originPromptText: "Describe a challenge you faced." }) as never,
    );
    const coachResult = {
      status: "ok" as const,
      overallFit: "partial" as const,
      dimensions: [{ dimension: "ask", status: "partial" as const, evidence: null, note: "thin" }],
      offTopicPassages: [],
    };
    vi.mocked(getPromptFitCoachRecommendations).mockResolvedValue(coachResult);

    const result = await requestPromptFitCoachAction("essay-1", ESSAY);

    expect(result).toBe(coachResult);
  });

  it("takes no prompt text from the caller - the action accepts only essayId and content", () => {
    // The trust boundary, asserted structurally: a third argument would mean a
    // client-supplied prompt could be analysed instead of the real assignment.
    expect(requestPromptFitCoachAction).toHaveLength(2);
  });
});
