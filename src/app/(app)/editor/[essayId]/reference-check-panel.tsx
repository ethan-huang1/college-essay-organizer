"use client";

import { useMemo } from "react";

import { checkReferences } from "@/lib/reference-check";
import { ReferenceFlagsList, ReferenceReviewNotice } from "../../../reference-flags-view";
import { useLiveContent } from "./live-content-context";

/**
 * Editor sidebar panel: checks the live text (not just the last saved
 * version) against the current school and known school names, so a flag
 * appears or disappears as the student types, before anything is saved.
 * Detection only - nothing here changes the essay.
 */
export function ReferenceCheckPanel({
  currentSchoolName,
  otherSchoolNames,
  schoolSpecificPhrases,
  isReusedEssay,
}: {
  currentSchoolName: string | null;
  otherSchoolNames: string[];
  schoolSpecificPhrases: string[];
  isReusedEssay: boolean;
}) {
  const { live } = useLiveContent();
  const { flags } = useMemo(
    () => checkReferences(live.text, { currentSchoolName, otherSchoolNames, schoolSpecificPhrases }),
    [live.text, currentSchoolName, otherSchoolNames, schoolSpecificPhrases],
  );

  if (!isReusedEssay && flags.length === 0) return null;

  return (
    <section className="editor-panel">
      <h2>Reference check</h2>
      {isReusedEssay ? <ReferenceReviewNotice currentSchoolName={currentSchoolName} /> : null}
      {flags.length > 0 ? (
        <ReferenceFlagsList content={live.text} flags={flags} />
      ) : isReusedEssay ? (
        <p className="detail-note">No obvious references detected.</p>
      ) : null}
    </section>
  );
}
