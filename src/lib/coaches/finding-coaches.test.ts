import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getFlowCoachFindings } from "./flow-coach";
import { getProofreadCoachFindings } from "./proofread-coach";
import { getVividCoachFindings } from "./vivid-coach";

/**
 * Flow, Vivid and Proofread share one exact contract - a `findings` array of
 * excerpt-anchored records with one enum field - so they are tested from one
 * table rather than three copied files. The production modules stay separate
 * (each owns its own profile, instruction and types, per the convention in
 * shorten-coach.ts); it is only these assertions that are genuinely identical,
 * and duplicating them three times would mean three places to forget to
 * update.
 *
 * Per-coach specifics that are NOT shared - the exact zero-finding copy, the
 * instruction text - are asserted in the per-coach block at the bottom.
 */

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

function assistantText(content: string) {
  return jsonResponse({
    messageHistory: [
      {
        role: "ROLE_ASSISTANT",
        generatedBy: "run-1",
        content: [{ type: "CONTENT_PART_TYPE_TEXT", content }],
      },
    ],
  });
}

function assistantJson(findings: unknown) {
  return assistantText(JSON.stringify({ findings }));
}

const ESSAY =
  "I joined debate in ninth grade because my brother did. " +
  "The book project started that same winter. " +
  "I learned a lot about myself, and it changed my perspective on listening. " +
  "Each of the students shared their own perspective, and it made me reconsider.";

/** A verbatim substring of ESSAY, so verifyAndDedupeExcerpts keeps it. */
const REAL_EXCERPT = "The book project started that same winter.";
/** Also verbatim, and after REAL_EXCERPT, so the two never overlap. */
const SECOND_EXCERPT = "it made me reconsider";

type Coach = {
  name: string;
  run: (content: string) => Promise<unknown>;
  /** A valid finding for this coach, anchored to `excerpt`. */
  finding: (excerpt: string) => Record<string, string>;
  /** The same finding with its enum field set to something unknown. */
  badEnum: (excerpt: string) => Record<string, string>;
};

const COACHES: Coach[] = [
  {
    name: "getFlowCoachFindings",
    run: (content) => getFlowCoachFindings({ content, userId: "user-1" }),
    finding: (excerpt) => ({
      excerpt,
      issue: "abrupt-transition",
      observation: "Nothing carries the reader from debate to the book project.",
      suggestion: "State the shared interest in overlooked perspectives.",
    }),
    badEnum: (excerpt) => ({
      excerpt,
      issue: "vibes",
      observation: "Something.",
      suggestion: "Something else.",
    }),
  },
  {
    name: "getVividCoachFindings",
    run: (content) => getVividCoachFindings({ content, userId: "user-1" }),
    finding: (excerpt) => ({
      excerpt,
      vagueness: "told-not-shown",
      observation: "The change is announced rather than shown.",
      detailNeeded: "a specific belief or decision that was different afterwards",
    }),
    badEnum: (excerpt) => ({
      excerpt,
      vagueness: "boring",
      observation: "Something.",
      detailNeeded: "Something else.",
    }),
  },
  {
    name: "getProofreadCoachFindings",
    run: (content) => getProofreadCoachFindings({ content, userId: "user-1" }),
    finding: (excerpt) => ({
      excerpt,
      category: "grammar",
      issue: "Unclear pronoun reference.",
      correction: "the discussion made me reconsider",
    }),
    badEnum: (excerpt) => ({
      excerpt,
      category: "elegance",
      issue: "Something.",
      correction: "Something else.",
    }),
  },
];

