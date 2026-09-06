import { cleanContent, wordCount } from "../essays";
import { runTravilaTurn } from "../travila";
import { verifyAndDedupeExcerpts } from "./excerpt-verification";
import { parseCoachJson } from "./coach-json";
import type { TravilaErrorReason } from "../travila";

/**
 * Shorten Coach: editorial-only cut recommendations, never a rewrite. Its
 * own dedicated Travila Agent Profile, own instruction, own output shape -
 * the transport (runTravilaTurn) is the only thing shared with any other
 * Travila-backed feature in this app.
 */

const SHORTEN_COACH_PROFILE_ID = "college_essay_shorten_coach";
const MAX_TARGET_WORD_COUNT = 10_000;

export type ShortenCoachRecommendation = {
  excerpt: string;
  /** Always computed from wordCount(excerpt) - never trusted from the model. */
  estimatedWordsSaved: number;
  reason: string;
  tradeoff: string;
  shortenPriority: "shorten-first" | "optional" | "last-resort";
};

export type ShortenCoachResult =
  | {
      status: "ok";
      currentWordCount: number;
      targetWordCount: number;
      wordsToShorten: number;
      recommendations: ShortenCoachRecommendation[];
    }
  | { status: "error"; reason: TravilaErrorReason; detail?: string };

/** Empty/oversized content and an invalid target are always errors; whether
 * the target is already met is a separate, non-error case the caller decides
 * (see requestShortenCoachAction) - so this deliberately does not compare
 * targetWordCount against the essay's current word count. */
export function validateShortenCoachInput(content: string, targetWordCount: number): ShortenCoachResult | null {
  if (content.trim().length === 0) {
    return { status: "error", reason: "invalid-input", detail: "Essay is empty." };
  }
  try {
    cleanContent(content);
  } catch {
    return { status: "error", reason: "invalid-input", detail: "Essay content must be 20,000 characters or fewer." };
  }
  if (!Number.isInteger(targetWordCount) || targetWordCount < 1) {
    return { status: "error", reason: "invalid-input", detail: "Target word count must be a positive whole number." };
  }
  if (targetWordCount > MAX_TARGET_WORD_COUNT) {
    return { status: "error", reason: "invalid-input", detail: `Target word count must be ${MAX_TARGET_WORD_COUNT} or fewer.` };
  }
  return null;
}

type RawShortenCoachRecommendation = {
  excerpt: string;
  reason: string;
  tradeoff: string;
  shortenPriority: ShortenCoachRecommendation["shortenPriority"];
};

const SHORTEN_PRIORITIES = new Set(["shorten-first", "optional", "last-resort"]);

function parseShortenCoachResponse(
  text: string,
): { recommendations: RawShortenCoachRecommendation[] } | { error: ShortenCoachResult } {
  const json = parseCoachJson(text);
  if (!json) {
    return { error: { status: "error", reason: "malformed", detail: "response was not valid JSON" } };
  }
  const parsed = json.value;
  const recs = (parsed as { recommendations?: unknown })?.recommendations;
  if (!Array.isArray(recs)) {
    return { error: { status: "error", reason: "malformed", detail: "missing recommendations array" } };
  }
  const valid = recs.filter((entry): entry is RawShortenCoachRecommendation => {
    const candidate = entry as Partial<RawShortenCoachRecommendation> | null;
    return (
      typeof candidate?.excerpt === "string" &&
      candidate.excerpt.length > 0 &&
      typeof candidate?.reason === "string" &&
      typeof candidate?.tradeoff === "string" &&
      typeof candidate?.shortenPriority === "string" &&
      SHORTEN_PRIORITIES.has(candidate.shortenPriority)
    );
  });
  if (valid.length === 0) {
    return { error: { status: "error", reason: "malformed", detail: "no valid recommendations parsed" } };
  }
  return { recommendations: valid };
}

/** Verbatim-and-non-overlapping filtering is shared with Lengthen Coach (see
 * excerpt-verification.ts); the word count on top is this coach's own, and is
 * always computed from the excerpt rather than taken from the model. */
function verifiedRecommendations(
  content: string,
  recs: RawShortenCoachRecommendation[],
): ShortenCoachRecommendation[] {
  return verifyAndDedupeExcerpts(content, recs).map((rec) => ({
    ...rec,
    estimatedWordsSaved: wordCount(rec.excerpt),
  }));
}

