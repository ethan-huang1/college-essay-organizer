import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import {
  deleteEssayAction,
  setEssayCompletionAction,
  updateEssayMetadataAction,
  updateEssayTitleAction,
} from "../../../essay-actions";
import {
  displacedByReuse,
  documentName,
  EssayFields,
  EssayVersionHistory,
  essayPromptContext,
  essayRibbonEntries,
  matchAdjustments,
  ReuseHereControl,
  ReuseRibbon,
} from "../../../essay-ui";
import { effectiveLimit } from "../../../essay-guidance";
import { limitLabel } from "../../../prompt-ui";
import { sentenceCase, sentenceList, statusLabel } from "../../../text";
import { CoachTabs } from "./coach-tabs";
import { DocumentSurfaceWithReview } from "./document-surface-with-review";
import { LiveContentProvider } from "./live-content-context";
import { ReferenceCheckPanel } from "./reference-check-panel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const metadata: Metadata = { title: "Essay Editor" };

/**
 * One document, full page.
 *
 * The whole point is room: the prompt it answers stays in view, the text sits
 * at a real measure in the reading face, and everything that is not writing -
 * history, details, adaptation notes - is beside it rather than on top of it.
 *
 * The guidance splits by what can go stale. Length is arithmetic over the text
 * in the box, so DocumentSurface keeps it live. The matcher's notes come from
 * the last rescoring, which happens on a version save, so they say so.
 */
