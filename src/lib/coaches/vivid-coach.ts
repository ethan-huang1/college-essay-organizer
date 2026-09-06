import { cleanContent } from "../essays";
import { runTravilaTurn } from "../travila";
import { parseCoachJson } from "./coach-json";
import { verifyAndDedupeExcerpts } from "./excerpt-verification";
import type { TravilaErrorReason } from "../travila";

/**
 * Vivid Coach: where the essay is too general to picture.
 *
 * "Vivid" here means concrete, specific, visual, personal and meaningful - not
 * more adjectives, heightened emotion, or purple prose. The distinction is
 * load-bearing, so the instruction states it outright: a coach that optimizes
 * for colour rather than substance would push a student toward exactly the
 * writing admissions readers discount.
 *
 * The hard boundary is that this coach names the KIND of detail that is
 * missing and never supplies it. It cannot know which project, which room, or
 * which number, and inventing one would put a fabricated experience in a
 * student's application essay. `detailNeeded` is therefore a category or a
 * question, never content.
 *
 * Like Flow, an empty findings array is a real answer.
 */

const VIVID_COACH_PROFILE_ID = "college_essay_vivid_coach";

export const VIVID_VAGUENESS_IDS = [
  "abstract-claim",
  "generic-phrasing",
  "told-not-shown",
  "unspecified-detail",
] as const;

export type VividVaguenessId = (typeof VIVID_VAGUENESS_IDS)[number];

export type VividCoachFinding = {
  /** Verbatim phrase containing the vagueness. */
  excerpt: string;
  vagueness: VividVaguenessId;
  /** Why this line gives a reader nothing to hold onto. */
  observation: string;
  /** The CATEGORY of missing detail, as a question or category - never content. */
  detailNeeded: string;
};

export type VividCoachResult =
  | { status: "ok"; findings: VividCoachFinding[] }
  | { status: "error"; reason: TravilaErrorReason; detail?: string };

export function validateVividCoachInput(content: string): VividCoachResult | null {
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

const VAGUENESS_IDS = new Set<string>(VIVID_VAGUENESS_IDS);

function isFinding(entry: unknown): entry is VividCoachFinding {
  const candidate = entry as Partial<VividCoachFinding> | null;
  return (
    typeof candidate?.excerpt === "string" &&
    candidate.excerpt.trim().length > 0 &&
    typeof candidate?.vagueness === "string" &&
    VAGUENESS_IDS.has(candidate.vagueness) &&
    typeof candidate?.observation === "string" &&
    candidate.observation.trim().length > 0 &&
    typeof candidate?.detailNeeded === "string" &&
    candidate.detailNeeded.trim().length > 0
  );
}

/** Same convention as Flow: malformed only when `findings` is missing or not
 * an array; an empty array stands, and invalid entries are dropped. */
function parseVividCoachResponse(text: string): { findings: VividCoachFinding[] } | { error: VividCoachResult } {
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

export async function getVividCoachFindings(input: { content: string; userId: string }): Promise<VividCoachResult> {
  const apiKey = process.env.TRAVILA_API_KEY;
  if (!apiKey) return { status: "error", reason: "not-configured" };

  const validationError = validateVividCoachInput(input.content);
  if (validationError) return validationError;

  const instruction =
    "You are an editorial coach helping a student find the places in their college application essay where the " +
    "writing is generic, vague, or abstract. You are NOT a writer for this task, and you must never supply the " +
    "missing detail yourself.\n\n" +
    "What \"vivid\" means here: more concrete, specific, visual, personal and meaningful. It does NOT mean more " +
    "adjectives, heightened emotion, invented detail, or flowery prose. Never push a student toward purple prose.\n\n" +
    "Rules you must follow:\n" +
    "- Never rewrite, paraphrase, or draft replacement prose, and never produce a revised version of the essay.\n" +
    "- Never invent a detail, an example, a name, a place, a number, or a sensory image. You do not know this " +
    "student's life. Name the KIND of detail that would help and stop there.\n" +
    "- Never write \"for example, you could say...\" followed by content. That is ghostwriting, and it is " +
    "forbidden here.\n" +
    "- Analyze only the text provided - do not add outside knowledge about the student.\n" +
    "- Preserve the student's voice. Plain language is not the same as vague language, and a short abstract " +
    "sentence can be doing real work. Report only places where a reader learns nothing specific.\n" +
    "- Do not give an overall verdict, score, or summary of the essay. Report specific passages only.\n" +
    "- Only quote exact excerpts (verbatim substrings, copied exactly character-for-character) from the essay " +
    "provided. Quote the shortest phrase that contains the vagueness.\n" +
    "- Findings must be distinct and non-overlapping: never quote the same sentence or passage (or part of one) " +
    "in more than one finding.\n" +
    "- List findings in the order they appear in the essay.\n" +
    "- Set \"vagueness\" to one of:\n" +
    "  - \"abstract-claim\": a general statement about the student or the world with nothing concrete behind it\n" +
    "  - \"generic-phrasing\": wording that could appear in anyone's essay (clichés, stock phrases, résumé language)\n" +
    "  - \"told-not-shown\": a feeling or change is announced rather than made visible through what happened\n" +
    "  - \"unspecified-detail\": something specific is gestured at but left unnamed (a \"project\", \"a teacher\", " +
    "\"one moment\")\n" +
    "- Watch especially for unearned claims such as \"I learned a lot\", \"it changed my perspective\", or \"I " +
    "became passionate about...\" with nothing showing how; accomplishments stated without context; and " +
    "reflection that announces the conclusion without showing the underlying change.\n" +
    "- \"observation\" is one to two sentences on why this particular line gives a reader nothing to hold onto.\n" +
    "- \"detailNeeded\" names the category of missing detail as a question or a category, never as content. " +
    "Good: \"which project, and what you actually did on it\"; \"the physical detail you remember from that " +
    "room\"; \"a specific belief, decision, or behaviour that was different afterwards\"; \"a question you " +
    "asked or a choice you made that shows the curiosity\". Bad: anything that invents a project, a room, a " +
    "belief, or a number on the student's behalf.\n" +
    "- Keep every field short enough that a student will actually read it.\n" +
    "- Prioritize the passages where added specificity would most change a reader's impression. If the essay is " +
    "already concrete throughout, return an empty findings array. Never pad the list.\n\n" +
    "Respond with ONLY a single JSON object, no prose before or after, no markdown code fences, matching exactly " +
    "this shape:\n" +
    '{"findings": [{"excerpt": string, "vagueness": "abstract-claim"|"generic-phrasing"|"told-not-shown"|' +
    '"unspecified-detail", "observation": string, "detailNeeded": string}]}\n\n' +
    `Essay:\n${input.content}`;

  const turn = await runTravilaTurn(apiKey, input.userId, VIVID_COACH_PROFILE_ID, instruction);
  if ("error" in turn) return turn.error;

  const parsed = parseVividCoachResponse(turn.text);
  if ("error" in parsed) return parsed.error;

  return { status: "ok", findings: verifyAndDedupeExcerpts(input.content, parsed.findings) };
}
