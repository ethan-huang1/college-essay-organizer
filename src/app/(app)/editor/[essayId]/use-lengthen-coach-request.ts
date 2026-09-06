"use client";

import { useState } from "react";

import type { LengthenCoachOpportunity } from "@/lib/coaches/lengthen-coach";
import type { TravilaErrorReason } from "@/lib/travila";
import { requestLengthenCoachAction } from "../../../lengthen-coach-actions";

/**
 * The request/loading/proposed/error state for Lengthen Coach.
 *
 * Same convention as the other coaches (documented in
 * use-shorten-coach-request.ts): idle/loading/error spine, coach-specific
 * extra phases, `sourceText` captured at request time so staleness is a
 * render-time comparison. `marked` tracks which ideas the student plans to
 * act on - client-only, never sent to the server, never persisted.
 */
export type LengthenCoachRequestState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "no-headroom"; currentWordCount: number; targetWordCount: number }
  | {
      phase: "proposed";
      currentWordCount: number;
      targetWordCount: number | null;
      wordsAvailable: number | null;
      opportunities: LengthenCoachOpportunity[];
      sourceText: string;
      marked: boolean[];
    }
  | { phase: "error"; message: string };

function humanize(reason: TravilaErrorReason, detail: string | undefined): string {
  switch (reason) {
    case "not-configured":
      return "Lengthen Coach isn't available right now.";
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

export function useLengthenCoachRequest(essayId: string) {
  const [state, setState] = useState<LengthenCoachRequestState>({ phase: "idle" });

  async function request(text: string, targetWordCount: number | null) {
    setState({ phase: "loading" });
    const result = await requestLengthenCoachAction(essayId, text, targetWordCount);
    if (result.status === "ok") {
      setState({
        phase: "proposed",
        currentWordCount: result.currentWordCount,
        targetWordCount: result.targetWordCount,
        wordsAvailable: result.wordsAvailable,
        opportunities: result.opportunities,
        sourceText: text,
        marked: result.opportunities.map(() => false),
      });
    } else if (result.status === "no-headroom") {
      setState({
        phase: "no-headroom",
        currentWordCount: result.currentWordCount,
        targetWordCount: result.targetWordCount,
      });
    } else {
      setState({ phase: "error", message: humanize(result.reason, result.detail) });
    }
  }

  function toggleMarked(index: number) {
    setState((prev) => {
      if (prev.phase !== "proposed") return prev;
      const marked = [...prev.marked];
      marked[index] = !marked[index];
      return { ...prev, marked };
    });
  }

  function reset() {
    setState({ phase: "idle" });
  }

  return { state, request, toggleMarked, reset };
}
