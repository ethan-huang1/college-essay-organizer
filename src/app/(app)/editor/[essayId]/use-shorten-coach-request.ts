"use client";

import { useState } from "react";

import type { ShortenCoachRecommendation } from "@/lib/coaches/shorten-coach";
import type { TravilaErrorReason } from "@/lib/travila";
import { requestShortenCoachAction } from "../../../shorten-coach-actions";

/**
 * The request/loading/proposed/error state for Shorten Coach - deliberately
 * separate from useShortenRequest, since a Shorten Coach "proposal" is a list
 * of shorten candidates to review, never replacement content to accept.
 * `marked` is client-only UI state (which recommendations the student has
 * flagged for removal) that is never sent to the server and never touches
 * the essay.
 */
export type ShortenCoachRequestState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "under-target"; currentWordCount: number; targetWordCount: number }
  | {
      phase: "proposed";
      currentWordCount: number;
      targetWordCount: number;
      wordsToShorten: number;
      recommendations: ShortenCoachRecommendation[];
      sourceText: string;
      marked: boolean[];
    }
  | { phase: "error"; message: string };

function humanize(reason: TravilaErrorReason, detail: string | undefined): string {
  switch (reason) {
    case "not-configured":
      return "Shorten Coach isn't available right now.";
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

export function useShortenCoachRequest(essayId: string) {
  const [state, setState] = useState<ShortenCoachRequestState>({ phase: "idle" });

  async function request(text: string, targetWordCount: number) {
    setState({ phase: "loading" });
    const result = await requestShortenCoachAction(essayId, text, targetWordCount);
    if (result.status === "ok") {
      setState({
        phase: "proposed",
        currentWordCount: result.currentWordCount,
        targetWordCount: result.targetWordCount,
        wordsToShorten: result.wordsToShorten,
        recommendations: result.recommendations,
        sourceText: text,
        marked: result.recommendations.map(() => false),
      });
    } else if (result.status === "under-target") {
      setState({ phase: "under-target", currentWordCount: result.currentWordCount, targetWordCount: result.targetWordCount });
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
