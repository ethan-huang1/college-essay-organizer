"use client";

import type { ReviewCoachAxisId } from "@/lib/coaches/review-coach";
import { useLiveContent } from "./live-content-context";
import { useReviewCoachRequest } from "./use-review-coach-request";

/** Student-facing names. The `redundancy` id reads as "Conciseness" so that
 * a "strong" rating means what a student would expect - little unnecessary
 * repetition - rather than sounding like a fault when it is a compliment. */
const AXIS_LABEL: Record<ReviewCoachAxisId, string> = {
  structure: "Structure & flow",
  hook: "Opening hook",
  voice: "Voice & authenticity",
  specificity: "Specificity",
  reflection: "Reflection & insight",
  clarity: "Clarity",
  conclusion: "Conclusion",
  redundancy: "Conciseness",
};

const RATING_LABEL = {
  strong: "Strong",
  solid: "Solid",
  "needs-work": "Needs work",
  "not-applicable": "Not applicable",
} as const;

// Weakest first: what needs attention leads.
const RATING_ORDER = { "needs-work": 0, solid: 1, strong: 2, "not-applicable": 3 } as const;

/**
 * AI Review Coach: the broad read on the essay as writing.
 *
 * A report, not an action list - eight named axes plus a closing impression,
 * with no per-item controls and nothing to apply. It never rewrites, and it
 * deliberately does not judge prompt fit (Prompt Fit Coach owns that).
 */
export function ReviewCoachControl({ essayId }: { essayId: string }) {
  const { live } = useLiveContent();
  const { state, request, reset } = useReviewCoachRequest(essayId);

  const changedSinceGeneration = state.phase === "proposed" && state.sourceText !== live.text;

  function onReview() {
    void request(live.text);
  }

  const sortedAxes =
    state.phase === "proposed"
      ? [...state.axes].sort((a, b) => RATING_ORDER[a.rating] - RATING_ORDER[b.rating])
      : [];

  return (
    <div className="coach-control">
      <h3 className="detail-label">AI Review Coach</h3>
      <p className="detail-note">
        A broad read on the essay as a piece of writing, across eight dimensions. It never rewrites your essay —
        you decide what to change.
      </p>

      {state.phase === "idle" || state.phase === "loading" ? (
        <div className="coach-actions">
          <button className="btn" type="button" onClick={onReview} disabled={state.phase === "loading"}>
            {state.phase === "loading" ? "Reviewing…" : "Review essay"}
          </button>
        </div>
      ) : null}

      {state.phase === "error" ? (
        <>
          <p className="document-alert" role="alert">{state.message}</p>
          <button className="btn-secondary" type="button" onClick={reset}>Try again</button>
        </>
      ) : null}

      {state.phase === "proposed" ? (
        <div className="coach-results">
          <p className="coach-lead">{state.overallImpression}</p>
          {changedSinceGeneration ? (
            <p className="document-alert" role="alert">
              This essay has changed since this review was generated — re-analyze to continue.
            </p>
          ) : null}
          <ul className="rows coach-rows">
            {sortedAxes.map((entry) => (
              <li key={entry.axis} className={`coach-row review-rating-${entry.rating}`}>
                <p className="coach-row-title">{AXIS_LABEL[entry.axis]}</p>
                <p className="detail-meta">{RATING_LABEL[entry.rating]}</p>
                <p className="coach-note">{entry.comment}</p>
                {entry.example ? <p className="coach-excerpt">&ldquo;{entry.example}&rdquo;</p> : null}
              </li>
            ))}
          </ul>
          <div className="coach-actions">
            {changedSinceGeneration ? (
              <button className="btn" type="button" onClick={onReview}>Re-review</button>
            ) : (
              <button className="btn-secondary" type="button" onClick={reset}>Close</button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