export default async function EditorDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ essayId: string }>;
  searchParams: Promise<{ titleError?: string; delete?: string }>;
}) {
  const { essayId } = await params;
  const { titleError, delete: confirmingDelete } = await searchParams;
  const snapshot = await getActiveWorkspaceSnapshot();
  // The workspace boundary: an id from another workspace is not found here,
  // and every action re-checks it server-side regardless.
  const essay = snapshot.essays.find((candidate) => candidate.id === essayId);
  if (!essay) notFound();

  const origin = essayPromptContext(snapshot, essay);
  // Every catalogue school besides the one this essay currently answers -
  // a mention of any of these is a reference to "another school", regardless
  // of which school the essay was originally written for.
  const otherSchoolNames = snapshot.schools
    .map((school) => school.name)
    .filter((name) => name !== origin?.schoolName);
  // reuseEssayForPrompt marks every copy this way, which is what the
  // "review before submitting" reminder is scoped to.
  const isReusedEssay = essay.designation === "school-adaptation" || Boolean(essay.adaptedFromEssayId);
  const { groups, ribbonByEssay } = essayRibbonEntries(snapshot);
  const group = groups.find((candidate) => candidate.essay.id === essay.id);
  // Sorted by score, because this panel renders one flat list with no group
  // headings. reuseOpportunities sorts within each group, so concatenating
  // them put a 79 from `open` above an 81 from `withEdits` and read as a
  // broken sort - the Categories view gets away with the same grouping only
  // because it labels each group. The adaptation caveat is not lost: every row
  // already carries "check for another school's language before reusing".
  const adaptable = [...(group?.open ?? []), ...(group?.withEdits ?? [])]
    .sort((a, b) => b.score - a.score);
  // "Ready" is what Mark complete sets; "submitted" is further along the same
  // road, so both read as done. The prompts it answers carry the same state -
  // that is what the Overview counts.
  const complete = essay.status === "ready" || essay.status === "submitted";

  return (
    <div className="editor-frame">
      <header className="editor-head">
        <div className="editor-head-top">
          <Link className="text-link" href="/essays"><span aria-hidden="true">←</span> My Essays</Link>
          <div className="editor-head-status">
            <span className={`pill ${essay.status}`}>{statusLabel(essay.status)}</span>
            {/* One control, both directions. Completing moves the essay and
                every prompt it answers together, so the editor and the Overview
                can never disagree about whether this is done. */}
            <form action={setEssayCompletionAction}>
              <input name="essayId" type="hidden" value={essay.id} />
              <input name="complete" type="hidden" value={complete ? "0" : "1"} />
              <button className={complete ? "text-link" : "btn"} type="submit">
                {complete ? "Reopen" : "Mark complete"}
              </button>
            </form>
          </div>
        </div>

        <form action={updateEssayTitleAction} className="editor-title-form">
          <input name="essayId" type="hidden" value={essay.id} />
          {/* A textarea rather than an input purely so a long name wraps
              instead of scrolling out of its own field. cleanTitle collapses
              whitespace, so a stray newline never reaches the database. */}
          <textarea
            aria-label="Document name"
            className="editor-title"
            name="title"
            required
            rows={1}
            minLength={2}
            maxLength={160}
            defaultValue={documentName(essay)}
            aria-describedby={titleError ? "title-error" : undefined}
          />
          <button className="text-link" type="submit">Rename</button>
        </form>
        {titleError ? (
          <p className="field-error" id="title-error" role="alert">
            A document name needs between 2 and 160 characters. The name was left unchanged.
          </p>
        ) : null}

        <p className="editor-context">
          {origin?.schoolName ? <strong>{origin.schoolName}</strong> : null}
          {origin ? <>{origin.schoolName ? " · " : ""}{origin.title}</> : "No prompt attached yet"}
          {origin?.prompt ? <> · {limitLabel(origin.prompt)}</> : null}
          {essay.linkedPrompts.length > 0 ? (
            <> · answering {essay.linkedPrompts.length} {essay.linkedPrompts.length === 1 ? "prompt" : "prompts"}</>
          ) : null}
        </p>
      </header>

      <LiveContentProvider initialContent={essay.currentContent} initialSavedAt={essay.lastEditedAt.getTime()}>
      <div className="editor-body">
        <div className="editor-main">
          {origin ? (
            <details className="editor-prompt" open>
              <summary>
                <span className="detail-label">{origin.source === "origin" ? "Writing for" : "Assigned to answer"}</span>
                <span className="editor-prompt-title">{origin.title}</span>
              </summary>
              {origin.text ? <p className="editor-prompt-text">{origin.text}</p> : null}
              {origin.prompt ? <p className="detail-meta">{limitLabel(origin.prompt)} · {origin.prompt.cycleLabel}</p> : null}
            </details>
          ) : (
            <p className="empty-note">
              This document is not attached to a prompt yet. Choose one under Document details, and reuse scoring can
              judge what it answers.
            </p>
          )}

          <DocumentSurfaceWithReview
            essayId={essay.id}
            initialContent={essay.currentContent}
            initialSavedAt={essay.lastEditedAt.getTime()}
            limits={{
              target: essay.targetWordCount,
              promptMax: origin?.prompt?.maxWordCount ?? null,
              promptMin: origin?.prompt?.minWordCount ?? null,
            }}
            currentSchoolName={origin?.schoolName ?? null}
            otherSchoolNames={otherSchoolNames}
            schoolSpecificPhrases={essay.schoolSpecificPhrases}
            isReusedEssay={isReusedEssay}
          />
        </div>

        <aside className="editor-side">
          <section className="editor-panel">
            <h2>AI Coaches</h2>
            <p className="detail-note">
              Editorial feedback on the draft in the box — what to consider changing and why. These coaches never
              rewrite the essay for you.
            </p>
            <CoachTabs
              essayId={essay.id}
              defaultTargetWordCount={effectiveLimit({
                target: essay.targetWordCount,
                promptMax: origin?.prompt?.maxWordCount ?? null,
              })}
            />
          </section>

          <ReferenceCheckPanel
            currentSchoolName={origin?.schoolName ?? null}
            otherSchoolNames={otherSchoolNames}
            schoolSpecificPhrases={essay.schoolSpecificPhrases}
          />

          <section className="editor-panel">
            <h2>Adapt &amp; reuse</h2>
            <p className="detail-note">
              Where else this essay could go. Based on your last saved version — these notes are re-analysed when you
              save a version.
            </p>
            {essay.schoolSpecificPhrases.length > 0 ? (
              <p className="risk-note">School-specific: {essay.schoolSpecificPhrases.join(", ")}</p>
            ) : null}
            {adaptable.length === 0 ? (
              <p className="detail-note">No other prompt in your list is close enough to adapt this for yet.</p>
            ) : (
              <ul className="rows adapt-rows">
                {adaptable.map((match) => {
                  const notes = matchAdjustments(match);
                  const displaced = displacedByReuse(snapshot, match.promptId, essay.id);
                  return (
                    <li key={match.id}>
                      <div className="row match-row">
                        <span className="match-score">{match.score}</span>
                        <span className="row-main">
                          <span className="row-title">{match.promptTitle}</span>
                          <span className="row-sub">{match.schoolName}</span>
                        </span>
                        <span className="row-side">
                          {/* Copies this essay into a new document for that
                              prompt rather than attaching this one to it. */}
                          <ReuseHereControl
                            promptId={match.promptId}
                            essayId={essay.id}
                            assignedEssayId={displaced}
                            from={`/editor/${essay.id}`}
                          />
                        </span>
                      </div>
                      <p className="match-adjustments">
                        {notes.length > 0 ? sentenceList(notes) : sentenceCase(match.explanation)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            <ReuseRibbon essay={essay} matches={ribbonByEssay.get(essay.id) ?? []} />
          </section>

          <section className="editor-panel">
            <h2>Version history</h2>
            <p className="detail-note">
              Autosave keeps your draft; a version is a snapshot you can come back to. Restoring adds a new version and
              keeps everything before it.
            </p>
            <EssayVersionHistory essay={essay} />
          </section>

          <section className="editor-panel">
            <h2>Document details</h2>
            <form action={updateEssayMetadataAction} className="prompt-form">
              <input name="essayId" type="hidden" value={essay.id} />
              {/* The name is edited in the header, but the metadata action
                  validates every field it writes, so it has to be carried. */}
              <input name="title" type="hidden" value={essay.title} />
              <EssayFields snapshot={snapshot} essay={essay} omitTitle />
              <button type="submit">Save details</button>
            </form>
            {/* Two steps, like removing a college: the link states the intent
                and the panel spells out what goes before anything is deleted. */}
            {confirmingDelete ? (
              <div className="remove-confirm" role="alert">
                <p className="remove-confirm-title">Delete {documentName(essay)}?</p>
                <p className="detail-note">
                  This removes the document, every saved version of it, and its reuse matches. Any document copied from
                  it — and the document it was copied from, if this is a copy — is left completely untouched. Prompts it
                  answers become unanswered again.
                </p>
                <div className="remove-confirm-actions">
                  <form action={deleteEssayAction}>
                    <input name="essayId" type="hidden" value={essay.id} />
                    <button type="submit">Yes, delete this document</button>
                  </form>
                  <Link className="text-link" href={`/editor/${essay.id}`}>Keep it</Link>
                </div>
              </div>
            ) : (
              <p className="delete-form">
                <span>Deleting removes every version and match for this document.</span>
                <Link className="text-link" href={`/editor/${essay.id}?delete=1`}>Delete document</Link>
              </p>
            )}
          </section>
        </aside>
      </div>
      </LiveContentProvider>
    </div>
  );
}
