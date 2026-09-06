import { cleanContent } from "../essays";
import { runTravilaTurn } from "../travila";
import { parseCoachJson } from "./coach-json";
import { verifyAndDedupeExcerpts } from "./excerpt-verification";
import type { TravilaErrorReason } from "../travila";

/**
 * Proofread Coach: mechanical correctness, last.
 *
 * The narrowest coach in the set, deliberately. Grammar, punctuation, agreement,
 * tense, spelling, typos and clear word-choice errors - and nothing else.
 * Sophistication, vocabulary, structure, transitions, vividness, length and
 * tone all belong to other coaches, and the instruction forbids this one from
 * touching them.
 *
 * Conservatism is the whole design. College essays legitimately use fragments
 * for effect, conversational phrasing, unusual punctuation and deliberate
 * repetition; a coach that flattens those in the name of correctness does more
 * damage than the comma it fixed. The instruction therefore enumerates what
 * never to flag and tells the model to stay silent when unsure.
 *
 * This is also the one coach permitted to emit replacement text, in a single
 * tightly scoped field: `correction` carries the minimal corrected form of the
 * quoted phrase and nothing more. That is a fix, not a rewrite - and it is
 * still only a suggestion, since nothing here writes to the essay.
 *
 * ponytail: verifyAndDedupeExcerpts drops the later of two overlapping
 * findings, so two genuine errors inside one quoted span collapse to one. The
 * instruction mitigates it by demanding the shortest locating phrase (two to
 * six words), which makes the overlap rare. If students start reporting missed
 * second errors, give this coach its own dedupe that allows nesting.
 */

const PROOFREAD_COACH_PROFILE_ID = "college_essay_proofread_coach";

export const PROOFREAD_CATEGORY_IDS = [
  "grammar",
  "agreement",
  "tense",
  "punctuation",
  "spelling",
  "typo",
  "word-choice",
] as const;

export type ProofreadCategoryId = (typeof PROOFREAD_CATEGORY_IDS)[number];

export type ProofreadCoachFinding = {
  /** The short verbatim phrase containing the error - two to six words, usually. */
  excerpt: string;
  category: ProofreadCategoryId;
  /** What is wrong, in one plain sentence without grammar jargon. */
  issue: string;
  /** The minimal corrected form of the quoted phrase - never a rewritten sentence. */
  correction: string;
};

export type ProofreadCoachResult =
  | { status: "ok"; findings: ProofreadCoachFinding[] }
  | { status: "error"; reason: TravilaErrorReason; detail?: string };

