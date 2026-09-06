"use client";

import { useMemo, useState, useTransition } from "react";

import { wordCount } from "@/lib/essays";
import { diffWords } from "@/lib/word-diff";
import { acceptShortenAction } from "../../../shorten-actions";
import { useLiveContent } from "./live-content-context";
import { useShortenRequest } from "./use-shorten-request";

/**
 * Manual Shorten, in the Editor's "Shorten & adapt" panel.
 *
 * Reads the exact text on screen (via LiveContentProvider) rather than the
 * essay's last saved version, so a proposal reflects what the student is
 * actually looking at. The proposal is never applied automatically: Accept
 * is a separate, explicit step that goes through the same immutable-version
 * system every other save in this app uses, and is refused if the essay
 * changed underneath since the proposal was generated.
 */
export function ShortenControl({
  essayId,
  defaultTargetWordCount,
}: {
  essayId: string;
  defaultTargetWordCount: number | null;
}) {
  const { live } = useLiveContent();
  const { state, request, reset } = useShortenRequest(essayId);
  const [target, setTarget] = useState(defaultTargetWordCount ?? "");
  // Set only when the server refuses Accept as stale; the "student kept
  // typing" case below is derived from render, not stored, since it depends
  // only on values already available there.
  const [serverStale, setServerStale] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [showDiff, setShowDiff] = useState(false);

  // Belt-and-suspenders client half of the staleness guard: as soon as the
  // student keeps typing after a proposal came back, stop offering Accept
  // rather than waiting for the server to reject it. Derived during render
  // (not an effect) since it's a pure comparison of already-current values.
  const changedSinceGeneration = state.phase === "proposed" && state.sourceText !== live.text;
  const isStale = serverStale || changedSinceGeneration;
  const diffTokens = useMemo(
    () => (showDiff && state.phase === "proposed" ? diffWords(state.sourceText, state.shortenedContent) : []),
    [showDiff, state],
  );

  function onShorten() {
    const parsed = Number(target);
    if (!Number.isFinite(parsed)) return;
    setServerStale(false);
    setShowDiff(false);
    void request(live.text, Math.trunc(parsed));
  }

  function onAccept() {
    if (state.phase !== "proposed") return;
    startTransition(async () => {
      const result = await acceptShortenAction({
        essayId,
        content: state.shortenedContent,
        targetWordCount: state.targetWordCount,
        expectedLastEditedAt: live.expectedLastEditedAt,
      });
      if (result.status === "stale") {
        setServerStale(true);
      } else {
        reset();
      }
    });
  }

  function onCancel() {
    reset();
    setServerStale(false);
  }

  return (
    <div className="shorten-control">
      <h3 className="detail-label">Shorten with AI</h3>

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
            {state.phase === "loading" ? "Shortening…" : "Shorten"}
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
          {isStale ? (
            <p className="document-alert" role="alert">
              The essay changed since this was generated — regenerate to continue.
            </p>
          ) : null}
          <div className="shorten-actions">
            {isStale ? (
              <button className="btn" type="button" onClick={onShorten}>Regenerate</button>
            ) : (
              <button className="btn" type="button" onClick={onAccept} disabled={isPending}>
                {isPending ? "Saving…" : "Accept"}
              </button>
            )}
            <button className="btn-secondary" type="button" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
