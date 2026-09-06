import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { wordCount } from "@/lib/essays";
import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";
import { documentName } from "../../../../essay-ui";
import { limitLabel } from "../../../../prompt-ui";
import { ReuseShortenControl } from "./reuse-shorten-control";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const metadata: Metadata = { title: "Shorten & reuse" };

/**
 * "Shorten automatically" from the reuse confirmation page: preview an
 * AI-shortened version of the source essay, targeted at the destination
 * prompt's word limit, before it becomes part of the reused copy.
 */
export default async function ReuseShortenPage({
  searchParams,
}: {
  searchParams: Promise<{ promptId?: string; essayId?: string; expectedAssignedEssayId?: string; from?: string }>;
}) {
  const { promptId = "", essayId = "", expectedAssignedEssayId = "", from } = await searchParams;
  const snapshot = await getActiveWorkspaceSnapshot();

  const prompt = snapshot.prompts.find((candidate) => candidate.id === promptId);
  const essay = snapshot.essays.find((candidate) => candidate.id === essayId);
  if (!prompt || !essay || prompt.maxWordCount == null) notFound();

  const cancelHref = from && from.startsWith("/") ? from : "/essays";
  const currentSchoolName = snapshot.schools.find((candidate) => candidate.id === prompt.schoolId)?.name ?? null;
  const otherSchoolNames = snapshot.schools
    .map((school) => school.name)
    .filter((name) => name !== currentSchoolName);

  return (
    <div className="page-frame">
      <div className="card confirm-panel" role="alert">
        <h1>Shorten for this prompt&apos;s limit</h1>
        <p className="confirm-lede">
          <strong>{documentName(essay)}</strong> is {wordCount(essay.currentContent)} words. This prompt&apos;s
          limit is {limitLabel(prompt)}. Travila will propose a shortened version to review before anything is
          saved.
        </p>
        <ReuseShortenControl
          essayId={essay.id}
          content={essay.currentContent}
          defaultTargetWordCount={prompt.maxWordCount}
          promptId={prompt.id}
          expectedAssignedEssayId={expectedAssignedEssayId}
          from={cancelHref}
          currentSchoolName={currentSchoolName}
          otherSchoolNames={otherSchoolNames}
          schoolSpecificPhrases={essay.schoolSpecificPhrases}
        />
        <div className="confirm-actions">
          <Link className="btn-secondary" href={cancelHref}>Back</Link>
        </div>
      </div>
    </div>
  );
}
