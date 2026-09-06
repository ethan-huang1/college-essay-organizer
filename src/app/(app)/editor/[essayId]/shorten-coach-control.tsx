"use client";

import { useState } from "react";

import { useLiveContent } from "./live-content-context";
import { useShortenCoachRequest } from "./use-shorten-coach-request";

const PRIORITY_LABEL = { "shorten-first": "Shorten first", optional: "Optional", "last-resort": "Last resort" } as const;
const PRIORITY_ORDER = { "shorten-first": 0, optional: 1, "last-resort": 2 } as const;

/**
 * AI Shorten Coach: editorial analysis only, never a rewrite. Reads the exact
 * text on screen (via LiveContentProvider), asks Travila's dedicated Shorten
 * Coach profile which passages are candidates for shortening, and renders
 * that as excerpt + estimated words saved + reason + tradeoff. Keep / Mark
 * for removal are purely local tracking for the student - nothing here ever
 * edits, saves, or replaces the essay.
 */
export function ShortenCoachControl({
  essayId,
  defaultTargetWordCount,
}: {
  essayId: string;
  defaultTargetWordCount: number | null;
}) {
  const { live } = useLiveContent();
  const { state, request, toggleMarked, reset } = useShortenCoachRequest(essayId);
  const [target, setTarget] = useState<number | "">(defaultTargetWordCount ?? "");

  const changedSinceGeneration = state.phase === "proposed" && state.sourceText !== live.text;

  function onAnalyze() {
    const parsed = Number(target);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    void request(live.text, Math.trunc(parsed));
  }

  const sortedRecommendations =
    state.phase === "proposed"
      ? state.recommendations
          .map((recommendation, index) => ({ recommendation, index }))
          .sort((a, b) => PRIORITY_ORDER[a.recommendation.shortenPriority] - PRIORITY_ORDER[b.recommendation.shortenPriority])
      : [];
  const markedWordsSaved =
    state.phase === "proposed"
      ? state.recommendations.reduce((total, recommendation, index) => (state.marked[index] ? total + recommendation.estimatedWordsSaved : total), 0)
      : 0;

  return (
    <div className="shorten-coach-control">
      <h3 className="detail-label">AI Shorten Coach</h3>
      <p className="detail-note">
        Identifies passages that are candidates for shortening and explains the tradeoffs. It never rewrites your
        essay — you decide what to change.
      </p>

      {state.phase === "idle" || state.phase === "loading" ? (
        <div className="shorten-coach-request">
          <label>
            Target words
            <input
              type="number"
              min={1}
              step={1}
              value={target}
              onChange={(event) => setTarget(event.target.value === "" ? "" : Number(event.target.value))}
              disabled={state.phase === "loading"}
            />
          </label>
          <button className="btn" type="button" onClick={onAnalyze} disabled={state.phase === "loading" || target === ""}>
            {state.phase === "loading" ? "Analyzing…" : "Analyze"}
          </button>
        </div>
      ) : null}

      {state.phase === "error" ? (
        <>
          <p className="document-alert" role="alert">{state.message}</p>
          <button className="btn-secondary" type="button" onClick={reset}>Try again</button>
        </>
      ) : null}

      {state.phase === "under-target" ? (
        <>
          <p className="detail-note">
            This essay is already at or under your target ({state.currentWordCount} of {state.targetWordCount} words).
          </p>
          <button className="btn-secondary" type="button" onClick={reset}>Close</button>
        </>
      ) : null}

      {state.phase === "proposed" ? (
        <div className="shorten-coach-results">
          <p className="detail-note">
            {state.currentWordCount} words, {state.wordsToShorten} to shorten. {markedWordsSaved} of{" "}
            {state.wordsToShorten} marked so far.
          </p>
          {changedSinceGeneration ? (
            <p className="document-alert" role="alert">
              This essay has changed since these recommendations were generated — re-analyze to continue.
            </p>
          ) : null}
          <ul className="rows shorten-coach-rows">
            {sortedRecommendations.map(({ recommendation, index }) => (
              <li key={index} className={`shorten-coach-row shorten-priority-${recommendation.shortenPriority}`}>
                <p className="shorten-coach-excerpt">&ldquo;{recommendation.excerpt}&rdquo;</p>
                <p className="detail-meta">
                  ~{recommendation.estimatedWordsSaved} words · {PRIORITY_LABEL[recommendation.shortenPriority]}
                </p>
                <p className="shorten-coach-reason">{recommendation.reason}</p>
                <div className="shorten-coach-actions">
                  <button
                    className={state.marked[index] ? "btn-secondary" : "btn"}
                    type="button"
                    disabled={changedSinceGeneration}
                    onClick={() => toggleMarked(index)}
                  >
                    Keep
                  </button>
                  <button
                    className={state.marked[index] ? "btn" : "btn-secondary"}
                    type="button"
                    disabled={changedSinceGeneration}
                    onClick={() => toggleMarked(index)}
                  >
                    Mark for removal
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="shorten-coach-actions">
            {changedSinceGeneration ? (
              <button className="btn" type="button" onClick={onAnalyze}>Re-analyze</button>
            ) : (
              <button className="btn-secondary" type="button" onClick={reset}>Close</button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
