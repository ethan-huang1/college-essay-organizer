import Link from "next/link";

import { ACTION_LABELS, ADAPTATION_LABELS, adaptationEffort, type RecommendedAction } from "@/lib/matching";
import { reuseOpportunities, type ReuseMatch } from "@/lib/progress";
import type { WorkspaceSnapshot } from "@/lib/workspaces";
import { reuseEssayForPromptAction } from "./assignment-actions";
import { restoreEssayVersionAction } from "./essay-actions";
import { LocalTime } from "./local-time";
import { SchoolMark } from "./school-mark";
import { sentenceCase, statusLabel } from "./text";

/**
 * The essay pieces both essay surfaces need.
 *
 * My Essays is the dashboard and the Essay Editor is the writing workspace, so
 * the metadata form, the origin-prompt fields, version history, the reuse
 * ribbon and the adaptation notes are all shared rather than written twice.
 * Nothing here changed when it moved out of the section view.
 */

export type WorkspaceEssay = WorkspaceSnapshot["essays"][number];

export const ESSAY_STATUSES = ["idea", "outline", "draft", "revising", "ready", "submitted"] as const;

/** The document's name, and never an empty heading for an untitled draft. */
export function documentName(essay: { title: string }) {
  return essay.title.trim() || "Untitled document";
}

