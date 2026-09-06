"use client";

import type { VividVaguenessId } from "@/lib/coaches/vivid-coach";
import { useLiveContent } from "./live-content-context";
import { useVividCoachRequest } from "./use-vivid-coach-request";

const VAGUENESS_LABEL: Record<VividVaguenessId, string> = {
  "abstract-claim": "Abstract claim",
  "generic-phrasing": "Generic phrasing",
  "told-not-shown": "Told, not shown",
  "unspecified-detail": "Unspecified detail",
};

/**
 * AI Vivid Coach: where the essay is too general to picture.
 *
 * Every row names a vague passage and the KIND of detail that would earn its
 * place - never the detail itself. That boundary is the point: the coach does
 * not know which project, which room, or which number, and supplying one would
 * put an invented experience in a student's application.
 *
 * "Vivid" here means concrete, specific and personal, not flowery.
 */
export function VividCoachControl({ essayId }: { essayId: string }) {
  const { live } = useLiveContent();
  const { state, request, reset } = useVividCoachRequest(essayId);

  const changedSinceGeneration = state.phase === "proposed" && state.sourceText !== live.text;

  function onCheck() {
    void request(live.text);
  }

  return (
    <div className="coach-control">
      <h3 className="detail-label">AI Vivid Coach</h3>
      <p className="detail-note">
        Finds the places that read as generic, vague or hard to picture, and says what kind of specific detail would
        make them land. It never invents a detail for you, and it never rewrites your essay.
      </p>

      {state.phase === "idle" || state.phase === "loading" ? (
        <div className="coach-actions">
          <button className="btn" type="button" onClick={onCheck} disabled={state.phase === "loading"}>
            {state.phase === "loading" ? "Analyzing…" : "Find vague writing"}
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
              This essay already reads as specific and concrete — nothing generic worth flagging.
            </p>
          ) : (
            <ul className="rows coach-rows">
              {state.findings.map((finding, index) => (
                <li key={`${finding.vagueness}-${index}`} className="coach-row vivid-row">
                  <p className="coach-excerpt">&ldquo;{finding.excerpt}&rdquo;</p>
                  <p className="detail-meta">{VAGUENESS_LABEL[finding.vagueness]}</p>
                  <p className="coach-note">{finding.observation}</p>
                  <p className="coach-note">What would help: {finding.detailNeeded}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="coach-actions">
            {changedSinceGeneration ? (
              <button className="btn" type="button" onClick={onCheck}>Re-analyze</button>
            ) : (
              <button className="btn-secondary" type="button" onClick={reset}>Close</button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