describe.each(COACHES)("$name", (coach) => {
  const originalKey = process.env.TRAVILA_API_KEY;

  beforeEach(() => {
    process.env.TRAVILA_API_KEY = "test-key";
    vi.useFakeTimers();
  });

  afterEach(() => {
    process.env.TRAVILA_API_KEY = originalKey;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Drives the three-call create/send/poll sequence to completion. */
  async function runWith(finalResponse: Response, content = ESSAY) {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ thread: { threadId: "thread-1" } }))
      .mockResolvedValueOnce(jsonResponse({ runId: "run-1" }))
      .mockResolvedValue(finalResponse);
    vi.stubGlobal("fetch", fetchMock);

    const promise = coach.run(content);
    await vi.runAllTimersAsync();
    return { result: await promise, fetchMock };
  }

  it("refuses when the key is not configured, without making a network call", async () => {
    delete process.env.TRAVILA_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await coach.run(ESSAY)).toEqual({ status: "error", reason: "not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty content without a network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await coach.run("   ")).toEqual({ status: "error", reason: "invalid-input", detail: "Essay is empty." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects content over the 20,000 character cap without a network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await coach.run("a".repeat(20001))).toMatchObject({ status: "error", reason: "invalid-input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns valid findings", async () => {
    const { result } = await runWith(assistantJson([coach.finding(REAL_EXCERPT)]));

    expect(result).toMatchObject({ status: "ok" });
    expect((result as { findings: unknown[] }).findings).toHaveLength(1);
    expect((result as { findings: { excerpt: string }[] }).findings[0].excerpt).toBe(REAL_EXCERPT);
  });

  it("treats an empty findings array as a real answer, not a malformed response", async () => {
    // The divergence from Shorten Coach: "nothing to report" is a legitimate
    // verdict here, and must never surface to a student as an error.
    expect(await runWith(assistantJson([])).then(({ result }) => result)).toEqual({ status: "ok", findings: [] });
  });

  it("reads JSON wrapped in a markdown code fence", async () => {
    const fenced = "```json\n" + JSON.stringify({ findings: [coach.finding(REAL_EXCERPT)] }) + "\n```";
    const { result } = await runWith(assistantText(fenced));

    expect(result).toMatchObject({ status: "ok" });
    expect((result as { findings: unknown[] }).findings).toHaveLength(1);
  });

  it("reports malformed when the response is not JSON", async () => {
    const { result } = await runWith(assistantText("Here are some thoughts about your essay."));

    expect(result).toMatchObject({ status: "error", reason: "malformed" });
  });

  it("reports malformed when the findings field is missing", async () => {
    const { result } = await runWith(assistantText(JSON.stringify({ recommendations: [] })));

    expect(result).toMatchObject({ status: "error", reason: "malformed", detail: "missing findings array" });
  });

  it("drops a finding whose enum value is unknown, keeping the valid ones", async () => {
    const { result } = await runWith(assistantJson([
      coach.badEnum(REAL_EXCERPT),
      coach.finding(SECOND_EXCERPT),
    ]));

    expect(result).toMatchObject({ status: "ok" });
    const findings = (result as { findings: { excerpt: string }[] }).findings;
    expect(findings).toHaveLength(1);
    expect(findings[0].excerpt).toBe(SECOND_EXCERPT);
  });

  it("drops a finding whose excerpt is not verbatim in the essay", async () => {
    // The guarantee that matters most: a coach cannot send a student looking
    // for a passage they never wrote.
    const { result } = await runWith(assistantJson([
      coach.finding("a sentence that appears nowhere in the essay"),
      coach.finding(REAL_EXCERPT),
    ]));

    const findings = (result as { findings: { excerpt: string }[] }).findings;
    expect(findings).toHaveLength(1);
    expect(findings[0].excerpt).toBe(REAL_EXCERPT);
  });

  it("keeps only the earlier of two overlapping findings", async () => {
    const { result } = await runWith(assistantJson([
      coach.finding("The book project started that same winter."),
      coach.finding("book project started"),
    ]));

    const findings = (result as { findings: { excerpt: string }[] }).findings;
    expect(findings).toHaveLength(1);
    expect(findings[0].excerpt).toBe("The book project started that same winter.");
  });

  it("orders findings as they appear in the essay, whatever order the model sent", async () => {
    const { result } = await runWith(assistantJson([
      coach.finding(SECOND_EXCERPT),
      coach.finding(REAL_EXCERPT),
    ]));

    const findings = (result as { findings: { excerpt: string }[] }).findings;
    expect(findings.map((finding) => finding.excerpt)).toEqual([REAL_EXCERPT, SECOND_EXCERPT]);
  });

  it("times out if the run never completes", async () => {
    const { result } = await runWith(jsonResponse({ messageHistory: [] }));

    expect(result).toEqual({ status: "error", reason: "timeout" });
  });
});

describe("per-coach instructions", () => {
  const originalKey = process.env.TRAVILA_API_KEY;

  beforeEach(() => {
    process.env.TRAVILA_API_KEY = "test-key";
    vi.useFakeTimers();
  });

  afterEach(() => {
    process.env.TRAVILA_API_KEY = originalKey;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function instructionFor(run: () => Promise<unknown>) {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ thread: { threadId: "thread-1" } }))
      .mockResolvedValueOnce(jsonResponse({ runId: "run-1" }))
      .mockResolvedValue(assistantJson([]));
    vi.stubGlobal("fetch", fetchMock);

    const promise = run();
    await vi.runAllTimersAsync();
    await promise;

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    return { profileId: body.setActiveProfileId as string, instruction: body.userMessage.content[0].content as string };
  }

  it("sends Flow to its own profile and forbids writing the transition", async () => {
    const { profileId, instruction } = await instructionFor(() => getFlowCoachFindings({ content: ESSAY, userId: "u" }));

    expect(profileId).toBe("college_essay_flow_coach");
    expect(instruction).toContain("Never write the transition sentence for the student");
    expect(instruction).toContain("Never rewrite, paraphrase, or draft replacement prose");
    expect(instruction).toContain(ESSAY);
  });

  it("sends Vivid to its own profile and rules out flowery prose and invented detail", async () => {
    const { profileId, instruction } = await instructionFor(() => getVividCoachFindings({ content: ESSAY, userId: "u" }));

    expect(profileId).toBe("college_essay_vivid_coach");
    expect(instruction).toContain("It does NOT mean more adjectives");
    expect(instruction).toContain("Never invent a detail");
    expect(instruction).toContain("That is ghostwriting");
  });

  it("sends Proofread to its own profile, scopes its one correction field, and protects deliberate style", async () => {
    const { profileId, instruction } = await instructionFor(() =>
      getProofreadCoachFindings({ content: ESSAY, userId: "u" }));

    expect(profileId).toBe("college_essay_proofread_coach");
    // The single, narrow exception to the shared no-replacement-prose rule.
    expect(instruction).toContain("give the minimal corrected form of the quoted phrase");
    expect(instruction).toContain("Never expand it into a better-sounding sentence");
    // And the conservatism that keeps it from flattening a voice.
    expect(instruction).toContain("sentence fragments used for effect");
    expect(instruction).toContain("If you are unsure whether something is an error or a choice, leave it out");
    expect(instruction).toContain("Do NOT do style work");
  });
});
