"use client";

import { useState } from "react";

import type { ProofreadCoachFinding } from "@/lib/coaches/proofread-coach";
import type { TravilaErrorReason } from "@/lib/travila";
import { requestProofreadCoachAction } from "../../../proofread-coach-actions";

/**
 * The request/loading/proposed/error state for Proofread Coach.
 *
 * Same convention as the other coaches (documented in
 * use-shorten-coach-request.ts). No extra precondition phase: a clean essay
 * returns zero findings in the "proposed" phase, which is the good outcome
 * here rather than a state of its own.
 */
export type ProofreadCoachRequestState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "proposed"; findings: ProofreadCoachFinding[]; sourceText: string }
  | { phase: "error"; message: string };

function humanize(reason: TravilaErrorReason, detail: string | undefined): string {
  switch (reason) {
    case "not-configured":
      return "Proofread Coach isn't available right now.";
    case "invalid-input":
      return detail ?? "That request isn't valid.";
    case "timeout":
      return "Travila didn't respond in time — try again.";
    case "malformed":
    case "http":
    default:
      return "Something went wrong proofreading this essay.";
  }
}

export function useProofreadCoachRequest(essayId: string) {
  const [state, setState] = useState<ProofreadCoachRequestState>({ phase: "idle" });

  async function request(text: string) {
    setState({ phase: "loading" });
    try {
      const result = await requestProofreadCoachAction(essayId, text);
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
