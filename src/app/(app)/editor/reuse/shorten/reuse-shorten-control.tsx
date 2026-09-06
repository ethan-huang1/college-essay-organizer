"use client";

import { useMemo, useState } from "react";

import { wordCount } from "@/lib/essays";
import { checkReferences } from "@/lib/reference-check";
import { diffWords } from "@/lib/word-diff";
import { ReferenceFlagsList, ReferenceReviewNotice } from "../../../../reference-flags-view";
import { acceptReuseWithShortenAction } from "../../../../shorten-actions";
import { useShortenRequest } from "../../[essayId]/use-shorten-request";

/**
 * Reuse's "Shorten automatically": a one-shot flow, not the live editor, so
 * there is no autosave/live-content to race against - the source essay's
 * server-rendered content is what gets shortened, and Accept hands the result
 * to acceptReuseWithShortenAction, which reuses the essay (unmodified
 * reuseEssayForPrompt) and then saves the shortened text as an explicit
 * second version on the fresh copy. The page this renders inside already
 * offers its own "Back" action for leaving without shortening.
 */
export function ReuseShortenControl({
  essayId,
  content,
  defaultTargetWordCount,
  promptId,
  expectedAssignedEssayId,
  from,
  currentSchoolName,
  otherSchoolNames,
  schoolSpecificPhrases,
}: {
  essayId: string;
  content: string;
  defaultTargetWordCount: number;
  promptId: string;
  expectedAssignedEssayId: string;
  from: string;
  currentSchoolName: string | null;
  otherSchoolNames: string[];
  schoolSpecificPhrases: string[];
}) {
  const { state, request, reset } = useShortenRequest(essayId);
  const [target, setTarget] = useState<number | "">(defaultTargetWordCount);
  const [showDiff, setShowDiff] = useState(false);

  const referenceFlags = useMemo(
    () =>
      state.phase === "proposed"
        ? checkReferences(state.shortenedContent, { currentSchoolName, otherSchoolNames, schoolSpecificPhrases }).flags
        : [],
    [state, currentSchoolName, otherSchoolNames, schoolSpecificPhrases],
  );
  const diffTokens = useMemo(
    () => (showDiff && state.phase === "proposed" ? diffWords(content, state.shortenedContent) : []),
    [showDiff, state, content],
  );

  function onShorten() {
    const parsed = Number(target);
    if (!Number.isFinite(parsed)) return;
    setShowDiff(false);
    void request(content, Math.trunc(parsed));
  }

  return (
    <div className="shorten-control">
      {state.phase === "idle" || state.phase === "loading" ? (
        <div className="shorten-request">
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
          <button className="btn" type="button" onClick={onShorten} disabled={state.phase === "loading" || target === ""}>
            {state.phase === "loading" ? "Shortening…" : "Shorten automatically"}
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
        <div className="shorten-preview">
          <p className="detail-note">
            Proposed revision, {wordCount(state.shortenedContent)} words. Nothing is saved until you accept it.
          </p>
          <ReferenceReviewNotice currentSchoolName={currentSchoolName} />
          {referenceFlags.length > 0 ? (
            <ReferenceFlagsList content={state.shortenedContent} flags={referenceFlags} />
          ) : (
            <p className="detail-note">No obvious references detected.</p>
          )}
          <div className="shorten-view-toggle">
            <button className="btn-secondary" type="button" onClick={() => setShowDiff((value) => !value)}>
              {showDiff ? "Hide changes" : "View changes"}
            </button>
          </div>
          {showDiff ? (
            <div className="shorten-diff" aria-label="Changes from the original essay">
              {diffTokens.map((token, index) =>
                token.type === "same" ? (
                  <span key={index}>{token.text}</span>
                ) : (
                  <mark key={index} className={token.type === "removed" ? "diff-removed" : "diff-added"}>
                    {token.text}
                  </mark>
                ),
              )}
            </div>
          ) : (
            <textarea aria-label="Proposed shortened essay" readOnly value={state.shortenedContent} />
          )}
          <div className="shorten-actions">
            <form action={acceptReuseWithShortenAction}>
              <input name="promptId" type="hidden" value={promptId} />
              <input name="essayId" type="hidden" value={essayId} />
              <input name="expectedAssignedEssayId" type="hidden" value={expectedAssignedEssayId} />
              <input name="from" type="hidden" value={from} />
              <input name="content" type="hidden" value={state.shortenedContent} />
              <input name="targetWordCount" type="hidden" value={state.targetWordCount} />
              <button className="btn" type="submit">Accept</button>
            </form>
            <button className="btn-secondary" type="button" onClick={reset}>Cancel</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
