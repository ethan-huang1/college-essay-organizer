import { cleanContent } from "../essays";
import { runTravilaTurn } from "../travila";
import { parseCoachJson } from "./coach-json";
import type { TravilaErrorReason } from "../travila";

/**
 * Prompt Fit Coach: does this essay actually answer its assigned prompt?
 *
 * Editorial analysis only - it never rewrites, and it deliberately does not
 * judge tone, voice, or structure (that is Review Coach's job). Its own
 * dedicated Travila Agent Profile, own instruction, own output shape; the
 * transport (runTravilaTurn) is the only thing shared with other coaches.
 *
 * Two things the model is never trusted with: whether an excerpt it quoted
 * actually appears in the essay (verified here against the text), and the
 * aggregate coverage verdict (computed here from the dimension statuses).
 */

const PROMPT_FIT_COACH_PROFILE_ID = "college_essay_prompt_fit_coach";

export type PromptFitDimension = {
  /** One substantive ask of this prompt, in the model's words. */
  dimension: string;
  status: "strong" | "partial" | "missing";
  /** Verbatim excerpt when covered; null when missing or unverifiable. */
  evidence: string | null;
  note: string;
};

export type OffTopicPassage = {
  /** Verbatim substring of the essay. */
  excerpt: string;
  reason: string;
};

/** Shown to students as "Prompt coverage" - it describes how well the prompt's
 * own asks are covered, and deliberately excludes off-topic content, which is
 * reported separately rather than folded into this verdict. */
export type PromptCoverage = "strong" | "partial" | "weak";

export type PromptFitCoachResult =
  | {
      status: "ok";
      overallFit: PromptCoverage;
      dimensions: PromptFitDimension[];
      offTopicPassages: OffTopicPassage[];
    }
  | { status: "error"; reason: TravilaErrorReason; detail?: string };

/**
 * The essay-side checks alone. Separate from the prompt-side check because
 * the action must run these *before* its "no-prompt" fast path - an empty
 * essay is invalid input and must never be reported as the calm "this essay
 * has no prompt yet" state instead.
 */
