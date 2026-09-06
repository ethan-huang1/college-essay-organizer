import { cleanContent, wordCount } from "../essays";
import { runTravilaTurn } from "../travila";
import type { TravilaErrorReason } from "../travila";
import { verifyAndDedupeExcerpts } from "./excerpt-verification";
import { parseCoachJson } from "./coach-json";

/**
 * Lengthen Coach: where would more detail actually earn its words?
 *
 * Editorial analysis only - it points at existing passages that are
 * under-developed and says what kind of addition would help, and never
 * writes the addition. Its own dedicated Travila Agent Profile, own
 * instruction, own output shape.
 *
 * Two deliberate differences from Shorten Coach, both about honesty:
 * - Zero opportunities is a real answer. A tight, well-developed essay
 *   should get an empty list, not filler.
 * - There is no computed "words to add". The added words do not exist yet,
 *   so nothing here can be measured from the text; sizing is a qualitative
 *   enum the model supplies rather than a number presented as fact.
 */

const LENGTHEN_COACH_PROFILE_ID = "college_essay_lengthen_coach";
const MAX_TARGET_WORD_COUNT = 10_000;

export type LengthenCoachOpportunity = {
  excerpt: string;
  expansionSize: "small" | "moderate" | "significant";
  /** Why this moment is under-developed. */
  reason: string;
  /** What kind of addition would help - never the addition itself. */
  suggestion: string;
};

export type LengthenCoachResult =
  | {
      status: "ok";
      currentWordCount: number;
      targetWordCount: number | null;
      wordsAvailable: number | null;
      opportunities: LengthenCoachOpportunity[];
    }
  | { status: "error"; reason: TravilaErrorReason; detail?: string };

/** A target is optional for this coach: "show me where more detail would
 * help" is a legitimate request with no number in mind. When one is given it
 * still has to be a sane number. */
export function validateLengthenCoachInput(content: string, targetWordCount: number | null): LengthenCoachResult | null {
  if (content.trim().length === 0) {
    return { status: "error", reason: "invalid-input", detail: "Essay is empty." };
  }
  try {
    cleanContent(content);
  } catch {
    return { status: "error", reason: "invalid-input", detail: "Essay content must be 20,000 characters or fewer." };
  }
  if (targetWordCount !== null) {
    if (!Number.isInteger(targetWordCount) || targetWordCount < 1) {
      return { status: "error", reason: "invalid-input", detail: "Target word count must be a positive whole number." };
    }
    if (targetWordCount > MAX_TARGET_WORD_COUNT) {
      return { status: "error", reason: "invalid-input", detail: `Target word count must be ${MAX_TARGET_WORD_COUNT} or fewer.` };
    }
  }
  return null;
}

type RawLengthenCoachOpportunity = LengthenCoachOpportunity;

const EXPANSION_SIZES = new Set(["small", "moderate", "significant"]);

function isRawOpportunity(entry: unknown): entry is RawLengthenCoachOpportunity {
  const candidate = entry as Partial<RawLengthenCoachOpportunity> | null;
  return (
    typeof candidate?.excerpt === "string" &&
    candidate.excerpt.length > 0 &&
    typeof candidate?.reason === "string" &&
    typeof candidate?.suggestion === "string" &&
    typeof candidate?.expansionSize === "string" &&
    EXPANSION_SIZES.has(candidate.expansionSize)
  );
}

/**
 * The one place this parser differs from Shorten Coach's, and it matters:
 * an explicitly empty `opportunities` array is a valid answer ("this essay
 * is already well developed"), while a non-empty array whose every entry is
 * unusable is malformed - the model tried to say something and produced
 * nothing we can show.
 */
function parseLengthenCoachResponse(
  text: string,
): { opportunities: RawLengthenCoachOpportunity[] } | { error: LengthenCoachResult } {
  const json = parseCoachJson(text);
  if (!json) {
    return { error: { status: "error", reason: "malformed", detail: "response was not valid JSON" } };
  }
  const parsed = json.value;
  const raw = (parsed as { opportunities?: unknown })?.opportunities;
  if (!Array.isArray(raw)) {
    return { error: { status: "error", reason: "malformed", detail: "missing opportunities array" } };
  }
  if (raw.length === 0) return { opportunities: [] };

  const valid = raw.filter(isRawOpportunity);
  if (valid.length === 0) {
    return { error: { status: "error", reason: "malformed", detail: "no valid opportunities parsed" } };
  }
  return { opportunities: valid };
}

