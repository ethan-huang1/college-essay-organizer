import { snippetAround, type ReferenceFlag, type ReferenceSegment } from "@/lib/reference-check";

/**
 * Presentation for the "Reference check" feature, shared between the Essay
 * Editor and the Reuse flow's Shorten preview - both read `ReferenceFlag[]`
 * from `checkReferences` and render it the same way, without duplicating
 * this JSX at each call site.
 */

function flagClassName(flag: ReferenceFlag) {
  return flag.kind === "confirmed" ? "flag-confirmed" : "flag-potential";
}

/**
 * Always-on disclaimer, independent of what was or wasn't detected. The
 * potential-reference heuristic is deliberately conservative (see
 * reference-check.ts) and will miss bare names with no institutional anchor,
 * so this must never be silent just because nothing was flagged.
 */
export function ReferenceReviewNotice({ currentSchoolName }: { currentSchoolName: string | null }) {
  const school = currentSchoolName ?? "this school";
  return (
    <p className="detail-note">
      Before submitting, review all school-specific names, clubs, courses, professors, buildings, programs,
      traditions, and other references to make sure they are appropriate for {school}. This checker may not catch
      every school-specific reference.
    </p>
  );
}

/**
 * Compact list: matched phrase, a short surrounding-context snippet, and the
 * note explaining why it was flagged. Used wherever space is constrained
 * (editor sidebar, Shorten preview) - never the full essay body.
 */
export function ReferenceFlagsList({ content, flags }: { content: string; flags: ReferenceFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <ul className="reference-flags-list">
      {flags.map((flag) => (
        <li key={flag.id} className={flagClassName(flag)}>
          <p className="reference-flag-phrase">
            <mark className={flagClassName(flag)}>{flag.text}</mark>
          </p>
          <p className="reference-flag-context">{snippetAround(content, flag)}</p>
          <p className="reference-flag-note">{flag.note}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Full read-only marked-up text - used only by the Editor's "Review
 * references" mode, which replaces the live textarea rather than overlaying
 * it. Never used in the sidebar or the Shorten preview.
 */
export function ReferenceHighlightedText({ segments }: { segments: ReferenceSegment[] }) {
  return (
    <div className="reference-marked-text" aria-label="Essay text with flagged references highlighted">
      {segments.map((segment, index) =>
        segment.flag ? (
          <mark key={segment.flag.id + index} className={flagClassName(segment.flag)} title={segment.flag.note}>
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </div>
  );
}
