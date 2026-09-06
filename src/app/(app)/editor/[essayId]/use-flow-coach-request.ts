"use client";

import { useState } from "react";

import type { FlowCoachFinding } from "@/lib/coaches/flow-coach";
import type { TravilaErrorReason } from "@/lib/travila";
import { requestFlowCoachAction } from "../../../flow-coach-actions";

/**
 * The request/loading/proposed/error state for Flow Coach.
 *
 * Same convention as the other coaches (documented in
 * use-shorten-coach-request.ts). No extra precondition phase: an essay that
 * flows well returns zero findings in the "proposed" phase, which is a result
 * rather than a state of its own.
 */
export type FlowCoachRequestState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "proposed"; findings: FlowCoachFinding[]; sourceText: string }
  | { phase: "error"; message: string };

function humanize(reason: TravilaErrorReason, detail: string | undefined): string {
  switch (reason) {
    case "not-configured":
      return "Flow Coach isn't available right now.";
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

export function useFlowCoachRequest(essayId: string) {
  const [state, setState] = useState<FlowCoachRequestState>({ phase: "idle" });

  async function request(text: string) {
    setState({ phase: "loading" });
    try {
      const result = await requestFlowCoachAction(essayId, text);
      if (result.status === "ok") {
        setState({ phase: "proposed", findings: result.findings, sourceText: text });
      } else {
        setState({ phase: "error", message: humanize(result.reason, result.detail) });
      }
    } catch {
      // A thrown action leaves no result to inspect: the platform killing a
      // slow request at the route's maxDuration, or the connection dropping
      // mid-flight. Without this the promise rejects into the control's
      // `void request(...)`, the phase stays "loading", and the student is
      // left with a spinner that never resolves and no way back.
      setState({ phase: "error", message: "That took too long, or the connection dropped — try again." });
    }
  }

  function reset() {
    setState({ phase: "idle" });
  }

  return { state, request, reset };
}
