import Link from "next/link";
import type { CSSProperties } from "react";

import { TOP_UNIVERSITIES } from "@/lib/top-universities";
import { ACTION_LABELS, type RecommendedAction } from "@/lib/matching";
import { reuseCandidate, workState } from "@/lib/progress";
import type { WorkloadSummary } from "@/lib/workload";
import type { WorkspaceSnapshot } from "@/lib/workspaces";
import { draftEssayForPromptAction, reuseEssayForPromptAction, unassignEssayAction } from "./assignment-actions";
import { addCollegeAction } from "./college-actions";
import { PendingButton } from "./pending-button";
import { deletePromptAction, setPromptStatusAction, updatePromptAction } from "./prompt-actions";
import { statusLabel } from "./text";

export type WorkspacePrompt = WorkspaceSnapshot["prompts"][number];

const WORK_LABEL = { complete: "Complete", "in-progress": "In progress", "not-started": "Not started" } as const;

const PROMPT_STATUSES = [
  ["not-started", "Not started"],
  ["in-progress", "In progress"],
  ["complete", "Complete"],
  ["submitted", "Submitted"],
] as const;

export function AddCollegeForm() {
  return (
    <form action={addCollegeAction} className="crud-form">
      <div>
        <label htmlFor="college-name">College name</label>
        <input
          id="college-name"
          name="collegeName"
          required
          minLength={2}
          maxLength={120}
          list="top-universities"
          placeholder="Search the top 100, or type any school"
        />
        <datalist id="top-universities">
          {TOP_UNIVERSITIES.map((name) => <option key={name} value={name} />)}
        </datalist>
      </div>
      <PendingButton pendingLabel="Adding…">Add college</PendingButton>
      <p className="classification-help field-wide">
        A school we have verified 2026–27 prompts for imports and classifies them automatically. Any other name still
        adds the school — you can add its prompts by hand.
      </p>
    </form>
  );
}

export function limitLabel(prompt: WorkspacePrompt) {
  if (prompt.maxWordCount) return `${prompt.maxWordCount} words`;
  if (prompt.maxCharCount) return `${prompt.maxCharCount} chars`;
  if (prompt.minWordCount) return `${prompt.minWordCount}+ words`;
  return "No limit";
}

// Verification is a one-glyph signal in the collapsed row; the sentence-length
// explanation and the source link live in the expanded detail instead.
const VERIFICATION_LABEL = {
  "officially-verified": "Official",
  "common-app-verified": "Common App",
  "previous-cycle": "Previous cycle",
  "no-supplement-confirmed": "No supplement",
  "needs-review": "Needs review",
  manual: "Entered by you",
} as const;

function verificationTone(status: WorkspacePrompt["verificationStatus"]) {
  if (status === "officially-verified" || status === "common-app-verified") return "verified";
  if (status === "manual" || status === "no-supplement-confirmed") return "manual";
  return status === "previous-cycle" ? "previous-cycle" : "unverified";
}

export function VerificationBadge({ prompt }: { prompt: WorkspacePrompt }) {
  const tone = verificationTone(prompt.verificationStatus);
  const label = VERIFICATION_LABEL[prompt.verificationStatus];
  const content = (
    <>
      {tone === "verified" ? <span aria-hidden="true">✓ </span> : null}
      {label}
    </>
  );
  return prompt.sourceUrl ? (
    <a className={`verification-badge ${tone}`} href={prompt.sourceUrl} target="_blank" rel="noreferrer">
      {content}
    </a>
  ) : (
    <span className={`verification-badge ${tone}`}>{content}</span>
  );
}

// The required prominent statement for a previous-cycle prompt - kept on the
// collapsed row (not hidden behind disclosure) so it can never be missed.
function PreviousCycleWarning({ cycleLabel }: { cycleLabel: string }) {
  return (
    <span className="cycle-warning">
      ⚠ {cycleLabel} prompt — 2026–27 wording not yet confirmed. Do not treat as a current requirement.
    </span>
  );
}

/**
 * Progress for a card header, measured against the essays the schools
 * actually ask for rather than the number of prompt rows: a choose-4-of-8 set
 * that is done reads as full rather than half.
 *
 * The fraction is rendered as text inside the ring and the element is a real
 * progressbar with an accessible name, so the arc is never the only carrier of
 * the information.
 */
