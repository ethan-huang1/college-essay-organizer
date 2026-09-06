"use client";

import { useState } from "react";

import type { ShortenResult } from "@/lib/travila";
import { requestShortenAction } from "../../../shorten-actions";

/**
 * The request/loading/proposed/error part of Shorten, shared between the
 * Editor's live ShortenControl and the Reuse flow's one-shot shorten page.
 * What differs between the two (whether content comes from live autosave
 * state or a static server-rendered snapshot, and what Accept submits to) is
 * intentionally left to each caller rather than folded in here.
 */
export type ShortenRequestState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "proposed"; shortenedContent: string; targetWordCount: number; sourceText: string }
  | { phase: "error"; message: string };

function humanize(result: Extract<ShortenResult, { status: "error" }>): string {
  switch (result.reason) {
    case "not-configured":
      return "Shortening isn't available right now.";
    case "invalid-input":
      return result.detail ?? "That request isn't valid.";
    case "timeout":
      return "Travila didn't respond in time — try again.";
    case "malformed":
    case "http":
    default:
      return "Something went wrong shortening this essay.";
  }
}

export function useShortenRequest(essayId: string) {
  const [state, setState] = useState<ShortenRequestState>({ phase: "idle" });

  async function request(text: string, targetWordCount: number) {
    setState({ phase: "loading" });
    const result = await requestShortenAction(essayId, text, targetWordCount);
    if (result.status === "ok") {
      setState({ phase: "proposed", shortenedContent: result.shortenedContent, targetWordCount, sourceText: text });
    } else {
      setState({ phase: "error", message: humanize(result) });
    }
  }

  function reset() {
    setState({ phase: "idle" });
  }

  return { state, request, reset };
}
