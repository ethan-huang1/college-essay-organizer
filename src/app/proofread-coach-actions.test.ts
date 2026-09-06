import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/workspace-session", () => ({ getActiveWorkspaceSnapshot: vi.fn() }));
vi.mock("@/lib/coaches/proofread-coach", async () => {
  const actual = await vi.importActual<typeof import("@/lib/coaches/proofread-coach")>("@/lib/coaches/proofread-coach");
  return { ...actual, getProofreadCoachFindings: vi.fn() };
});

import { requestProofreadCoachAction } from "./proofread-coach-actions";
import { getProofreadCoachFindings } from "@/lib/coaches/proofread-coach";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";

const ESSAY = "The storm took the greenhouse roof, and the February rewrite was funded.";

function snapshot() {
  return {
    user: { id: "user-1" },
    workspace: { id: "ws-1" },
    schools: [{ id: "school-1", name: "Test College" }],
    prompts: [{ id: "prompt-1", title: "Challenge", promptText: "Describe a challenge.", schoolId: "school-1" }],
    essays: [{ id: "essay-1", title: "Greenhouse", originPromptId: "prompt-1", linkedPrompts: [] }],
  };
}

const okResult = { status: "ok" as const, findings: [] };

describe("requestProofreadCoachAction", () => {
  beforeEach(() => {
    vi.mocked(getActiveWorkspaceSnapshot).mockResolvedValue(snapshot() as never);
    vi.mocked(getProofreadCoachFindings).mockReset();
    vi.mocked(getProofreadCoachFindings).mockResolvedValue(okResult);
  });

  it("returns invalid-input when the essay is not in the active workspace, without calling Travila", async () => {
    const result = await requestProofreadCoachAction("missing-essay", ESSAY);

    expect(result).toMatchObject({ status: "error", reason: "invalid-input" });
    expect(getProofreadCoachFindings).not.toHaveBeenCalled();
  });

  it("delegates the sent text with the server-resolved user id", async () => {
    // The text analysed is whatever the client sent - the live unsaved draft -
    // not the essay's last saved content from the snapshot.
    await requestProofreadCoachAction("essay-1", ESSAY);

    expect(getProofreadCoachFindings).toHaveBeenCalledWith({ content: ESSAY, userId: "user-1" });
  });

  it("passes the coach result straight through", async () => {
    expect(await requestProofreadCoachAction("essay-1", ESSAY)).toBe(okResult);
  });
});
