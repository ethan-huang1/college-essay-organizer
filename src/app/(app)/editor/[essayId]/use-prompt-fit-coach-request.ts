"use client";

import { useState } from "react";

import type { OffTopicPassage, PromptCoverage, PromptFitDimension } from "@/lib/coaches/prompt-fit-coach";
import type { TravilaErrorReason } from "@/lib/travila";
import { requestPromptFitCoachAction } from "../../../prompt-fit-coach-actions";

/**
 * The request/loading/proposed/error state for Prompt Fit Coach.
 *
 * Follows the same convention as useShortenCoachRequest (documented there):
 * an idle/loading/error spine, coach-specific extra phases, and `sourceText`
 * captured at request time so staleness is a render-time comparison rather
 * than stored state. Deliberately not shared code - this coach's phases and
 * payload differ, and only `request(text)` is sent to the server (the prompt
 * is resolved server-side).
 */
export type PromptFitCoachRequestState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "no-prompt" }
  | {
      phase: "proposed";
      overallFit: PromptCoverage;
      dimensions: PromptFitDimension[];
      offTopicPassages: OffTopicPassage[];
      sourceText: string;
    }
  | { phase: "error"; message: string };

function humanize(reason: TravilaErrorReason, detail: string | undefined): string {
  switch (reason) {
    case "not-configured":
      return "Prompt Fit Coach isn't available right now.";
    case "invalid-input":
      return detail ?? "That request isn't valid.";
    case "timeout":
      return "Travila didn't respond in time — try again.";
    case "malformed":
    case "http":
    default:
      return "Something went wrong analyzing this essay.";
  }
}

export function usePromptFitCoachRequest(essayId: string) {
  const [state, setState] = useState<PromptFitCoachRequestState>({ phase: "idle" });

  async function request(text: string) {
    setState({ phase: "loading" });
    const result = await requestPromptFitCoachAction(essayId, text);
    if (result.status === "ok") {
      setState({
        phase: "proposed",
        overallFit: result.overallFit,
        dimensions: result.dimensions,
        offTopicPassages: result.offTopicPassages,
        sourceText: text,
      });
    } else if (result.status === "no-prompt") {
      setState({ phase: "no-prompt" });
    } else {
      setState({ phase: "error", message: humanize(result.reason, result.detail) });
    }
  }

  function reset() {
    setState({ phase: "idle" });
  }

  return { state, request, reset };
}