export function ProgressRing({
  progress,
  label,
  caption,
}: {
  progress: WorkloadSummary;
  label: string;
  /** Word under the fraction, e.g. "Complete". Decorative: the accessible name already says it. */
  caption?: string;
}) {
  const { requiredComplete: done, requiredTotal: total } = progress;

  // A progressbar with aria-valuemax="0" is not a valid progressbar, and "0 of
  // 0 complete" tells a screen-reader user nothing. With nothing to measure the
  // ring is decoration; the reason there is nothing to measure is already
  // stated in words next to it.
  if (total === 0) {
    return (
      <span className="ring" style={{ "--share": 0 } as CSSProperties} aria-hidden="true">
        <span className="ring-value">—</span>
      </span>
    );
  }

  return (
    <span
      className={`ring${done === total ? " ring-done" : ""}`}
      style={{ "--share": Math.round((done / total) * 100) } as CSSProperties}
      role="progressbar"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`${label}: ${done} of ${total} required ${total === 1 ? "prompt" : "prompts"} complete`}
    >
      <span className="ring-value">{done}/{total}</span>
      {caption ? <span className="ring-caption" aria-hidden="true">{caption}</span> : null}
    </span>
  );
}

export function ProgressLine({ progress, className }: { progress: WorkloadSummary; className?: string }) {
  const dot = <span aria-hidden="true"> · </span>;
  return (
    <p className={`progress-line${className ? ` ${className}` : ""}`}>
      <strong>{progress.requiredTotal}</strong> required
      {dot}
      {progress.requiredComplete} done
      {dot}
      {progress.requiredRemaining} to go
      {progress.optionalExtra > 0 ? <>{dot}<span className="muted">{progress.optionalExtra} optional</span></> : null}
      {progress.programSpecific > 0 ? <>{dot}<span className="muted">{progress.programSpecific} program-specific</span></> : null}
      {progress.unresolvedConditional > 0 ? (
        <>{dot}<span className="unresolved-count">{progress.unresolvedConditional} unresolved</span></>
      ) : null}
      {progress.previousCycle > 0 ? <>{dot}<span className="muted">{progress.previousCycle} previous-cycle</span></> : null}
    </p>
  );
}

