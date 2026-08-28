/**
 * Read-only production audit. Recomputes every stored match from production data
 * using the deployed scoring functions and compares, which checks the data and
 * the formula agree without writing anything.
 *
 * Prints no credentials, emails, or essay content.
 */
import { eq } from "drizzle-orm";

import { openDatabase } from "../src/lib/db/client.ts";
import { classifyText } from "../src/lib/classification.ts";
import { calibrate, cosine, decodeVector, embedTexts, embeddingsAvailable } from "../src/lib/embedding.ts";
import { PROMPT_VECTORS } from "../src/lib/retrieval/prompt-vectors.ts";
import { essayEmbeddingText } from "../src/lib/semantic.ts";
import {
  assignedEssayResponses, essayFamilyLinks, essayPromptMatches, essays,
  promptFamilies, promptFamilyLinks, promptTagLinks, promptTags, prompts, schools, workspaces,
} from "../src/lib/db/schema.ts";
import { SCORING, scoreMatch } from "../src/lib/matching.ts";
import { categoryReview } from "../src/lib/retrieval/category-review.ts";
import { detectSchoolMentionsIn } from "../src/lib/school-mentions.ts";
import { inferPromptFunction } from "../src/lib/prompt-function.ts";
import { wordCount } from "../src/lib/essays.ts";

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set."); process.exit(2); }
const { db, close } = openDatabase();

