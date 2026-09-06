"use client";

import type { ProofreadCategoryId } from "@/lib/coaches/proofread-coach";
import { useLiveContent } from "./live-content-context";
import { useProofreadCoachRequest } from "./use-proofread-coach-request";

const CATEGORY_LABEL: Record<ProofreadCategoryId, string> = {
  grammar: "Grammar",
  agreement: "Agreement",
  tense: "Verb tense",
  punctuation: "Punctuation",
  spelling: "Spelling",
  typo: "Typo",
  "word-choice": "Word choice",
};

/**
 * AI Proofread Coach: mechanical correctness, last.
 *
 * The narrowest coach in the set. It reports grammar and mechanics only, in
 * the order the errors appear, and is deliberately conservative about
 * stylistic choices - fragments for effect and conversational phrasing are
 * left alone rather than flattened.
 *
 * Corrections are shown, never applied: the essay changes only when the
 * student types. The textarea's own browser spellcheck still handles the
 * obvious red-underlined typos; this catches the contextual ones it misses.
 */
export function ProofreadCoachControl({ essayId }: { essayId: string }) {
  const { live } = useLiveContent();
  const { state, request, reset } = useProofreadCoachRequest(essayId);

  const changedSinceGeneration = state.phase === "proposed" && state.sourceText !== live.text;

  function onCheck() {
    void request(live.text);
  }

  return (
    <div className="coach-control">
      <h3 className="detail-label">AI Proofread Coach</h3>
      <p className="detail-note">
        A final pass for grammar, punctuation and mechanical slips — not style. It shows each correction rather than
        applying it, and leaves deliberate choices like fragments and conversational phrasing alone.
      </p>

      {state.phase === "idle" || state.phase === "loading" ? (
        <div className="coach-actions">
          <button className="btn" type="button" onClick={onCheck} disabled={state.phase === "loading"}>
            {state.phase === "loading" ? "Proofreading…" : "Proofread"}
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
              This essay has changed since these findings were generated — re-proofread to continue.
            </p>
          ) : null}

          {state.findings.length === 0 ? (
            <p className="detail-note">No significant proofreading issues found.</p>
          ) : (
            <ul className="rows coach-rows">
              {state.findings.map((finding, index) => (
                <li key={`${finding.category}-${index}`} className="coach-row proofread-row">
                  <p className="coach-excerpt">&ldquo;{finding.excerpt}&rdquo;</p>
                  <p className="detail-meta">{CATEGORY_LABEL[finding.category]}</p>
                  <p className="coach-note">{finding.issue}</p>
                  <p className="coach-excerpt">Corrected: &ldquo;{finding.correction}&rdquo;</p>
                </li>
              ))}
            </ul>
          )}

          <div className="coach-actions">
            {changedSinceGeneration ? (
              <button className="btn" type="button" onClick={onCheck}>Re-proofread</button>
            ) : (
              <button className="btn-secondary" type="button" onClick={reset}>Close</button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
