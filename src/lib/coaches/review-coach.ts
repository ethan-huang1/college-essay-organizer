import { cleanContent } from "../essays";
import { runTravilaTurn } from "../travila";
import { parseCoachJson } from "./coach-json";
import type { TravilaErrorReason } from "../travila";

/**
 * Review Coach: the broad read on the essay as a piece of writing.
 *
 * Eight named axes rather than one vague score, and deliberately NOT a
 * prompt-fit judgment - Prompt Fit Coach owns that question, and this coach
 * is instructed to stay out of it so the two never double-report.
 *
 * This coach has less deterministic post-processing than the others, and
 * that asymmetry is honest rather than an oversight: whether a voice reads
 * as authentic is not a checkable fact about the text, so the ratings and
 * the closing impression are the model's own judgment. The one thing that
 * *is* checkable - whether a quoted example really appears in the essay -
 * is verified here.
 */

const REVIEW_COACH_PROFILE_ID = "college_essay_review_coach";

export const REVIEW_AXIS_IDS = [
  "structure",
  "hook",
  "voice",
  "specificity",
  "reflection",
  "clarity",
  "conclusion",
  "redundancy",
] as const;

export type ReviewCoachAxisId = (typeof REVIEW_AXIS_IDS)[number];

export type ReviewCoachAxis = {
  axis: ReviewCoachAxisId;
  /** "not-applicable" is for essays where an axis genuinely does not apply -
   * a short supplement with no separable hook, say - rather than a strained
   * low rating. Used sparingly, and always explained in `comment`. */
  rating: "strong" | "solid" | "needs-work" | "not-applicable";
  comment: string;
  /** Optional verbatim excerpt illustrating the point; nulled if unverifiable. */
  example: string | null;
};

export type ReviewCoachResult =
  | { status: "ok"; axes: ReviewCoachAxis[]; overallImpression: string }
  | { status: "error"; reason: TravilaErrorReason; detail?: string };

export function validateReviewCoachInput(content: string): ReviewCoachResult | null {
  if (content.trim().length === 0) {
    return { status: "error", reason: "invalid-input", detail: "Essay is empty." };
  }
  try {
    cleanContent(content);
  } catch {
    return { status: "error", reason: "invalid-input", detail: "Essay content must be 20,000 characters or fewer." };
  }
  return null;
}

const AXIS_IDS = new Set<string>(REVIEW_AXIS_IDS);
const RATINGS = new Set(["strong", "solid", "needs-work", "not-applicable"]);

function isRawAxis(entry: unknown): entry is ReviewCoachAxis {
  const candidate = entry as Partial<ReviewCoachAxis> | null;
  return (
    typeof candidate?.axis === "string" &&
    AXIS_IDS.has(candidate.axis) &&
    typeof candidate?.rating === "string" &&
    RATINGS.has(candidate.rating) &&
    typeof candidate?.comment === "string" &&
    candidate.comment.trim().length > 0 &&
    (candidate.example === null || typeof candidate.example === "string")
  );
}

/**
 * Fixed cardinality, unlike every other coach: exactly the eight known axes,
 * each exactly once. A missing, duplicated, or unknown axis fails the whole
 * response rather than being dropped, because a review that silently reports
 * seven axes - or reports one twice - misleads a student who reasonably
 * assumes the list is complete and exact.
 */
function parseReviewCoachResponse(
  text: string,
): { axes: ReviewCoachAxis[]; overallImpression: string } | { error: ReviewCoachResult } {
  const json = parseCoachJson(text);
  if (!json) {
    return { error: { status: "error", reason: "malformed", detail: "response was not valid JSON" } };
  }
  const parsed = json.value;
  const body = parsed as { axes?: unknown; overallImpression?: unknown } | null;
  if (!Array.isArray(body?.axes)) {
    return { error: { status: "error", reason: "malformed", detail: "missing axes array" } };
  }
  if (typeof body?.overallImpression !== "string" || body.overallImpression.trim().length === 0) {
    return { error: { status: "error", reason: "malformed", detail: "missing overallImpression" } };
  }
  if (body.axes.length !== REVIEW_AXIS_IDS.length) {
    return {
      error: {
        status: "error",
        reason: "malformed",
        detail: `expected ${REVIEW_AXIS_IDS.length} axes, received ${body.axes.length}`,
      },
    };
  }
  if (!body.axes.every(isRawAxis)) {
    return { error: { status: "error", reason: "malformed", detail: "an axis entry is invalid" } };
  }
  const axes = body.axes as ReviewCoachAxis[];
  // Length is already 8, so a set of 8 distinct known ids means each known
  // axis appears exactly once - this catches duplicates and unknown ids.
  const seen = new Set(axes.map((entry) => entry.axis));
  if (seen.size !== REVIEW_AXIS_IDS.length) {
    return { error: { status: "error", reason: "malformed", detail: "axes are duplicated or missing" } };
  }
  return { axes, overallImpression: body.overallImpression };
}

