import { cleanContent } from "../essays";
import { runTravilaTurn } from "../travila";
import { parseCoachJson } from "./coach-json";
import { verifyAndDedupeExcerpts } from "./excerpt-verification";
import type { TravilaErrorReason } from "../travila";

/**
 * Flow Coach: where the essay is hard to follow from one idea to the next.
 *
 * Diagnostic, not generative. It names the seam that breaks and the kind of
 * connection that would mend it, and is forbidden from writing the transition
 * sentence itself - the student's own link between two of their own
 * experiences is exactly the sentence an AI has no standing to draft.
 *
 * Findings are excerpt-anchored so verifyAndDedupeExcerpts can prove the seam
 * really exists in the essay before a student is sent looking for it.
 *
 * An empty findings array is a real answer (an essay that flows well), not a
 * malformed response - a distinction Shorten Coach draws the other way,
 * because "shorten this by 200 words but I found nothing to cut" is a
 * contradiction and "your essay reads cleanly" is not.
 */

const FLOW_COACH_PROFILE_ID = "college_essay_flow_coach";

export const FLOW_ISSUE_IDS = [
  "abrupt-transition",
  "logic-jump",
  "out-of-order",
  "stalled-pacing",
  "unclear-connection",
] as const;

export type FlowIssueId = (typeof FLOW_ISSUE_IDS)[number];

export type FlowCoachFinding = {
  /** Verbatim phrase at the seam - the join between two ideas, not a paragraph. */
  excerpt: string;
  issue: FlowIssueId;
  /** What breaks for a reader here, specific to this essay. */
  observation: string;
  /** The kind of connective move or reordering that would fix it - never the prose. */
  suggestion: string;
};

export type FlowCoachResult =
  | { status: "ok"; findings: FlowCoachFinding[] }
  | { status: "error"; reason: TravilaErrorReason; detail?: string };

export function validateFlowCoachInput(content: string): FlowCoachResult | null {
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

const ISSUE_IDS = new Set<string>(FLOW_ISSUE_IDS);

function isFinding(entry: unknown): entry is FlowCoachFinding {
  const candidate = entry as Partial<FlowCoachFinding> | null;
  return (
    typeof candidate?.excerpt === "string" &&
    candidate.excerpt.trim().length > 0 &&
    typeof candidate?.issue === "string" &&
    ISSUE_IDS.has(candidate.issue) &&
    typeof candidate?.observation === "string" &&
    candidate.observation.trim().length > 0 &&
    typeof candidate?.suggestion === "string" &&
    candidate.suggestion.trim().length > 0
  );
}

/**
 * Variable cardinality: a missing or non-array `findings` field is malformed,
 * but an empty array is kept as-is. Individual invalid entries are dropped
 * rather than failing the response, so one bad issue id cannot cost a student
 * four good findings.
 */
function parseFlowCoachResponse(text: string): { findings: FlowCoachFinding[] } | { error: FlowCoachResult } {
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

export async function getFlowCoachFindings(input: { content: string; userId: string }): Promise<FlowCoachResult> {
  const apiKey = process.env.TRAVILA_API_KEY;
  if (!apiKey) return { status: "error", reason: "not-configured" };

  const validationError = validateFlowCoachInput(input.content);
  if (validationError) return validationError;

  const instruction =
    "You are an editorial coach diagnosing how a student's college application essay moves from one idea to the " +
    "next. You are NOT a writer for this task.\n\n" +
    "Rules you must follow:\n" +
    "- Never rewrite, paraphrase, or draft replacement prose, and never produce a revised version of the essay.\n" +
    "- Never write the transition sentence for the student. Say what kind of connection is missing; they write it.\n" +
    "- Never invent facts, events, or people not present in the essay below. Analyze only the text provided.\n" +
    "- Preserve the student's voice. An unusual rhythm, a deliberately short sentence, or a jump used for effect " +
    "is not a flow problem. Report only places where a reader would genuinely lose the thread.\n" +
    "- Do not give an overall verdict, score, or summary of the essay. Report specific seams only.\n" +
    "- Only quote exact excerpts (verbatim substrings, copied exactly character-for-character) from the essay " +
    "provided. Quote the shortest phrase that locates the seam - the end of one idea and the start of the next - " +
    "never a whole paragraph.\n" +
    "- Findings must be distinct and non-overlapping: never quote the same sentence or passage (or part of one) " +
    "in more than one finding.\n" +
    "- List findings in the order they appear in the essay.\n" +
    "- Set \"issue\" to one of:\n" +
    "  - \"abrupt-transition\": two adjacent passages are fine on their own but nothing carries the reader between them\n" +
    "  - \"logic-jump\": a conclusion or shift in feeling arrives without the step that earns it\n" +
    "  - \"out-of-order\": this material would work better earlier or later in the essay\n" +
    "  - \"stalled-pacing\": the essay circles or lingers here without advancing\n" +
    "  - \"unclear-connection\": the link between these ideas exists but the reader has to guess at it\n" +
    "- \"observation\" is one to two sentences on what specifically breaks for a reader at this point in THIS " +
    "essay. No generic advice that would apply to any essay.\n" +
    "- \"suggestion\" names the kind of move that would fix it - for example: state the realization before the " +
    "scene that proves it; move this paragraph after the one about the audition; connect these with the shared " +
    "idea of responsibility. Never supply the sentence itself.\n" +
    "- Keep every field short enough that a student will actually read it.\n" +
    "- Report only genuine problems. If the essay moves cleanly throughout, return an empty findings array. " +
    "Never pad the list to have something to say.\n\n" +
    "Respond with ONLY a single JSON object, no prose before or after, no markdown code fences, matching exactly " +
    "this shape:\n" +
    '{"findings": [{"excerpt": string, "issue": "abrupt-transition"|"logic-jump"|"out-of-order"|' +
    '"stalled-pacing"|"unclear-connection", "observation": string, "suggestion": string}]}\n\n' +
    `Essay:\n${input.content}`;

  const turn = await runTravilaTurn(apiKey, input.userId, FLOW_COACH_PROFILE_ID, instruction);
  if ("error" in turn) return turn.error;

  const parsed = parseFlowCoachResponse(turn.text);
  if ("error" in parsed) return parsed.error;

  return { status: "ok", findings: verifyAndDedupeExcerpts(input.content, parsed.findings) };
}
