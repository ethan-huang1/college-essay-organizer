"use client";

import { useMemo, useState } from "react";

import { checkReferences } from "@/lib/reference-check";
import { ReferenceFlagsList, ReferenceReviewNotice } from "../../../reference-flags-view";
import { useLiveContent } from "./live-content-context";

/**
 * Editor sidebar panel: a review checklist of everything in this draft that
 * may be pointed at the wrong school.
 *
 * It checks the live text (not just the last saved version) against the current
 * school and known school names, so a flag appears or disappears as the student
 * types, before anything is saved. Detection only - nothing here changes the
 * essay, and nothing here replaces a reference for the student. The point is to
 * surface what they may have forgotten to adapt.
 *
 * The panel always renders, including when it finds nothing. An earlier version
 * hid itself on a clean essay, which meant a student could never tell the
 * difference between "checked, all clear" and "this feature does not exist".
 *
 * Collapsing is a native <details>, and the count lives in the <summary> so the
 * collapsed state still answers the only question worth asking of it. Every
 * flag is listed when open - no "show more", because a half-shown checklist is
 * worse than none.
 */
export function ReferenceCheckPanel({
  currentSchoolName,
  otherSchoolNames,
  schoolSpecificPhrases,
}: {
  currentSchoolName: string | null;
  otherSchoolNames: string[];
  schoolSpecificPhrases: string[];
}) {
  const { live } = useLiveContent();
  const { flags } = useMemo(
    () => checkReferences(live.text, { currentSchoolName, otherSchoolNames, schoolSpecificPhrases }),
    [live.text, currentSchoolName, otherSchoolNames, schoolSpecificPhrases],
  );

  // Computed once, on mount, and deliberately never again: `live.text` changes
  // on every keystroke, so a re-derived `open` would spring the section back
  // open the moment the flag count crossed zero, overriding a student who had
  // just closed it. Frozen, React never touches the attribute again and the
  // native toggle stays theirs. Nothing is unmounted either way, so collapsing
  // never clears or reruns the check.
  const [initiallyOpen] = useState(() => flags.length > 0);

  return (
    <section className="editor-panel">
      <h2>Reference Check</h2>
      <details className="reference-check" open={initiallyOpen}>
        <summary>
          {flags.length === 0
            ? "None detected"
            : `${flags.length} ${flags.length === 1 ? "reference" : "references"} to review`}
        </summary>
        {flags.length > 0 ? (
          <>
            <ReferenceReviewNotice currentSchoolName={currentSchoolName} />
            <ReferenceFlagsList content={live.text} flags={flags} />
          </>
        ) : (
          <p className="detail-note">Nothing in this draft looks specific to another school.</p>
        )}
      </details>
    </section>
  );
}