function verifyExamples(content: string, axes: ReviewCoachAxis[]): ReviewCoachAxis[] {
  return axes.map((entry) => ({
    ...entry,
    example: entry.example && content.includes(entry.example) ? entry.example : null,
  }));
}

export async function getReviewCoachRecommendations(input: {
  content: string;
  /** Light framing only - never scored, and never used to judge prompt fit. */
  essayTitle?: string | null;
  schoolName?: string | null;
  userId: string;
}): Promise<ReviewCoachResult> {
  const apiKey = process.env.TRAVILA_API_KEY;
  if (!apiKey) return { status: "error", reason: "not-configured" };

  const validationError = validateReviewCoachInput(input.content);
  if (validationError) return validationError;

  const context = [input.essayTitle?.trim(), input.schoolName?.trim()].filter(Boolean).join(" · ");
  const contextNote = context
    ? `For context only, this draft is filed as "${context}". Do not evaluate how well it fits any prompt.\n\n`
    : "";

  const instruction =
    "You are an editorial coach giving a holistic review of a student's college application essay as a piece of " +
    "writing. You are NOT a writer, and NOT a prompt-fit judge, for this task.\n\n" +
    "Rules you must follow:\n" +
    "- Never rewrite, paraphrase, or draft replacement prose, and never produce a revised version of the essay.\n" +
    "- Never invent facts about the student. Analyze only the essay text provided.\n" +
    "- Do not evaluate how well the essay answers any prompt - a separate tool covers that. Judge the writing.\n" +
    "- Return exactly these eight axes, each exactly once, using these exact ids: " +
    REVIEW_AXIS_IDS.join(", ") + ".\n" +
    "  - \"structure\": clear arc, effective ordering and pacing\n" +
    "  - \"hook\": does the opening earn attention\n" +
    "  - \"voice\": sounds like a specific real person, not generic or clichéd\n" +
    "  - \"specificity\": concrete detail rather than vague generalization\n" +
    "  - \"reflection\": self-awareness and meaning-making, not just recounting events\n" +
    "  - \"clarity\": easy to follow, free of confusing sentences\n" +
    "  - \"conclusion\": ends with resonance rather than fizzling out\n" +
    "  - \"redundancy\": conciseness. A \"strong\" rating here means there is little unnecessary repetition or " +
    "wasted wording. Rate it only; do not produce a list of passages to cut, which a separate tool handles.\n" +
    "- Set each axis's \"rating\" to \"strong\", \"solid\", \"needs-work\", or \"not-applicable\".\n" +
    "- Use \"not-applicable\" sparingly: only when an axis genuinely does not apply to this essay, such as a very " +
    "short supplement with no separable hook or conclusion. When you use it, explain why in \"comment\". Do not " +
    "use it to avoid making a judgment, and never omit the axis instead.\n" +
    "- Every axis needs a specific \"comment\" of one to three sentences about this essay in particular - no " +
    "generic advice that would apply to any essay.\n" +
    "- \"example\" is optional: either a verbatim substring copied exactly character-for-character from the essay " +
    "that illustrates your point, or null. Never paraphrase into this field.\n" +
    "- Also give a short \"overallImpression\" of two to four sentences synthesizing the review. It must be prose, " +
    "not a score or a grade, and should not weigh \"not-applicable\" axes.\n\n" +
    contextNote +
    "Respond with ONLY a single JSON object, no prose before or after, no markdown code fences, matching exactly " +
    "this shape:\n" +
    '{"axes": [{"axis": string, "rating": "strong"|"solid"|"needs-work"|"not-applicable", "comment": string, ' +
    '"example": string|null}], "overallImpression": string}\n\n' +
    `Essay:\n${input.content}`;

  const turn = await runTravilaTurn(apiKey, input.userId, REVIEW_COACH_PROFILE_ID, instruction);
  if ("error" in turn) return turn.error;

  const parsed = parseReviewCoachResponse(turn.text);
  if ("error" in parsed) return parsed.error;

  return {
    status: "ok",
    axes: verifyExamples(input.content, parsed.axes),
    overallImpression: parsed.overallImpression,
  };
}