export function PromptFields({ snapshot, prompt }: { snapshot: WorkspaceSnapshot; prompt?: WorkspacePrompt }) {
  const deadline = prompt?.deadline ? prompt.deadline.toISOString().slice(0, 10) : "";
  return (
    <div className="prompt-fields">
      <label>School<select name="schoolId" required defaultValue={prompt?.schoolId ?? snapshot.schools[0]?.id}>
        {snapshot.schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
      </select></label>
      <label>Title<input name="title" required minLength={2} maxLength={160} defaultValue={prompt?.title} placeholder="Community contribution" /></label>
      <label className="field-wide">Full prompt<textarea name="promptText" required minLength={10} maxLength={5000} defaultValue={prompt?.promptText} placeholder="Paste the complete prompt text" /></label>
      <label>Minimum words<input name="minWordCount" type="number" min={0} step={1} defaultValue={prompt?.minWordCount ?? ""} /></label>
      <label>Maximum words<input name="maxWordCount" type="number" min={0} step={1} defaultValue={prompt?.maxWordCount ?? ""} /></label>
      <label>Minimum characters<input name="minCharCount" type="number" min={0} step={1} defaultValue={prompt?.minCharCount ?? ""} /></label>
      <label>Maximum characters<input name="maxCharCount" type="number" min={0} step={1} defaultValue={prompt?.maxCharCount ?? ""} /></label>
      <label>Requirement<select name="requirement" defaultValue={prompt?.requirement ?? "required"}><option value="required">Required</option><option value="optional">Optional</option><option value="conditional">Conditional</option></select></label>
      <label className="field-wide">Conditional note <span>required if Requirement is Conditional</span><input name="conditionalNote" maxLength={300} defaultValue={prompt?.conditionalNote ?? ""} placeholder="Applies only to applicants selecting..." /></label>
      <label>Status<select name="status" defaultValue={prompt?.status ?? "not-started"}>
        {PROMPT_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Deadline<input name="deadline" type="date" defaultValue={deadline} /></label>
      {/* One category control, seven options. The secondary-category wall put
          ten checkboxes in front of a decision nobody has to make; import-derived
          secondary links are preserved and still scored, they are just no longer
          hand-edited here. */}
      <label>Category<select name="primaryFamilyId" defaultValue={prompt?.primaryFamily?.id ?? ""}><option value="">No category</option>{snapshot.families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}</select></label>
      <label className="field-wide">Notes<input name="notes" maxLength={2000} defaultValue={prompt?.notes ?? ""} placeholder="Requirements, ideas, or context" /></label>
    </div>
  );
}

function ResponseBlock({ prompt }: { prompt: WorkspacePrompt }) {
  const reusable = reuseCandidate(prompt);
  if (prompt.assignedEssay) {
    return (
      <div className="response-block">
        <p className="detail-label">Response</p>
        <p className="assigned-essay-name">{prompt.assignedEssay.title}</p>
        <div className="detail-actions">
          <Link className="text-link" href={`/editor/${prompt.assignedEssay.id}`}>Open in editor <span aria-hidden="true">→</span></Link>
          <form action={unassignEssayAction}>
            <input name="promptId" type="hidden" value={prompt.id} />
            <button className="text-link" type="submit">Unassign</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="response-block">
      <p className="detail-label">{reusable ? "Reuse an essay you already have" : "Closest essays in your library"}</p>
      {prompt.suggestedMatches.length > 0 ? (
        // One form, one submit button per candidate: the clicked button's
        // name/value is what gets submitted, so this stays a single form
        // instead of one per suggestion on every row of a 100-prompt list.
        //
        // Reuse copies rather than links, so "Use this" ends in a new document
        // for *this* prompt seeded with that essay's text. This block only
        // renders when the prompt has no answer yet, so there is nothing to
        // displace and nothing to confirm; the write checks that again anyway.
        <form action={reuseEssayForPromptAction}>
          <input name="promptId" type="hidden" value={prompt.id} />
          <input name="expectedAssignedEssayId" type="hidden" value="" />
          <input name="from" type="hidden" value="/schools" />
          <ul className="suggestion-list">
            {prompt.suggestedMatches.map((match) => (
              <li key={match.essayId}>
                <span className="match-score">{match.score}</span>
                <span className="suggestion-name">{match.essayTitle}</span>
                <span className="suggestion-action">{ACTION_LABELS[match.recommendedAction as RecommendedAction]}</span>
                <button className="text-link suggestion-copy" type="submit" name="essayId" value={match.essayId}>Copy it here</button>
              </li>
            ))}
          </ul>
        </form>
      ) : (
        <p className="detail-note">No essay in your library matches this prompt yet.</p>
      )}
      {prompt.suggestedMatches.length > 0 && !reusable ? (
        <p className="detail-note">No strong match yet — this one probably wants a fresh response.</p>
      ) : null}
      <form action={draftEssayForPromptAction} className="detail-actions">
        <input name="promptId" type="hidden" value={prompt.id} />
        <PendingButton className="text-link" pendingLabel="Opening…">Start writing this prompt <span aria-hidden="true">→</span></PendingButton>
      </form>
    </div>
  );
}

export function PromptRow({
  snapshot,
  prompt,
  schoolName,
  showSchool = true,
  editHref,
  cancelHref,
  editing = false,
}: {
  snapshot: WorkspaceSnapshot;
  prompt: WorkspacePrompt;
  schoolName: string;
  showSchool?: boolean;
  editHref: string;
  cancelHref: string;
  editing?: boolean;
}) {
  const state = workState(prompt);
  const reuse = reuseCandidate(prompt);

  return (
    <details className="prompt-row" id={`prompt-${prompt.id}`} open={editing}>
      <summary>
        <span className={`work-dot ${state}`} aria-hidden="true" />
        <span className="cell-title">
          <span className="cell-topline">
            {showSchool ? <span className="cell-school">{schoolName}</span> : null}
            {prompt.requirement === "required" ? null : <span className="req-tag">{statusLabel(prompt.requirement)}</span>}
          </span>
          <span className="cell-prompt">{prompt.title}</span>
        </span>
        <span className="cell-limit">{limitLabel(prompt)}</span>
        <span className="cell-category">
          {prompt.primaryFamily ? (
            <>
              <span className="swatch" style={{ backgroundColor: prompt.primaryFamily.color }} aria-hidden="true" />
              {prompt.primaryFamily.name}
            </>
          ) : (
            <span className="muted">Unclassified</span>
          )}
        </span>
        <span className={`cell-state ${state}`}>{WORK_LABEL[state]}</span>
        <span className="cell-essay">
          {prompt.assignedEssay ? (
            <>
              <span className="essay-mark" aria-hidden="true">◆</span>
              {prompt.assignedEssay.title}
            </>
          ) : reuse ? (
            <>
              <span className="reuse-mark" aria-hidden="true">↻</span>
              {reuse.essayTitle}
            </>
          ) : (
            <span className="muted">—</span>
          )}
        </span>
        {prompt.isCurrentCycle ? null : <PreviousCycleWarning cycleLabel={prompt.cycleLabel} />}
      </summary>

      <div className="prompt-detail">
        <div className="detail-top">
          <div className="detail-prompt">
            <p className="prompt-full-text">{prompt.promptText}</p>
            {prompt.requirement === "conditional" && prompt.conditionalNote ? (
              <p className="conditional-note">Conditional: {prompt.conditionalNote}</p>
            ) : null}
          </div>

          <div className="detail-meta-panel">
            <div className="detail-meta-item">
              <p className="detail-label">Word count</p>
              <p className="detail-meta-value">{limitLabel(prompt)}</p>
            </div>

            <div className="detail-meta-item">
              <p className="detail-label">Work status</p>
              <form action={setPromptStatusAction} className="status-form">
                <input name="promptId" type="hidden" value={prompt.id} />
                <select name="status" defaultValue={prompt.status} aria-label="Work status">
                  {PROMPT_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <button type="submit">Update</button>
              </form>
            </div>

            <div className="detail-meta-item">
              <p className="detail-label">Categories</p>
              <div className="family-chips">
                {prompt.primaryFamily ? (
                  <span className="primary-chip">
                    <span className="swatch" style={{ backgroundColor: prompt.primaryFamily.color }} aria-hidden="true" />
                    {prompt.primaryFamily.name}
                  </span>
                ) : (
                  <span>Unclassified</span>
                )}
                {prompt.secondaryFamilies.map((family) => <span key={family.id}>{family.name}</span>)}
              </div>
            </div>

            <div className="detail-meta-item">
              <p className="detail-label">Source</p>
              <div className="verification-row">
                <VerificationBadge prompt={prompt} />
                <span className="detail-meta">{prompt.cycleLabel} · {prompt.applicationPlatform.replaceAll("-", " ")}</span>
              </div>
              <p className="detail-meta">
                {prompt.classificationSource === "manual"
                  ? "Category set by you"
                  : prompt.classificationConfidence > 0
                    ? `Category suggested automatically · ${prompt.classificationConfidence}% confidence`
                    : "Category suggested automatically"}
              </p>
              {prompt.notes ? <p className="detail-note">{prompt.notes}</p> : null}
            </div>
          </div>
        </div>

        <ResponseBlock prompt={prompt} />

        {/* The full edit form is loaded on demand via ?edit=<id> rather than
            inlined under every row - a school list can hold 100+ prompts, and
            100+ copies of this form is megabytes of markup nobody looks at. */}
        <div className="prompt-edit">
          {editing ? (
            <>
              <div className="prompt-edit-head">
                <p className="detail-label">Edit prompt or category</p>
                <Link className="text-link" href={cancelHref}>Done</Link>
              </div>
              <form action={updatePromptAction} className="prompt-form">
                <input name="promptId" type="hidden" value={prompt.id} />
                <PromptFields snapshot={snapshot} prompt={prompt} />
                <p className="classification-help">Saving replaces the category assignment and records it as your manual override.</p>
                <button type="submit">Save prompt</button>
              </form>
              <form action={deletePromptAction} className="delete-form">
                <input name="promptId" type="hidden" value={prompt.id} />
                <span>Deleting also removes this prompt&apos;s category links, matches, and response assignment.</span>
                <button type="submit">Delete prompt</button>
              </form>
            </>
          ) : (
            <Link className="text-link" href={editHref}>Edit prompt or category <span aria-hidden="true">→</span></Link>
          )}
        </div>
      </div>
    </details>
  );
}
