"use client";

import { useMemo, useState } from "react";

import { checkReferences } from "@/lib/reference-check";
import type { WordLimits } from "../../../essay-guidance";
import { ReferenceHighlightedText } from "../../../reference-flags-view";
import { DocumentSurface } from "./document-surface";
import { useLiveContent } from "./live-content-context";

/**
 * Wraps the writing surface with an opt-in "Review references" mode: a
 * read-only, fully highlighted rendering of the same text, for a reused essay
 * where the sidebar's compact list isn't enough context.
 *
 * DocumentSurface stays mounted the whole time - toggling only changes
 * whether a sibling `<div hidden>` wrapper around it is visible. Its autosave
 * reducer, debounce timer, and LiveContentProvider sync effect keep running
 * exactly as before either way, so entering/leaving review mode can never
 * lose an edit or disturb the optimistic-concurrency token.
 */
export function DocumentSurfaceWithReview({
  essayId,
  initialContent,
  initialSavedAt,
  limits,
  currentSchoolName,
  otherSchoolNames,
  schoolSpecificPhrases,
  isReusedEssay,
}: {
  essayId: string;
  initialContent: string;
  initialSavedAt: number;
  limits: WordLimits;
  currentSchoolName: string | null;
  otherSchoolNames: string[];
  schoolSpecificPhrases: string[];
  isReusedEssay: boolean;
}) {
  const [reviewMode, setReviewMode] = useState(false);
  const { live } = useLiveContent();
  const { segments } = useMemo(
    () => checkReferences(live.text, { currentSchoolName, otherSchoolNames, schoolSpecificPhrases }),
    [live.text, currentSchoolName, otherSchoolNames, schoolSpecificPhrases],
  );

  return (
    <div className="document-surface-wrap">
      {isReusedEssay ? (
        <div className="document-review-toggle">
          <button className="btn-secondary" type="button" onClick={() => setReviewMode((value) => !value)}>
            {reviewMode ? "Back to editing" : "Review references"}
          </button>
        </div>
      ) : null}
      <div hidden={reviewMode}>
        <DocumentSurface essayId={essayId} initialContent={initialContent} initialSavedAt={initialSavedAt} limits={limits} />
      </div>
      {reviewMode ? <ReferenceHighlightedText segments={segments} /> : null}
    </div>
  );
}
