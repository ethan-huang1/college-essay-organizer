"use client";

import { useState } from "react";

import type { ReviewCoachAxis } from "@/lib/coaches/review-coach";
import type { TravilaErrorReason } from "@/lib/travila";
import { requestReviewCoachAction } from "../../../review-coach-actions";

/**
 * The request/loading/proposed/error state for Review Coach.
 *
 * Same convention as the other coaches (documented in
 * use-shorten-coach-request.ts). No extra precondition phase here: this
 * coach's only precondition is a non-empty essay, which is an error case
 * rather than a calm state, so there is nothing to add for symmetry's sake.
 */
export type ReviewCoachRequestState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "proposed"; axes: ReviewCoachAxis[]; overallImpression: string; sourceText: string }
  | { phase: "error"; message: string };

function humanize(reason: TravilaErrorReason, detail: string | undefined): string {
  switch (reason) {
    case "not-configured":
      return "Review Coach isn't available right now.";
    case "invalid-input":
      return detail ?? "That request isn't valid.";
    case "timeout":
      return "Travila didn't respond in time — try again.";
    case "malformed":
    case "http":
    default:
      return "Something went wrong reviewing this essay.";
  }
}

export function useReviewCoachRequest(essayId: string) {
  const [state, setState] = useState<ReviewCoachRequestState>({ phase: "idle" });

  async function request(text: string) {
    setState({ phase: "loading" });
    const result = await requestReviewCoachAction(essayId, text);
    if (result.status === "ok") {
      setState({
        phase: "proposed",
        axes: result.axes,
        overallImpression: result.overallImpression,
        sourceText: text,
      });
    } else {
      setState({ phase: "error", message: humanize(result.reason, result.detail) });
    }
  }

  function reset() {
    setState({ phase: "idle" });
  }

  return { state, request, reset };
}