export function validateProofreadCoachInput(content: string): ProofreadCoachResult | null {
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

const CATEGORY_IDS = new Set<string>(PROOFREAD_CATEGORY_IDS);

function isFinding(entry: unknown): entry is ProofreadCoachFinding {
  const candidate = entry as Partial<ProofreadCoachFinding> | null;
  return (
    typeof candidate?.excerpt === "string" &&
    candidate.excerpt.trim().length > 0 &&
    typeof candidate?.category === "string" &&
    CATEGORY_IDS.has(candidate.category) &&
    typeof candidate?.issue === "string" &&
    candidate.issue.trim().length > 0 &&
    typeof candidate?.correction === "string" &&
    candidate.correction.trim().length > 0
  );
}

/** Same convention as Flow and Vivid. An empty array is the good outcome here
 * more often than for any other coach, so it must never read as an error. */
function parseProofreadCoachResponse(
  text: string,
): { findings: ProofreadCoachFinding[] } | { error: ProofreadCoachResult } {
  const json = parseCoachJson(text);
  if (!json) {
    return { error: { status: "error", reason: "malformed", detail: "response was not valid JSON" } };
  }
  const body = json.value as { findings?: unknown } | null;
  if (!Array.isArray(body?.findings)) {
    return { error: { status: "error", reason: "malformed", detail: "missing findings array" } };
  }
  return { findings: body.findings.filter(isFinding) };
}

export async function getProofreadCoachFindings(input: {
  content: string;
  userId: string;
}): Promise<ProofreadCoachResult> {
  const apiKey = process.env.TRAVILA_API_KEY;
  if (!apiKey) return { status: "error", reason: "not-configured" };

  const validationError = validateProofreadCoachInput(input.content);
  if (validationError) return validationError;

  const instruction =
    "You are a conservative final-pass proofreader for a student's college application essay. You check grammar " +
    "and mechanics only. You are NOT an editor, NOT a stylist, and NOT a writer for this task.\n\n" +
    "Rules you must follow:\n" +
    "- Never invent facts or content. Analyze only the text provided.\n" +
    "- Report only objective errors: grammar, punctuation, spelling, typos, missing words, accidentally repeated " +
    "words, subject-verb agreement, verb tense, pronoun agreement or unclear pronoun reference, sentence " +
    "fragments that are clearly accidental, run-on sentences, incorrect capitalization, incorrect article or " +
    "preposition use, clearly wrong word choice (a genuinely confused word such as \"affect\"/\"effect\", not a " +
    "word you would have chosen differently), and awkwardness caused by an actual grammatical mistake.\n" +
    "- Do NOT do style work. Never make prose more sophisticated, never replace the student's vocabulary, never " +
    "change sentence structure because another phrasing sounds better, never make writing more vivid, never " +
    "improve transitions or organization, never shorten the essay, never alter tone, and never rewrite a " +
    "sentence or paragraph that has no correctness issue. Other coaches own those jobs.\n" +
    "- Do NOT flag intentional stylistic choices. In particular, never flag:\n" +
    "  - sentence fragments used for effect\n" +
    "  - starting a sentence with \"And\", \"But\", or \"Because\"\n" +
    "  - conversational phrasing, contractions, or slang in dialogue or voice\n" +
    "  - deliberate repetition used for rhythm or emphasis\n" +
    "  - one-sentence paragraphs, dashes, ellipses, or italics used for pacing\n" +
    "  - the Oxford comma being present or absent, as long as it is used consistently\n" +
    "  - British versus American spelling, as long as it is consistent\n" +
    "  If you are unsure whether something is an error or a choice, leave it out. A false flag costs the student " +
    "more than a missed comma. If a construction is grammatically defensible and appears intentional, leave it " +
    "alone - the goal is to catch mistakes without flattening the student's voice.\n" +
    "- Do not give an overall verdict, score, or summary of the essay. Report specific errors only.\n" +
    "- Only quote exact excerpts (verbatim substrings, copied exactly character-for-character) from the essay " +
    "provided. Quote the shortest phrase that locates the issue - usually two to six words. Never quote a whole " +
    "paragraph.\n" +
    "- Findings must be distinct and non-overlapping: never quote the same phrase (or part of one) in more than " +
    "one finding.\n" +
    "- List findings in the order they appear in the essay.\n" +
    "- Set \"category\" to one of: " + PROOFREAD_CATEGORY_IDS.join(", ") + ".\n" +
    "- \"issue\" states what is wrong in one plain sentence, without grammar jargon the student would have to " +
    "look up.\n" +
    "- \"correction\" is the one exception to the no-replacement-prose rule, and it is deliberately narrow: give " +
    "the minimal corrected form of the quoted phrase needed to fix the mechanical error, and nothing more - same " +
    "words, fixed. Never expand it into a better-sounding sentence, never extend it beyond the phrase carrying " +
    "the error, and never use it to restyle a sentence that is already correct.\n" +
    "- Examples of the level of detail wanted:\n" +
    "  - excerpt \"since three years\" / issue \"Incorrect time expression.\" / correction \"for three years\"\n" +
    "  - excerpt \"my teammates, taught me\" / issue \"Unnecessary comma between the subject and its verb.\" / " +
    "correction \"my teammates taught me\"\n" +
    "- Be concise. If the essay has no real errors, return an empty findings array. Never invent a minor " +
    "criticism just to have something to report.\n\n" +
    "Respond with ONLY a single JSON object, no prose before or after, no markdown code fences, matching exactly " +
    "this shape:\n" +
    '{"findings": [{"excerpt": string, "category": "grammar"|"agreement"|"tense"|"punctuation"|"spelling"|' +
    '"typo"|"word-choice", "issue": string, "correction": string}]}\n\n' +
    `Essay:\n${input.content}`;

  const turn = await runTravilaTurn(apiKey, input.userId, PROOFREAD_COACH_PROFILE_ID, instruction);
  if ("error" in turn) return turn.error;

  const parsed = parseProofreadCoachResponse(turn.text);
  if ("error" in parsed) return parsed.error;

  return { status: "ok", findings: verifyAndDedupeExcerpts(input.content, parsed.findings) };
}