/**
 * Ask Travila's dedicated Shorten Coach profile which passages are candidates
 * for shortening - never a rewrite. The model is never trusted for word
 * counts or for the excerpt actually existing in the essay: both are
 * verified/computed here from the essay text itself, so the profile's output
 * can only ever point at real text, never invent savings.
 */
export async function getShortenCoachRecommendations(input: {
  content: string;
  targetWordCount: number;
  userId: string;
}): Promise<ShortenCoachResult> {
  const apiKey = process.env.TRAVILA_API_KEY;
  if (!apiKey) return { status: "error", reason: "not-configured" };

  const validationError = validateShortenCoachInput(input.content, input.targetWordCount);
  if (validationError) return validationError;

  const currentWordCount = wordCount(input.content);
  const wordsToShorten = Math.max(0, currentWordCount - input.targetWordCount);

  const instruction =
    "You are an editorial coach helping a student shorten their college application essay down to a target " +
    "length. You are NOT a writer for this task.\n\n" +
    "Rules you must follow:\n" +
    "- Never generate replacement prose, never rewrite or paraphrase any sentence.\n" +
    "- Never produce a shortened or complete revised version of the essay.\n" +
    "- Never invent facts, examples, or content not present in the essay below.\n" +
    "- Analyze only the text provided - do not add outside knowledge about the student.\n" +
    "- Prioritize preserving the student's voice and their most meaningful ideas.\n" +
    "- Recommend passages to shorten; do not shorten them yourself.\n" +
    "- Only quote exact excerpts (verbatim substrings, copied exactly character-for-character) from the essay " +
    "provided - we compute word savings ourselves from your excerpt, so precision matters more than any number.\n" +
    "- Recommendations must be distinct and non-overlapping - never quote the same sentence or passage (or part " +
    "of one) in more than one recommendation.\n" +
    "- For each recommendation, set \"shortenPriority\" to one of:\n" +
    "  - \"shorten-first\": redundant or lower-value text, removable with minimal loss\n" +
    "  - \"optional\": saves meaningful words but sacrifices some detail or voice\n" +
    "  - \"last-resort\": removes a substantive example or important content\n" +
    "- Whenever the essay reasonably contains enough distinct, non-overlapping candidate passages, provide enough " +
    "of them that their combined length meets or slightly exceeds the requested word reduction - prioritize " +
    "\"shorten-first\" candidates before reaching for \"optional\" or \"last-resort\" ones. If hitting the target " +
    "would require removing meaningful content, still offer those options, but mark them \"last-resort\" and say " +
    "so plainly in \"tradeoff\".\n\n" +
    `The essay is currently ${currentWordCount} words. The student wants to reach approximately ` +
    `${input.targetWordCount} words (shortening by about ${wordsToShorten} words).\n\n` +
    "Identify redundant, repetitive, or lower-priority passages - repeated ideas, lower-priority examples, overly " +
    "long setup/background, sections that contribute less to the core argument or story - as candidates for " +
    "shortening. For each, quote the exact excerpt, explain briefly why it's a lower priority, and note what " +
    "would be lost if it were removed.\n\n" +
    "Respond with ONLY a single JSON object, no prose before or after, no markdown code fences, matching exactly " +
    "this shape:\n" +
    '{"recommendations": [{"excerpt": string, "reason": string, "tradeoff": string, ' +
    '"shortenPriority": "shorten-first"|"optional"|"last-resort"}]}\n\n' +
    `Essay:\n${input.content}`;

  const turn = await runTravilaTurn(apiKey, input.userId, SHORTEN_COACH_PROFILE_ID, instruction);
  if ("error" in turn) return turn.error;

  const parsed = parseShortenCoachResponse(turn.text);
  if ("error" in parsed) return parsed.error;

  const recommendations = verifiedRecommendations(input.content, parsed.recommendations);
  if (recommendations.length === 0) {
    return { status: "error", reason: "malformed", detail: "no recommendation excerpts matched the essay text" };
  }

  return { status: "ok", currentWordCount, targetWordCount: input.targetWordCount, wordsToShorten, recommendations };
}