export function validatePromptFitEssayContent(content: string): PromptFitCoachResult | null {
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

export function validatePromptFitCoachInput(content: string, promptText: string): PromptFitCoachResult | null {
  const contentError = validatePromptFitEssayContent(content);
  if (contentError) return contentError;
  // Defence in depth: the action checks this first and returns "no-prompt",
  // which is a calm state rather than an error, so this only fires if some
  // other caller skips that check.
  if (promptText.trim().length === 0) {
    return { status: "error", reason: "invalid-input", detail: "This essay has no prompt text to measure against." };
  }
  return null;
}

/**
 * The aggregate coverage verdict, computed from dimension statuses alone -
 * never asked of the model, and never influenced by off-topic passages
 * (weighting "how much off-topic is too much" would need an arbitrary
 * threshold, so off-topic content is surfaced separately instead).
 *
 * Total over every combination, and in particular an essay whose dimensions
 * are all merely "partial" is never "strong".
 */
export function computeOverallFit(dimensions: PromptFitDimension[]): PromptCoverage {
  const strong = dimensions.filter((entry) => entry.status === "strong").length;
  const partial = dimensions.filter((entry) => entry.status === "partial").length;
  const missing = dimensions.filter((entry) => entry.status === "missing").length;

  if (missing === 0 && partial === 0) return "strong";
  if (missing === 0) return "partial";
  if (missing >= strong + partial) return "weak";
  return "partial";
}

type RawPromptFitDimension = {
  dimension: string;
  status: PromptFitDimension["status"];
  evidence: string | null;
  note: string;
};

const DIMENSION_STATUSES = new Set(["strong", "partial", "missing"]);

function isRawDimension(entry: unknown): entry is RawPromptFitDimension {
  const candidate = entry as Partial<RawPromptFitDimension> | null;
  return (
    typeof candidate?.dimension === "string" &&
    candidate.dimension.trim().length > 0 &&
    typeof candidate?.status === "string" &&
    DIMENSION_STATUSES.has(candidate.status) &&
    typeof candidate?.note === "string" &&
    (candidate.evidence === null || typeof candidate.evidence === "string")
  );
}

function isRawOffTopic(entry: unknown): entry is OffTopicPassage {
  const candidate = entry as Partial<OffTopicPassage> | null;
  return (
    typeof candidate?.excerpt === "string" &&
    candidate.excerpt.length > 0 &&
    typeof candidate?.reason === "string"
  );
}

/**
 * Two different array policies, deliberately:
 *
 * - `dimensions` is variable-length but must not be empty - every real prompt
 *   asks at least one thing, so a response that leaves zero valid dimensions
 *   is malformed. Individually-invalid entries are dropped.
 * - `offTopicPassages` may legitimately be empty (most essays have no
 *   off-topic content), so empty - or absent, which means the same thing - is
 *   a normal result. Individually-invalid entries are dropped.
 */
function parsePromptFitCoachResponse(
  text: string,
): { dimensions: RawPromptFitDimension[]; offTopicPassages: OffTopicPassage[] } | { error: PromptFitCoachResult } {
  const json = parseCoachJson(text);
  if (!json) {
    return { error: { status: "error", reason: "malformed", detail: "response was not valid JSON" } };
  }
  const parsed = json.value;
  const body = parsed as { dimensions?: unknown; offTopicPassages?: unknown } | null;
  if (!Array.isArray(body?.dimensions)) {
    return { error: { status: "error", reason: "malformed", detail: "missing dimensions array" } };
  }
  const dimensions = body.dimensions.filter(isRawDimension);
  if (dimensions.length === 0) {
    return { error: { status: "error", reason: "malformed", detail: "no valid dimensions parsed" } };
  }
  const rawOffTopic = Array.isArray(body?.offTopicPassages) ? body.offTopicPassages : [];
  return { dimensions, offTopicPassages: rawOffTopic.filter(isRawOffTopic) };
}

/**
 * A dimension keeps its judgment even when its quote cannot be verified - the
 * coverage verdict for that ask is still meaningful, so only the unverifiable
 * evidence is dropped. An off-topic passage is nothing but its excerpt, so an
 * unverifiable one is dropped whole.
 *
 * No overlap-deduplication here (unlike Shorten Coach): nothing in this
 * coach's output sums into a total that double-counting could corrupt.
 */
function verifyDimensionEvidence(content: string, dimensions: RawPromptFitDimension[]): PromptFitDimension[] {
  return dimensions.map((entry) => ({
    ...entry,
    evidence: entry.evidence && content.includes(entry.evidence) ? entry.evidence : null,
  }));
}

function verifyOffTopicPassages(content: string, passages: OffTopicPassage[]): OffTopicPassage[] {
  return passages.filter((passage) => content.includes(passage.excerpt));
}

export async function getPromptFitCoachRecommendations(input: {
  content: string;
  promptText: string;
  userId: string;
}): Promise<PromptFitCoachResult> {
  const apiKey = process.env.TRAVILA_API_KEY;
  if (!apiKey) return { status: "error", reason: "not-configured" };

  const validationError = validatePromptFitCoachInput(input.content, input.promptText);
  if (validationError) return validationError;

  const instruction =
    "You are an editorial coach analysing how well a student's college application essay answers the specific " +
    "prompt it was assigned. You are NOT a writer, and NOT a general essay critic, for this task.\n\n" +
    "Rules you must follow:\n" +
    "- Never rewrite, paraphrase, or draft any replacement prose.\n" +
    "- Never produce a revised version of the essay.\n" +
    "- Never invent requirements that are not actually in the prompt text below.\n" +
    "- Never invent facts about the student, and analyse only the two texts provided.\n" +
    "- Do not judge tone, voice, style, structure, or general writing quality - a separate tool does that. Judge " +
    "only whether this essay answers this prompt.\n" +
    "- Derive the prompt's asks from the prompt's own wording. Identify the smallest set of genuinely distinct, " +
    "substantive asks it makes - do not over-segment one ask into several near-duplicates, and do not pad the " +
    "list with generic \"typical college essay\" expectations the prompt never asked for. Many prompts bundle two " +
    "or three real asks (for example a challenge, what the student did about it, and what they learned); some " +
    "ask only one thing, and one dimension is a correct answer in that case.\n" +
    "- For each ask, set \"status\" to one of:\n" +
    "  - \"strong\": the essay clearly and substantively addresses this ask\n" +
    "  - \"partial\": the essay touches this ask but thinly, vaguely, or only by implication\n" +
    "  - \"missing\": the essay does not address this ask\n" +
    "- For \"strong\" or \"partial\", quote the single most relevant \"evidence\" excerpt: a verbatim substring " +
    "copied exactly character-for-character from the essay. For \"missing\", set \"evidence\" to null.\n" +
    "- Separately, list any passages of the essay that do not serve any ask of this prompt in " +
    "\"offTopicPassages\", each with a verbatim \"excerpt\" and a short \"reason\". Most essays have none - return " +
    "an empty array in that case rather than stretching to find something.\n" +
    "- Never classify an ask itself as off-topic; \"status\" describes coverage only.\n\n" +
    `The prompt this essay is assigned to answer:\n${input.promptText}\n\n` +
    "Respond with ONLY a single JSON object, no prose before or after, no markdown code fences, matching exactly " +
    "this shape:\n" +
    '{"dimensions": [{"dimension": string, "status": "strong"|"partial"|"missing", "evidence": string|null, ' +
    '"note": string}], "offTopicPassages": [{"excerpt": string, "reason": string}]}\n\n' +
    `Essay:\n${input.content}`;

  const turn = await runTravilaTurn(apiKey, input.userId, PROMPT_FIT_COACH_PROFILE_ID, instruction);
  if ("error" in turn) return turn.error;

  const parsed = parsePromptFitCoachResponse(turn.text);
  if ("error" in parsed) return parsed.error;

  const dimensions = verifyDimensionEvidence(input.content, parsed.dimensions);
  const offTopicPassages = verifyOffTopicPassages(input.content, parsed.offTopicPassages);

  return { status: "ok", overallFit: computeOverallFit(dimensions), dimensions, offTopicPassages };
}