export async function getLengthenCoachRecommendations(input: {
  content: string;
  targetWordCount: number | null;
  userId: string;
}): Promise<LengthenCoachResult> {
  const apiKey = process.env.TRAVILA_API_KEY;
  if (!apiKey) return { status: "error", reason: "not-configured" };

  const validationError = validateLengthenCoachInput(input.content, input.targetWordCount);
  if (validationError) return validationError;

  const currentWordCount = wordCount(input.content);
  const wordsAvailable =
    input.targetWordCount === null ? null : Math.max(0, input.targetWordCount - currentWordCount);

  const headroomNote =
    wordsAvailable === null
      ? `The essay is currently ${currentWordCount} words. The student has not set a target length, so judge ` +
        "expansion on merit alone: suggest additions only where they would genuinely strengthen the essay.\n\n"
      : `The essay is currently ${currentWordCount} words, and the student's target is ${input.targetWordCount} ` +
        `words, so there is room for about ${wordsAvailable} more words in total. Your suggested additions must ` +
        `fit within that headroom: the combined expansion you recommend should not exceed about ${wordsAvailable} ` +
        "words. Recommend fewer, better-chosen additions rather than filling the space for its own sake.\n\n";

  const instruction =
    "You are an editorial coach helping a student decide where their college application essay would benefit " +
    "from more development. You are NOT a writer for this task.\n\n" +
    "Rules you must follow:\n" +
    "- Never write the expansion itself. Never draft, rewrite, paraphrase, or supply replacement prose, not even " +
    "as an example of what could be added.\n" +
    "- Never produce a revised version of the essay.\n" +
    "- Never invent new facts, experiences, achievements, or events and suggest the student add them. You may " +
    "only point at moments that are already in the essay and are under-developed. Saying \"you mention the " +
    "rejection but never say how you reacted to it\" is in scope; suggesting the student add an experience the " +
    "essay does not contain is not.\n" +
    "- Analyze only the text provided.\n" +
    "- Only quote exact excerpts (verbatim substrings, copied exactly character-for-character) from the essay.\n" +
    "- Opportunities must be distinct and non-overlapping - never quote the same sentence or passage (or part of " +
    "one) in more than one opportunity.\n" +
    "- For each opportunity, set \"expansionSize\" to one of \"small\", \"moderate\", or \"significant\", " +
    "describing roughly how much development the moment warrants.\n" +
    "- In \"suggestion\", name the kind of addition that would help - more specificity, more reflection on what " +
    "something meant, more context, more concrete evidence, or a stronger transition - without writing it.\n" +
    "- Do not pad. If the essay is already well developed, or there is little room to grow, return very few " +
    "opportunities or an empty array. An empty array is a correct and expected answer for a tight, complete " +
    "essay, and is much better than inventing weak suggestions.\n\n" +
    headroomNote +
    "Identify the specific moments where additional detail, reflection, context, evidence, or development would " +
    "materially improve this essay. For each, quote the exact excerpt, explain what is thin about it, and say " +
    "what kind of addition would strengthen it.\n\n" +
    "Respond with ONLY a single JSON object, no prose before or after, no markdown code fences, matching exactly " +
    "this shape:\n" +
    '{"opportunities": [{"excerpt": string, "expansionSize": "small"|"moderate"|"significant", ' +
    '"reason": string, "suggestion": string}]}\n\n' +
    `Essay:\n${input.content}`;

  const turn = await runTravilaTurn(apiKey, input.userId, LENGTHEN_COACH_PROFILE_ID, instruction);
  if ("error" in turn) return turn.error;

  const parsed = parseLengthenCoachResponse(turn.text);
  if ("error" in parsed) return parsed.error;

  // Verbatim + non-overlapping, shared with Shorten Coach. Nothing is
  // computed on top: there is no honest word count for text that does not
  // exist yet, which is why sizing stays a qualitative enum.
  const opportunities = verifyAndDedupeExcerpts(input.content, parsed.opportunities);

  return {
    status: "ok",
    currentWordCount,
    targetWordCount: input.targetWordCount,
    wordsAvailable,
    opportunities,
  };
}
