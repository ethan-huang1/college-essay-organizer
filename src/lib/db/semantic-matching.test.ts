import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { openTestDatabase } from "./client";
import { resetDemoWorkspace } from "./demo-workspace";
import { DEMO_WORKSPACE_ID } from "./seed";
import { essayPromptMatches, essays, prompts, schools } from "./schema";
import { DISABLE_ENV_VAR, embeddingsAvailable, resetEmbeddingProviderForTests } from "../embedding";

/**
 * The one test that exercises the real matching path end to end: live essay
 * embeddings against the committed prompt vectors, through the database.
 *
 * Opts out of the suite-wide embedding disable and **skips** rather than fails
 * when the model is not downloaded, so the rest of the suite stays hermetic
 * while this still covers the path a student actually gets.
 *
 * The assertions are deliberately about *which* prompt wins rather than about
 * scores. A scoring change should be free to move numbers; it should not be free
 * to stop a roommate note being the best answer to a roommate prompt. Numbers
 * are pinned in matching.test.ts, where they are inputs rather than outputs.
 */
describe("semantic matching, end to end", () => {
  let connection: ReturnType<typeof openTestDatabase>;
  let available = false;
  let fixture: Awaited<ReturnType<typeof buildFixture>> | null = null;

  /**
   * Built once for the whole file, not per test.
   *
   * Rebuilding the demo workspace means importing 19 colleges and embedding
   * every essay; doing that five times took the canonical gate past its ten
   * minute budget. Nothing here mutates the workspace, so one build is enough
   * and the tests stay independent of each other's assertions.
   */
  beforeAll(async () => {
    delete process.env[DISABLE_ENV_VAR];
    resetEmbeddingProviderForTests();
    available = await embeddingsAvailable();
    if (!available) return;
    connection = openTestDatabase();
    await connection.migrate();
    fixture = await buildFixture();
  }, 600_000);

  afterEach(async () => { /* the shared connection is closed in afterAll */ });
  afterAll(async () => { await connection?.close(); });

  async function buildFixture() {
    await resetDemoWorkspace(connection.db);
    const [matchRows, essayRows, promptRows, schoolRows] = await Promise.all([
      connection.db.select().from(essayPromptMatches).where(eq(essayPromptMatches.workspaceId, DEMO_WORKSPACE_ID)),
      connection.db.select().from(essays).where(eq(essays.workspaceId, DEMO_WORKSPACE_ID)),
      connection.db.select().from(prompts).where(eq(prompts.workspaceId, DEMO_WORKSPACE_ID)),
      connection.db.select().from(schools).where(eq(schools.workspaceId, DEMO_WORKSPACE_ID)),
    ]);
    const schoolName = new Map(schoolRows.map((row) => [row.id, row.name]));
    const promptById = new Map(promptRows.map((row) => [row.id, { ...row, school: schoolName.get(row.schoolId) ?? "" }]));
    const essayIdByTitle = new Map(essayRows.map((row) => [row.title, row.id]));
    const best = (title: string) => {
      const essayId = essayIdByTitle.get(title);
      const ranked = matchRows.filter((row) => row.essayId === essayId).sort((a, b) => b.score - a.score);
      return ranked.map((row) => ({ ...row, prompt: promptById.get(row.promptId)! }));
    };
    return { matchRows, best };
  }

  /** Non-null once `available`; every test returns early otherwise. */
  const demo = () => fixture!;

  it("puts a roommate note at the top for another school's roommate prompt", async () => {
    if (!available) return;
    const { best } = demo();
    // The category alone cannot do this: Roommate holds two catalogue prompts at
    // very different lengths, and the essay shares no distinctive vocabulary
    // with either. It is the semantic factor that identifies them.
    const top = best("What I Would Bring to a Hall")[0];
    expect(top.prompt.title.toLowerCase()).toContain("roommate");
  });

  it("recognises which school an institution-specific essay was written for", async () => {
    if (!available) return;
    const { best } = demo();
    const ranked = best("Why Brown, and the Open Curriculum");
    expect(ranked[0].prompt.school).toBe("Brown University");
    // And every other school's fit prompt is capped, not merely ranked lower:
    // reusing this essay elsewhere means rewriting the institution-specific
    // material, which is a band ceiling rather than a score penalty.
    const elsewhere = ranked.filter((row) => row.prompt.school !== "Brown University" && row.schoolSpecificityRisk === "high");
    expect(elsewhere.length).toBeGreaterThan(0);
    // The guarantee is a ceiling, so the assertion is "never better than this"
    // rather than "exactly this". A ceiling only lowers a band: a high-risk pair
    // whose score is already under the reuse floor is correctly new-response,
    // and asserting an exact band would couple this to the scoring weights.
    const capped = new Set(["reusable-significant-edits", "new-response"]);
    for (const row of elsewhere) {
      expect(capped, `${row.prompt.school}: ${row.prompt.title}`).toContain(row.recommendedAction);
    }
  });

  it("matches an academic-interest essay to prompts about what excites you", async () => {
    if (!available) return;
    const { best } = demo();
    const top = best("Why I Study Systems").slice(0, 4).map((row) => row.prompt.title.toLowerCase());
    expect(top.some((title) => title.includes("excit") || title.includes("interest") || title.includes("major") || title.includes("problems"))).toBe(true);
  });

  it("reaches every band, including the top one", async () => {
    if (!available) return;
    const { matchRows } = demo();
    const bands = new Set(matchRows.map((row) => row.recommendedAction));
    // Without semantic similarity the top band is out of reach for this
    // workspace - see the comment in persistence.test.ts. With it, a
    // well-matched pair can earn it, which is the point of the factor.
    expect(bands).toContain("reusable-slight-edits");
    expect(bands).toContain("reusable-edits");
    expect(bands).toContain("reusable-significant-edits");
    expect(bands).toContain("new-response");
  });

  it("takes an essay's function from its earliest assignment, deterministically", async () => {
    if (!available) return;
    // Regression: the assignment query had no ORDER BY, so an essay assigned to
    // several prompts drew its function from whichever row came back first. Two
    // problems - the same data could score differently between recomputations,
    // and a later assignment is a reuse *target*, so accepting a suggestion
    // could redefine what the essay is.
    const { assignedEssayResponses } = await import("./schema");
    const rows = await connection.db.select().from(assignedEssayResponses)
      .where(eq(assignedEssayResponses.workspaceId, DEMO_WORKSPACE_ID))
      .orderBy(assignedEssayResponses.assignedAt);
    const perEssay = new Map<string, number>();
    for (const row of rows) perEssay.set(row.essayId, (perEssay.get(row.essayId) ?? 0) + 1);
    // The demo has to actually exercise the multi-assignment case or this test
    // is vacuous.
    expect([...perEssay.values()].some((count) => count > 1)).toBe(true);

    // Recomputing twice must produce identical scores.
    const { recomputeWorkspaceMatches } = await import("../reuse");
    const snapshot = async () => {
      await recomputeWorkspaceMatches(connection.db, DEMO_WORKSPACE_ID);
      const rowsNow = await connection.db.select().from(essayPromptMatches)
        .where(eq(essayPromptMatches.workspaceId, DEMO_WORKSPACE_ID));
      return rowsNow
        .map((row) => `${row.essayId}|${row.promptId}|${row.score}|${row.recommendedAction}`)
        .sort()
        .join("\n");
    };
    expect(await snapshot()).toBe(await snapshot());
  });

  // Origin is the point of the whole precedence chain: an explicit origin must
  // outrank every assignment, and accepting a reuse suggestion must not be able
  // to redefine what the essay is.
  it("lets an explicit origin prompt outrank any assignment, and keeps it stable", async () => {
    if (!available) return;
    const { createEssay, updateEssayMetadata } = await import("../essays");
    const { assignEssayToPrompt } = await import("../assignments");
    const { recomputeWorkspaceMatches } = await import("../reuse");
    const { essays: essaysTable, prompts: promptsTable, schools: schoolsTable } = await import("./schema");

    const promptRows = await connection.db.select().from(promptsTable).where(eq(promptsTable.workspaceId, DEMO_WORKSPACE_ID));
    const schoolRows = await connection.db.select().from(schoolsTable).where(eq(schoolsTable.workspaceId, DEMO_WORKSPACE_ID));
    const name = new Map(schoolRows.map((row) => [row.id, row.name]));
    const { categoryReview } = await import("../retrieval/category-review");
    const fnOf = (promptId: string) => {
      const prompt = promptRows.find((row) => row.id === promptId)!;
      return categoryReview(name.get(prompt.schoolId) ?? "", prompt.externalRef)?.[5] ?? null;
    };
    // Two prompts whose reviewed functions differ, so "which one supplied the
    // function" is observable rather than a coin flip.
    const origin = promptRows.find((row) => fnOf(row.id) === "reflect")!;
    const other = promptRows.find((row) => fnOf(row.id) === "connect-to-school")!;
    expect(origin).toBeTruthy();
    expect(other).toBeTruthy();

    const essayId = await createEssay(connection.db, DEMO_WORKSPACE_ID, {
      title: "Origin precedence fixture",
      content: "A short synthetic essay used only to check which prompt supplies the function.",
      status: "draft",
      designation: "canonical",
      originPromptId: origin.id,
    });
    const stored = await connection.db.select().from(essaysTable).where(eq(essaysTable.id, essayId)).then((r) => r[0]);
    expect(stored.originPromptId).toBe(origin.id);

    const scoresAgainst = async (promptId: string) => {
      await recomputeWorkspaceMatches(connection.db, DEMO_WORKSPACE_ID);
      const rows = await connection.db.select().from(essayPromptMatches)
        .where(eq(essayPromptMatches.workspaceId, DEMO_WORKSPACE_ID));
      return rows.find((row) => row.essayId === essayId && row.promptId === promptId)!.score;
    };

    const beforeOrigin = await scoresAgainst(origin.id);
    const beforeOther = await scoresAgainst(other.id);

    // Accepting a reuse suggestion for a differently-functioned prompt.
    await assignEssayToPrompt(connection.db, DEMO_WORKSPACE_ID, other.id, essayId);
    expect(await scoresAgainst(origin.id)).toBe(beforeOrigin);
    expect(await scoresAgainst(other.id)).toBe(beforeOther);

    // And repeated recomputation is stable.
    expect(await scoresAgainst(origin.id)).toBe(beforeOrigin);

    // A pasted origin supplies a function too, for a prompt outside the list.
    const pastedId = await createEssay(connection.db, DEMO_WORKSPACE_ID, {
      title: "Pasted origin fixture",
      content: "Another short synthetic essay.",
      status: "draft",
      designation: "canonical",
      originPromptText: "Reflect on a community you belong to. Why is this community meaningful to you?",
      originPromptTitle: "A meaningful community",
    });
    const pasted = await connection.db.select().from(essaysTable).where(eq(essaysTable.id, pastedId)).then((r) => r[0]);
    expect(pasted.originPromptText).toContain("Reflect on a community");
    expect(pasted.originPromptId).toBeNull();

    // Choosing a catalogue prompt later clears the pasted pair rather than
    // leaving two answers to one question.
    await updateEssayMetadata(connection.db, DEMO_WORKSPACE_ID, pastedId, {
      title: "Pasted origin fixture",
      status: "draft",
      designation: "canonical",
      originPromptId: origin.id,
      originPromptText: "Reflect on a community you belong to.",
    });
    const switched = await connection.db.select().from(essaysTable).where(eq(essaysTable.id, pastedId)).then((r) => r[0]);
    expect(switched.originPromptId).toBe(origin.id);
    expect(switched.originPromptText).toBeNull();
    expect(switched.originPromptTitle).toBeNull();
  });

  it("does not recommend most pairs: 936 pairs, a handful of suggestions", async () => {
    if (!available) return;
    const { matchRows } = demo();
    const recommended = matchRows.filter((row) => row.recommendedAction !== "new-response");
    // A matcher that recommends everything is useless. This is a sanity bound,
    // not a target: it would fail loudly if a scoring change made the floor
    // meaningless.
    expect(recommended.length).toBeGreaterThan(10);
    expect(recommended.length / matchRows.length).toBeLessThan(0.3);
  });
});