export function EssayFields({
  snapshot,
  essay,
  omitTitle,
  defaults,
  /**
   * Puts designation and school-specific phrases behind one "Advanced
   * settings" disclosure. They are modelling fields with sensible defaults, so
   * a student adding an essay should not have to read them; the editor's own
   * details form shows everything flat.
   */
  advanced,
}: {
  snapshot: WorkspaceSnapshot;
  essay?: WorkspaceEssay;
  omitTitle?: boolean;
  defaults?: { title?: string; targetWordCount?: number | null; originPromptId?: string; primaryFamilyId?: string };
  advanced?: boolean;
}) {
  const designationField = (
    <label>Designation<select name="designation" defaultValue={essay?.designation ?? "canonical"}>
      <option value="canonical">Canonical (reusable original)</option>
      <option value="school-adaptation">School-specific adaptation</option>
    </select></label>
  );
  const phrasesField = (
    <label className="field-wide">School-specific phrases <span>comma-separated, e.g. school names to flag</span>
      <input name="schoolSpecificPhrases" defaultValue={essay?.schoolSpecificPhrases.join(", ") ?? ""} placeholder="Stanford, the Farm" />
    </label>
  );

  return (
    <div className="prompt-fields">
      {omitTitle ? null : <label>Essay name<input name="title" required minLength={2} maxLength={160} defaultValue={essay?.title ?? defaults?.title} placeholder="Northwestern Diversity" /></label>}
      <label>Target words<input name="targetWordCount" type="number" min={0} step={1} defaultValue={essay?.targetWordCount ?? defaults?.targetWordCount ?? ""} /></label>
      <label>Status<select name="status" defaultValue={essay?.status ?? "idea"}>
        {ESSAY_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
      </select></label>
      {advanced ? null : designationField}
      <label>Primary category<select name="primaryFamilyId" defaultValue={essay?.primaryFamily?.id ?? defaults?.primaryFamilyId ?? ""}><option value="">No primary category</option>{snapshot.families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}</select></label>
      {advanced ? null : phrasesField}
      <OriginPromptFields snapshot={snapshot} essay={essay} defaultOriginPromptId={defaults?.originPromptId} />
      <label className="field-wide">Notes<input name="notes" maxLength={2000} defaultValue={essay?.notes ?? ""} placeholder="Context, ideas, or reminders" /></label>
      {advanced ? (
        <details className="field-group field-wide">
          <summary>Advanced settings</summary>
          <div className="prompt-fields">
            {designationField}
            {phrasesField}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/**
 * Which prompt this essay was originally written for.
 *
 * Two ways in, because both are common: pick one from the college list, or paste
 * the prompt for something not in it - a college not added yet, a scholarship, a
 * class assignment. Selecting a prompt wins over pasted text, so a student who
 * does both does not leave two answers behind.
 *
 * This is what tells the matcher what the essay *does*, which is otherwise
 * guessed from the finished essay. Leaving it blank is fine and is what every
 * essay written before this existed will carry: matching then treats the function
 * as unknown and scores it neutral rather than as a mismatch.
 *
 * The select is grouped by college, so this one control carries both the school
 * and the prompt - a separate school picker would have to filter this list, and
 * filtering it needs JavaScript this app deliberately does not use.
 */
export function OriginPromptFields({
  snapshot,
  essay,
  defaultOriginPromptId,
}: {
  snapshot: WorkspaceSnapshot;
  essay?: WorkspaceEssay;
  defaultOriginPromptId?: string;
}) {
  const schoolName = new Map(snapshot.schools.map((school) => [school.id, school.name]));
  const bySchool = new Map<string, { id: string; title: string }[]>();
  for (const prompt of snapshot.prompts) {
    const name = schoolName.get(prompt.schoolId) ?? "Unknown college";
    bySchool.set(name, [...(bySchool.get(name) ?? []), { id: prompt.id, title: prompt.title }]);
  }
  return (
    <>
      <label className="field-wide">School &amp; prompt <span>the prompt this essay answers — used to judge reuse</span>
        <select name="originPromptId" defaultValue={essay?.originPromptId ?? defaultOriginPromptId ?? ""}>
          <option value="">Not from a prompt in my list</option>
          {[...bySchool].sort(([a], [b]) => a.localeCompare(b)).map(([school, prompts]) => (
            <optgroup key={school} label={school}>
              {prompts.map((prompt) => <option key={prompt.id} value={prompt.id}>{prompt.title}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label>Or paste its title<input name="originPromptTitle" maxLength={200} defaultValue={essay?.originPromptTitle ?? ""} placeholder="Common App personal essay" /></label>
      <label className="field-wide">Or paste the original prompt <span>for a college, scholarship, or class not in your list</span>
        <textarea name="originPromptText" rows={2} maxLength={4000} defaultValue={essay?.originPromptText ?? ""} placeholder="Describe a topic, idea, or concept you find captivating…" />
      </label>
    </>
  );
}

/**
 * What this essay was written for, for display above the editor.
 *
 * Mirrors the precedence the matcher already uses - a prompt chosen from the
 * college list wins over pasted text - so the editor shows the same origin the
 * score was derived from. Read-only: nothing here decides anything.
 */
export function essayOrigin(snapshot: WorkspaceSnapshot, essay: WorkspaceEssay) {
  const linked = essay.originPromptId
    ? snapshot.prompts.find((prompt) => prompt.id === essay.originPromptId)
    : undefined;
  if (linked) {
    const school = snapshot.schools.find((candidate) => candidate.id === linked.schoolId);
    return { title: linked.title, text: linked.promptText, prompt: linked, schoolName: school?.name ?? null };
  }
  if (essay.originPromptTitle || essay.originPromptText) {
    return {
      title: essay.originPromptTitle || "Pasted prompt",
      text: essay.originPromptText,
      prompt: null,
      schoolName: null,
    };
  }
  return null;
}

/**
 * The prompt to show beside the writing, which is not always the origin.
 *
 * Origin is what the matcher scores against and is deliberately never rewritten
 * by the editor. But an essay can be answering a prompt it was not written for -
 * every essay in the example workspace is - and showing "no prompt attached"
 * over a document that is assigned to one would be false. So display falls back
 * to the prompt this essay currently answers, and says which of the two it is.
 * Read-only either way: nothing here writes an origin.
 */
export function essayPromptContext(snapshot: WorkspaceSnapshot, essay: WorkspaceEssay) {
  const origin = essayOrigin(snapshot, essay);
  if (origin) return { ...origin, source: "origin" as const };
  const assigned = essay.linkedPrompts[0];
  const prompt = assigned ? snapshot.prompts.find((candidate) => candidate.id === assigned.id) : undefined;
  if (!prompt) return null;
  return {
    title: prompt.title,
    text: prompt.promptText,
    prompt,
    schoolName: assigned?.schoolName ?? null,
    source: "assignment" as const,
  };
}

/**
 * The essay a reuse would displace, or null when it would displace nothing.
 *
 * "Nothing" covers two cases: the prompt has no answer, and the answer it has
 * is already a copy of this very essay - reusing then reattaches that copy
 * rather than pushing another essay aside, so asking would be asking about
 * nothing. The write applies the same rule, this only keeps the control honest.
 */
export function displacedByReuse(snapshot: WorkspaceSnapshot, promptId: string, essayId: string) {
  const prompt = snapshot.prompts.find((candidate) => candidate.id === promptId);
  const assignedId = prompt?.assignedEssay?.id ?? null;
  if (!assignedId || assignedId === essayId) return null;
  const assigned = snapshot.essays.find((candidate) => candidate.id === assignedId);
  return assigned?.adaptedFromEssayId === essayId ? null : assignedId;
}

/**
 * "Use here" - one control, three surfaces.
 *
 * Reuse copies rather than links, so this always ends in a new (or
 * already-copied) document for the target prompt. When that prompt already has
 * an answer the control becomes a link to the shared confirmation page instead
 * of a submit, because displacing an answer should ask first - and the write
 * refuses to displace an unnamed one regardless of which control was rendered.
 */
export function ReuseHereControl({
  promptId,
  essayId,
  assignedEssayId,
  from,
  label = "Use here",
  essayWordCount,
  promptMaxWordCount,
}: {
  promptId: string;
  essayId: string;
  assignedEssayId: string | null;
  from: string;
  label?: string;
  /** When the essay is over this prompt's word limit, "Use here" detours
   * through the confirmation page so shortening can be offered there instead
   * of silently copying text the student will have to cut anyway. */
  essayWordCount?: number;
  promptMaxWordCount?: number | null;
}) {
  const overLimit = promptMaxWordCount != null && essayWordCount != null && essayWordCount > promptMaxWordCount;
  if ((assignedEssayId && assignedEssayId !== essayId) || overLimit) {
    const params = new URLSearchParams({ promptId, essayId, from });
    return <Link className="text-link" href={`/editor/reuse?${params.toString()}`}>{label}…</Link>;
  }
  return (
    <form action={reuseEssayForPromptAction}>
      <input name="promptId" type="hidden" value={promptId} />
      <input name="essayId" type="hidden" value={essayId} />
      <input name="expectedAssignedEssayId" type="hidden" value={assignedEssayId ?? ""} />
      <input name="from" type="hidden" value={from} />
      <button className="text-link" type="submit">{label}</button>
    </form>
  );
}

/**
 * Saves, labelled by when they happened.
 *
 * Numbering them was arithmetic the student had to do - "version 7" says
 * nothing about which one you want - and the numbers climb fast. The time is
 * the thing you actually remember, so it leads the row; versionNumber still
 * orders the history underneath.
 */
export function EssayVersionHistory({ essay }: { essay: WorkspaceEssay }) {
  return (
    <div className="version-list">
      {essay.versions.map((version, index) => {
        const previous = essay.versions[index + 1];
        const delta = previous ? version.wordCount - previous.wordCount : version.wordCount;
        return (
          <details className="version-row" key={version.id}>
            <summary>
              <span><LocalTime iso={version.createdAt.toISOString()} withDate /></span>
              <span>{version.wordCount} words {previous ? `(${delta >= 0 ? "+" : ""}${delta})` : ""}</span>
              <span>{version.reason ? sentenceCase(version.reason) : "No reason given"}</span>
            </summary>
            <p className="version-content">{version.content || "(empty)"}</p>
            {index !== 0 ? (
              <form action={restoreEssayVersionAction} className="inline-edit-form">
                <input name="essayId" type="hidden" value={essay.id} />
                <input name="versionId" type="hidden" value={version.id} />
                <button type="submit">Restore this version (adds a new version, keeps history)</button>
              </form>
            ) : <span className="record-meta">Current version</span>}
          </details>
        );
      })}
    </div>
  );
}

/**
 * Where one essay can actually go.
 *
 * This is the product's whole argument on one line - an essay is not a
 * one-shot answer, it is a piece of writing several colleges will take - so it
 * is the one place the design spends any boldness.
 *
 * The mark keeps each college's own colour and the reuse band is a ring around
 * it. Tinting the mark itself by band, as first drafted, would have thrown away
 * the college identity that makes the row readable at a glance; two channels
 * carry more than one recoloured channel. Neither is load-bearing on its own:
 * every entry is a link whose accessible name states the college and the band
 * in words.
 */
export function ReuseRibbon({
  essay,
  matches,
}: {
  essay: WorkspaceEssay;
  matches: readonly { schoolName: string; action: string; label: string }[];
}) {
  const seen = new Set<string>();
  const entries: { schoolName: string; action: string; label: string }[] = [];
  for (const entry of matches) {
    if (seen.has(entry.schoolName)) continue;
    seen.add(entry.schoolName);
    entries.push(entry);
  }
  if (entries.length === 0) return null;

  const shown = entries.slice(0, 9);
  const rest = entries.length - shown.length;

  return (
    <div className="ribbon-block">
      <p className="detail-label">Where this essay can go</p>
      <ul className="ribbon">
        {shown.map((entry) => (
          <li key={entry.schoolName}>
            <Link
              className={`ribbon-mark ${entry.action}`}
              href={entry.action === "assigned" ? `/editor/${essay.id}` : "/reuse"}
              aria-label={`${entry.schoolName} — ${entry.label}`}
              title={`${entry.schoolName} — ${entry.label}`}
            >
              <SchoolMark name={entry.schoolName} small />
            </Link>
          </li>
        ))}
        {rest > 0 ? <li className="ribbon-more">+{rest}</li> : null}
      </ul>
    </div>
  );
}

/**
 * The ribbon's entries per essay, in the order a student cares about: already
 * answering, then ready to reuse, then reusable after adapting.
 */
export function essayRibbonEntries(snapshot: WorkspaceSnapshot) {
  const groups = reuseOpportunities(snapshot.essays, snapshot.matches, snapshot.prompts);
  return {
    groups,
    openByEssay: new Map(groups.map((group) => [group.essay.id, group.open.length])),
    ribbonByEssay: new Map(
      groups.map((group) => [
        group.essay.id,
        [
          ...group.inUse.map((match) => ({ schoolName: match.schoolName, action: "assigned", label: "already answering a prompt here" })),
          ...group.open.map((match) => ({
            schoolName: match.schoolName,
            action: match.recommendedAction,
            label: ACTION_LABELS[match.recommendedAction as RecommendedAction],
          })),
          ...group.withEdits.map((match) => ({
            schoolName: match.schoolName,
            action: match.recommendedAction,
            label: `${ACTION_LABELS[match.recommendedAction as RecommendedAction]}, after adapting school-specific material`,
          })),
        ],
      ]),
    ),
  };
}

/**
 * How much editing the length difference implies, in one phrase.
 *
 * The band answers "how reusable is this" and this answers "how much work",
 * which are separate questions the scoring now keeps separate: a 250-word
 * Georgetown activity essay scores 76 against Stanford's 50-word version and
 * still needs real cutting, and the score must not be dragged down to say so.
 *
 * Derived at render from three numbers already in the snapshot rather than
 * stored, so it cannot go stale against an edited essay and needs no migration.
 * It reads the same function the scorer uses for the band ceiling, so the label
 * and the ceiling can never disagree.
 */
export function matchAdaptation(match: ReuseMatch): string {
  return ADAPTATION_LABELS[adaptationEffort(match.essayWordCount, null, match.promptMaxWordCount)];
}

/**
 * Turns a match into the concrete edits reusing it would take.
 *
 * "Needs minor adaptation" does not tell a student what to do; "248 words ->
 * cut to 150" and "mentions Stanford - replace school-specific language" do.
 * All of it is derived from numbers already in the snapshot, so nothing can go
 * stale against an edited essay.
 */
export function matchAdjustments(match: ReuseMatch): string[] {
  const notes: string[] = [];
  const max = match.promptMaxWordCount;
  if (max !== null && match.essayWordCount > 0) {
    if (match.essayWordCount > max) {
      notes.push(`${match.essayWordCount} words → cut to ${max}`);
    } else if (match.essayWordCount / max < 0.6) {
      notes.push(`${match.essayWordCount} of ${max} words → needs substantial expansion`);
    }
  }
  if (match.schoolSpecificityRisk === "high") notes.push("names another school → replace school-specific language");
  else if (match.schoolSpecificityRisk === "medium") notes.push("check for another school's language before reusing");
  for (const gap of match.missingRequirements) notes.push(gap);
  return notes;
}
