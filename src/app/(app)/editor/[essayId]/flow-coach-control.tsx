"use client";

import type { FlowIssueId } from "@/lib/coaches/flow-coach";
import { useLiveContent } from "./live-content-context";
import { useFlowCoachRequest } from "./use-flow-coach-request";

const ISSUE_LABEL: Record<FlowIssueId, string> = {
  "abrupt-transition": "Abrupt transition",
  "logic-jump": "Logic jump",
  "out-of-order": "Out of order",
  "stalled-pacing": "Stalled pacing",
  "unclear-connection": "Unclear connection",
};

/**
 * AI Flow Coach: where the essay is hard to follow from one idea to the next.
 *
 * A diagnosis, not an action list - each row names the seam, says what breaks
 * for a reader, and names the kind of connection that would mend it. Nothing
 * to apply and nothing to accept: it never writes the transition, because the
 * link between two of the student's own experiences is theirs to state.
 */
export function FlowCoachControl({ essayId }: { essayId: string }) {
  const { live } = useLiveContent();
  const { state, request, reset } = useFlowCoachRequest(essayId);

  const changedSinceGeneration = state.phase === "proposed" && state.sourceText !== live.text;

  function onCheck() {
    void request(live.text);
  }

  return (
    <div className="coach-control">
      <h3 className="detail-label">AI Flow Coach</h3>
      <p className="detail-note">
        Finds the places where the essay&apos;s progression is hard to follow — abrupt transitions, jumps in logic,
        connections a reader has to guess at. It explains what to improve; it never rewrites your essay.
      </p>

      {state.phase === "idle" || state.phase === "loading" ? (
        <div className="coach-actions">
          <button className="btn" type="button" onClick={onCheck} disabled={state.phase === "loading"}>
            {state.phase === "loading" ? "Checking…" : "Check flow"}
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
          {changedSinceGeneration ? (
            <p className="document-alert" role="alert">
              This essay has changed since these findings were generated — re-analyze to continue.
            </p>
          ) : null}

          {state.findings.length === 0 ? (
            <p className="detail-note">
              This essay reads as though it moves cleanly from one idea to the next — no flow problems worth flagging.
            </p>
          ) : (
            <ul className="rows coach-rows">
              {state.findings.map((finding, index) => (
                <li key={`${finding.issue}-${index}`} className="coach-row flow-row">
                  <p className="coach-excerpt">&ldquo;{finding.excerpt}&rdquo;</p>
                  <p className="detail-meta">{ISSUE_LABEL[finding.issue]}</p>
                  <p className="coach-note">{finding.observation}</p>
                  <p className="coach-note">Consider: {finding.suggestion}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="coach-actions">
            {changedSinceGeneration ? (
              <button className="btn" type="button" onClick={onCheck}>Re-check</button>
            ) : (
              <button className="btn-secondary" type="button" onClick={reset}>Close</button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
