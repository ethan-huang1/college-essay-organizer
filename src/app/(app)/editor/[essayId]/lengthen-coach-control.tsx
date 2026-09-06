"use client";

import { useState } from "react";

import { useLiveContent } from "./live-content-context";
import { useLengthenCoachRequest } from "./use-lengthen-coach-request";

const SIZE_LABEL = { small: "Small addition", moderate: "Moderate addition", significant: "Significant addition" } as const;

/**
 * AI Lengthen Coach: where would more detail actually earn its words?
 *
 * An action list like Shorten Coach (each idea can be kept or marked as
 * planned), but the summary is a plain count rather than a word total -
 * there is no honest number of words for text that does not exist yet, so
 * inventing one here would undercut the whole point. Nothing in this
 * component ever writes the expansion or edits the essay.
 */
export function LengthenCoachControl({
  essayId,
  defaultTargetWordCount,
}: {
  essayId: string;
  defaultTargetWordCount: number | null;
}) {
  const { live } = useLiveContent();
  const { state, request, toggleMarked, reset } = useLengthenCoachRequest(essayId);
  const [target, setTarget] = useState<number | "">(defaultTargetWordCount ?? "");

  const changedSinceGeneration = state.phase === "proposed" && state.sourceText !== live.text;

  function onAnalyze() {
    // A blank target is valid here: "show me where more detail would help"
    // does not need a number.
    const parsed = Number(target);
    const targetWordCount = target === "" || !Number.isFinite(parsed) || parsed < 1 ? null : Math.trunc(parsed);
    void request(live.text, targetWordCount);
  }

  const markedCount =
    state.phase === "proposed" ? state.marked.filter(Boolean).length : 0;

  return (
    <div className="coach-control">
      <h3 className="detail-label">AI Lengthen Coach</h3>
      <p className="detail-note">
        Finds the moments where more specificity, reflection, context, or evidence would strengthen the essay. It
        never writes the addition — you decide what to add.
      </p>

      {state.phase === "idle" || state.phase === "loading" ? (
        <div className="coach-request">
          <label>
            Target words (optional)
            <input
              type="number"
              min={1}
              step={1}
              value={target}
              onChange={(event) => setTarget(event.target.value === "" ? "" : Number(event.target.value))}
              disabled={state.phase === "loading"}
            />
          </label>
          <button className="btn" type="button" onClick={onAnalyze} disabled={state.phase === "loading"}>
            {state.phase === "loading" ? "Analyzing…" : "Find expansion ideas"}
          </button>
        </div>
      ) : null}

      {state.phase === "error" ? (
        <>
          <p className="document-alert" role="alert">{state.message}</p>
          <button className="btn-secondary" type="button" onClick={reset}>Try again</button>
        </>
      ) : null}

      {state.phase === "no-headroom" ? (
        <>
          <p className="detail-note">
            This essay is already at or over your target ({state.currentWordCount} of {state.targetWordCount} words),
            so there&apos;s no room to expand. Try Shorten Coach instead, or raise the target.
          </p>
          <button className="btn-secondary" type="button" onClick={reset}>Close</button>
        </>
      ) : null}

      {state.phase === "proposed" ? (
        <div className="coach-results">
          <p className="detail-note">
            {state.currentWordCount} words
            {state.wordsAvailable === null ? null : <>, about {state.wordsAvailable} to spare</>}.{" "}
            {state.opportunities.length === 0
              ? null
              : `${markedCount} of ${state.opportunities.length} ${state.opportunities.length === 1 ? "idea" : "ideas"} marked.`}
          </p>
          {changedSinceGeneration ? (
            <p className="document-alert" role="alert">
              This essay has changed since these recommendations were generated — re-analyze to continue.
            </p>
          ) : null}
          {state.opportunities.length === 0 ? (
            <p className="detail-note">
              This essay looks well-developed — no clear expansion opportunities right now. Adding words just to
              reach a limit usually makes an essay weaker, not stronger.
            </p>
          ) : (
            <ul className="rows coach-rows">
              {state.opportunities.map((opportunity, index) => (
                <li key={index} className={`coach-row lengthen-size-${opportunity.expansionSize}`}>
                  <p className="coach-excerpt">&ldquo;{opportunity.excerpt}&rdquo;</p>
                  <p className="detail-meta">{SIZE_LABEL[opportunity.expansionSize]}</p>
                  <p className="coach-note">{opportunity.reason}</p>
                  <p className="coach-note">Consider: {opportunity.suggestion}</p>
                  <div className="coach-actions">
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
                      Mark as planned
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="coach-actions">
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