try {
  const sum = (w: Record<string, number>) => Object.values(w).reduce<number>((a, b) => a + b, 0);
  console.log(`weights normal ${JSON.stringify(SCORING.WEIGHTS.normal)} = ${sum(SCORING.WEIGHTS.normal)}`);
  console.log(`weights other  ${JSON.stringify(SCORING.WEIGHTS.other)} = ${sum(SCORING.WEIGHTS.other)}\n`);

  const semanticOn = await embeddingsAvailable();
  console.log(`embedding model available in this process: ${semanticOn ? "yes" : "no"}\n`);
  const vectorByKey = new Map(PROMPT_VECTORS.map(([sc, r, e]) => [`${sc}|${r}`, decodeVector(e)]));

  let checked = 0, agreed = 0, overMax = 0;
  const disagreements: string[] = [];

  for (const workspace of await db.select().from(workspaces)) {
    const [fam, essayRows, promptRows, schoolRows, eLinks, pLinks, tags, pTags, assigns, stored] = await Promise.all([
      db.select().from(promptFamilies).where(eq(promptFamilies.workspaceId, workspace.id)),
      db.select().from(essays).where(eq(essays.workspaceId, workspace.id)),
      db.select().from(prompts).where(eq(prompts.workspaceId, workspace.id)),
      db.select().from(schools).where(eq(schools.workspaceId, workspace.id)),
      db.select().from(essayFamilyLinks).where(eq(essayFamilyLinks.workspaceId, workspace.id)),
      db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.workspaceId, workspace.id)),
      db.select().from(promptTags).where(eq(promptTags.workspaceId, workspace.id)),
      db.select().from(promptTagLinks).where(eq(promptTagLinks.workspaceId, workspace.id)),
      db.select().from(assignedEssayResponses).where(eq(assignedEssayResponses.workspaceId, workspace.id)).orderBy(assignedEssayResponses.assignedAt),
      db.select().from(essayPromptMatches).where(eq(essayPromptMatches.workspaceId, workspace.id)),
    ]);
    const slugById = new Map(fam.map((f) => [f.id, f.slug]));
    const nameById = new Map(schoolRows.map((s) => [s.id, s.name]));
    const tagNameById = new Map(tags.map((t) => [t.id, t.name]));
    const schoolNames = schoolRows.map((s) => s.name);
    const fnOfPrompt = (promptId: string) => {
      const p = promptRows.find((r) => r.id === promptId);
      return p ? categoryReview(nameById.get(p.schoolId) ?? "", p.externalRef)?.[5] ?? null : null;
    };
    const essayFn = new Map<string, ReturnType<typeof fnOfPrompt>>();
    for (const e of essayRows) {
      if (e.originPromptId) { const f = fnOfPrompt(e.originPromptId); if (f) { essayFn.set(e.id, f); continue; } }
      if (e.originPromptText) { const f = inferPromptFunction(e.originPromptTitle ?? "", e.originPromptText); if (f) essayFn.set(e.id, f); }
    }
    for (const a of assigns) { if (!essayFn.has(a.essayId)) { const f = fnOfPrompt(a.promptId); if (f) essayFn.set(a.essayId, f); } }
    for (const e of essayRows) { if (!essayFn.has(e.id)) { const f = inferPromptFunction(e.title, e.currentContent); if (f) essayFn.set(e.id, f); } }

    // Same calibration the app performs: per essay, across every prompt in the
    // workspace that has a committed vector.
    const zByEssay = new Map<string, Map<string, number>>();
    if (semanticOn) {
      const texts = essayRows.map((e) => essayEmbeddingText(e.title, e.currentContent));
      const vectors = await embedTexts(texts);
      if (vectors) {
        for (const [i, e] of essayRows.entries()) {
          const targets = promptRows
            .map((p) => ({ p, v: vectorByKey.get(`${nameById.get(p.schoolId) ?? ""}|${p.externalRef}`) }))
            .filter((x): x is { p: typeof x.p; v: number[] } => Boolean(x.v));
          const cal = calibrate(targets.map((t) => cosine(vectors[i], t.v)));
          zByEssay.set(e.id, new Map(targets.map((t, j) => [t.p.id, cal[j]])));
        }
      }
    }

    for (const row of stored) {
      const essay = essayRows.find((e) => e.id === row.essayId);
      const prompt = promptRows.find((p) => p.id === row.promptId);
      if (!essay || !prompt) continue;
      const eOwn = eLinks.filter((l) => l.essayId === essay.id);
      const essayPrimary = slugById.get(eOwn.find((l) => l.isPrimary)?.familyId ?? "") ?? null;
      const pOwn = pLinks.filter((l) => l.promptId === prompt.id);
      const derived = classifyText(`${essay.title}. ${essay.currentContent}`);
      const result = scoreMatch({
        essayWordCount: wordCount(essay.currentContent),
        essayPrimaryFamilySlug: essayPrimary,
        // Mirrors reuse.ts exactly, including its filter dropping the essay's
        // own primary from its derived secondaries. Omitting that filter made
        // this audit disagree with 8 stored rows by exactly 7 points - one
        // spurious shared secondary - which looked like a data fault and was an
        // audit fault.
        essaySecondaryFamilySlugs: [...new Set([
          ...eOwn.filter((l) => !l.isPrimary).map((l) => slugById.get(l.familyId)).filter((s): s is string => Boolean(s)),
          ...derived.secondarySlugs.filter((slug) => slug !== essayPrimary),
        ])],
        essayTags: derived.tags,
        essaySchoolSpecificPhrases: [...new Set([...essay.schoolSpecificPhrases,
          ...detectSchoolMentionsIn({ title: essay.title, body: essay.currentContent }, schoolNames)])],
        essayFunction: essayFn.get(essay.id) ?? null,
        promptSchoolName: nameById.get(prompt.schoolId) ?? "",
        promptPrimaryFamilySlug: slugById.get(pOwn.find((l) => l.isPrimary)?.familyId ?? "") ?? null,
        promptSecondaryFamilySlugs: pOwn.filter((l) => !l.isPrimary).map((l) => slugById.get(l.familyId)).filter((s): s is string => Boolean(s)),
        promptTags: pTags.filter((l) => l.promptId === prompt.id).map((l) => tagNameById.get(l.tagId)).filter((n): n is string => Boolean(n)),
        promptFunction: fnOfPrompt(prompt.id),
        promptMinWordCount: prompt.minWordCount,
        promptMaxWordCount: prompt.maxWordCount,
        semanticZScore: zByEssay.get(essay.id)?.get(prompt.id) ?? null,
      });
      checked += 1;
      const factorTotal = Math.round(result.factors.primary + result.factors.semantic + result.factors.secondary + result.factors.function);
      if (result.score > 100 || factorTotal > 100) overMax += 1;
      if (result.score === row.score && result.recommendedAction === row.recommendedAction) agreed += 1;
      else if (disagreements.length < 5) {
        disagreements.push(`  stored ${row.score}/${row.recommendedAction} vs recomputed ${result.score}/${result.recommendedAction} (factors ${JSON.stringify(result.factors)})`);
      }
    }
  }
  console.log(`recomputed ${checked} stored matches; ${agreed} identical (${((agreed / checked) * 100).toFixed(1)}%)`);
  console.log(`scores above the 100 maximum: ${overMax}`);
  if (disagreements.length) { console.log("sample disagreements:"); for (const d of disagreements) console.log(d); }
} finally {
  await close();
}
