import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { wordCount } from "@/lib/essays";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import { reuseEssayForPromptAction } from "../../../assignment-actions";
import { documentName } from "../../../essay-ui";
import { limitLabel } from "../../../prompt-ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const metadata: Metadata = { title: "Essay Editor" };

/**
 * "This prompt already has an answer" - the one confirmation step, shared.
 *
 * Reuse is offered from three places, and displacing an existing answer should
 * ask the same question wherever it was triggered, so the three surfaces link
 * here rather than each growing their own inline panel. A static segment, so it
 * never collides with /editor/[essayId].
 *
 * The submit is a plain form carrying the essay it expects to displace, and the
 * write re-checks that at commit time - if the answer changed again in the
 * meantime, the student is asked again about whatever is actually attached now
 * rather than silently overwriting it.
 */
export default async function ReuseConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ promptId?: string; essayId?: string; assigned?: string; from?: string }>;
}) {
  const { promptId = "", essayId = "", from } = await searchParams;
  const snapshot = await getActiveWorkspaceSnapshot();

  const prompt = snapshot.prompts.find((candidate) => candidate.id === promptId);
  const essay = snapshot.essays.find((candidate) => candidate.id === essayId);
  if (!prompt || !essay) notFound();

  const school = snapshot.schools.find((candidate) => candidate.id === prompt.schoolId);
  const assigned = prompt.assignedEssay
    ? snapshot.essays.find((candidate) => candidate.id === prompt.assignedEssay?.id) ?? null
    : null;
  // A copy of this essay for this question may already exist, in which case
  // this reattaches it rather than making a second one.
  const existingCopy = snapshot.essays.find(
    (candidate) => candidate.adaptedFromEssayId === essay.id && candidate.originPromptId === prompt.id,
  );
  const cancelHref = from && from.startsWith("/") ? from : "/essays";
  const overWords = prompt.maxWordCount != null ? wordCount(essay.currentContent) - prompt.maxWordCount : 0;

  return (
    <div className="page-frame">
      <div className="card confirm-panel" role="alert">
        <h1>{school?.name ?? "This college"} · {prompt.title}</h1>

        <p className="confirm-lede">
          {existingCopy ? (
            <>
              A copy of <strong>{documentName(essay)}</strong> for this prompt already exists
              — <strong>{documentName(existingCopy)}</strong>. Reattaching it will replace{" "}
              <strong>{assigned ? documentName(assigned) : "the current answer"}</strong> as this prompt&apos;s answer.
            </>
          ) : (
            <>
              This copies <strong>{documentName(essay)}</strong> into a new document for this prompt, replacing{" "}
              <strong>{assigned ? documentName(assigned) : "the current answer"}</strong> as this prompt&apos;s answer.
            </>
          )}
        </p>

        <p className="detail-note">
          {assigned ? <>{documentName(assigned)} stays in your library — it just stops answering this prompt. </> : null}
          {existingCopy
            ? "Nothing is copied again, so the writing already in that document is kept."
            : `The new document starts with this essay's text exactly, and the two are independent from then on: editing one never changes the other.`}
          {" "}Limit here: {limitLabel(prompt)}.
        </p>

        {overWords > 0 ? (
          <p className="notice-caution" role="alert">
            This essay is {wordCount(essay.currentContent)} words, but this prompt has a {prompt.maxWordCount}-word
            limit. It is copied in full — use the AI Coaches in the editor to adapt it to this prompt.
          </p>
        ) : null}

        <div className="confirm-actions">
          <form action={reuseEssayForPromptAction}>
            <input name="promptId" type="hidden" value={prompt.id} />
            <input name="essayId" type="hidden" value={essay.id} />
            <input name="expectedAssignedEssayId" type="hidden" value={assigned?.id ?? ""} />
            <input name="from" type="hidden" value={cancelHref} />
            <button className="btn" type="submit">
              {existingCopy ? "Reattach that document" : "Copy it here"}
            </button>
          </form>
          <Link className="btn" href={cancelHref}>Leave it as it is</Link>
        </div>
      </div>
    </div>
  );
}
