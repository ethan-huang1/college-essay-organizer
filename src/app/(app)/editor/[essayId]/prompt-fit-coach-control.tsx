"use client";

import { useLiveContent } from "./live-content-context";
import { usePromptFitCoachRequest } from "./use-prompt-fit-coach-request";

const COVERAGE_LABEL = { strong: "Strong", partial: "Partial", weak: "Weak" } as const;
const STATUS_LABEL = { strong: "Strong", partial: "Partial", missing: "Missing" } as const;
const STATUS_ORDER = { missing: 0, partial: 1, strong: 2 } as const;

/**
 * AI Prompt Fit Coach: does this essay answer its assigned prompt?
 *
 * A report, not an action list - there is nothing here to accept or apply, so
 * unlike Shorten Coach there are no Keep/Mark controls. The prompt being
 * measured against is resolved server-side from the essay's own assignment;
 * this component only sends the live essay text.
 */
export function PromptFitCoachControl({ essayId }: { essayId: string }) {
  const { live } = useLiveContent();
  const { state, request, reset } = usePromptFitCoachRequest(essayId);

  const changedSinceGeneration = state.phase === "proposed" && state.sourceText !== live.text;

  function onAnalyze() {
    void request(live.text);
  }

  // Weakest coverage first: what still needs work is what the student came for.
  const sortedDimensions =
    state.phase === "proposed"
      ? [...state.dimensions].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
      : [];

  return (
    <div className="coach-control">
      <h3 className="detail-label">AI Prompt Fit Coach</h3>
      <p className="detail-note">
        Checks how well this essay answers the prompt it&apos;s attached to, ask by ask. It never rewrites your
        essay — you decide what to change.
      </p>

      {state.phase === "idle" || state.phase === "loading" ? (
        <div className="coach-actions">
          <button className="btn" type="button" onClick={onAnalyze} disabled={state.phase === "loading"}>
            {state.phase === "loading" ? "Analyzing…" : "Analyze prompt fit"}
          </button>
        </div>
      ) : null}

      {state.phase === "error" ? (
        <>
          <p className="document-alert" role="alert">{state.message}</p>
          <button className="btn-secondary" type="button" onClick={reset}>Try again</button>
        </>
      ) : null}

      {state.phase === "no-prompt" ? (
        <>
          <p className="detail-note">
            This essay isn&apos;t attached to a prompt with any text yet, so there&apos;s nothing to measure its fit
            against. Attach one under Document details, then analyze.
          </p>
          <button className="btn-secondary" type="button" onClick={reset}>Close</button>
        </>
      ) : null}

      {state.phase === "proposed" ? (
        <div className="coach-results">
          <p className="detail-note">
            Prompt coverage: <strong>{COVERAGE_LABEL[state.overallFit]}</strong>. Covers how well the prompt&apos;s
            own asks are answered; anything off-topic is listed separately below.
          </p>
          {changedSinceGeneration ? (
            <p className="document-alert" role="alert">
              This essay has changed since these recommendations were generated — re-analyze to continue.
            </p>
          ) : null}
          <ul className="rows coach-rows">
            {sortedDimensions.map((entry, index) => (
              <li key={index} className={`coach-row prompt-fit-${entry.status}`}>
                <p className="coach-row-title">{entry.dimension}</p>
                <p className="detail-meta">{STATUS_LABEL[entry.status]}</p>
                {entry.evidence ? <p className="coach-excerpt">&ldquo;{entry.evidence}&rdquo;</p> : null}
                <p className="coach-note">{entry.note}</p>
              </li>
            ))}
          </ul>
          {state.offTopicPassages.length > 0 ? (
            <>
              <h4 className="detail-label">Possibly off-topic</h4>
              <ul className="rows coach-rows">
                {state.offTopicPassages.map((passage, index) => (
                  <li key={index} className="coach-row prompt-fit-off-topic">
                    <p className="coach-excerpt">&ldquo;{passage.excerpt}&rdquo;</p>
                    <p className="coach-note">{passage.reason}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
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
