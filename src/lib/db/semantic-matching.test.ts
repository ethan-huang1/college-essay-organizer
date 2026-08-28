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
