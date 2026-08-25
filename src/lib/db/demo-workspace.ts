import { and, eq, inArray } from "drizzle-orm";

import type { AppDatabase } from "./client";
import { DEMO_WORKSPACE_ID, seedTaxonomy } from "./seed";
import { assignedEssayResponses, promptFamilies, promptFamilyLinks, prompts, schools, workspaces } from "./schema";
import { assignEssayToPrompt } from "../assignments";
import { importCollege } from "../college-import";
import { createEssay, saveEssayVersion, type EssayStatus } from "../essays";
import { updatePrompt } from "../prompts";
import { recomputeWorkspaceMatches } from "../reuse";

// The example workspace is built by running the *real* Add College pipeline
// (importCollege -> verified registry -> deterministic classification ->
// recomputed matches) over a list of real schools, rather than by inventing
// schools and prompt text. MVP_SPEC §6 originally asked for fictional
// schools; the repo owner overrode that, because a demo made of invented
// prompts cannot show what the product actually feels like at 15+ schools
// and 100+ prompts. Everything the registry owns therefore stays real and
// cited; only the essays below are written for the demo, and each one is
// labelled so it can never be mistaken for the student's own writing
// (MVP_SPEC §6: "Never imply that synthetic essays belong to the user").
//
// This is a reproducible seed: "Reset demo" rebuilds it from these constants
// plus the registry, and touches no personal record.
export const DEMO_WORKSPACE_NAME = "Example workspace";

const SAMPLE_ESSAY_NOTE = "Example essay supplied with the demo workspace — not your writing.";

// Chosen for spread rather than prestige: schools with 1 prompt and schools
// with 15, a previous-cycle school (Harvard) so that warning is visible, and
// enough breadth that every taxonomy category ends up represented.
export const DEMO_SCHOOLS = [
  "Amherst College",
  "Brown University",
  "Dartmouth College",
  "Duke University",
  "Georgetown University",
  "Harvard University",
  "Massachusetts Institute of Technology",
  "New York University",
  "Northwestern University",
  "Princeton University",
  "Rice University",
  "Stanford University",
  "Tufts University",
  "University of California, Berkeley",
  "University of Pennsylvania",
  "University of Southern California",
  "Vanderbilt University",
  "Wellesley College",
  "Yale University",
] as const;

// The deterministic classifier keys "Why Us" off
// organizer-side phrasing ("why us", "our campus"), which real supplements
// never use - they say "Why are you applying to Nursing" or "what aspects of
// our location". So these two genuinely institution-fit prompts are corrected
// through the product's own manual-override path, which both fills the
// category (MVP_SPEC section 6 wants all ten represented) and demonstrates
// the override feature. The classifier's keyword gap is left alone on
// purpose: widening a shared heuristic would change classifications in every
// user's real workspace, which is a separate decision.
// The institution-specific essay answers the one Brown prompt it was written
// for. Named explicitly rather than picked by family so it can never land on a
// prompt another demo essay already answers.
const DEMO_SCHOOL_SPECIFIC_ASSIGNMENT = {
  school: "Brown University",
  promptTitle: "Your approach to the Open Curriculum",
  essayTitle: "Why Brown, and the Open Curriculum",
} as const;

const DEMO_RECLASSIFIED: readonly { school: string; promptTitle: string; family: string }[] = [
  { school: "Northwestern University", promptTitle: "Northwestern's location", family: "Why Us" },
  { school: "University of Pennsylvania", promptTitle: "School-specific: Nursing", family: "Why Us" },
];

type DemoEssay = {
  title: string;
  family: string;
  status: EssayStatus;
  targetWordCount: number;
  designation: "canonical" | "school-adaptation";
  schoolSpecificPhrases?: string[];
  content: string;
  revision?: { content: string; reason: string };
};

export const DEMO_ESSAYS: readonly DemoEssay[] = [
  {
    title: "The Metronome",
    family: "Personal Statement",
    status: "ready",
    targetWordCount: 650,
    designation: "canonical",
    content:
      "My grandmother's metronome sat on the piano for eleven years before I understood what it was for. I had been playing scales against it since I was six, resenting the click that refused to bend around my mistakes. The summer I turned fifteen I started teaching piano to four kids in my apartment building, and on the first afternoon I set the metronome on the windowsill and watched a seven-year-old named Dario try to outrun it. He hated it exactly the way I had. So I turned it off. We clapped instead, and I counted out loud, and when he lost the beat I lost it with him and we found it again together. I learned that summer that the click was never the point; the point was the shared pulse, the agreement between people that this is where the beat falls. I have been looking for that agreement everywhere since — in the debate rounds where I stopped trying to win and started trying to find the actual disagreement, in the kitchen where my father and I finally learned to cook in the same small space without colliding. What I want from college is a bigger room and more people willing to keep time with me.",
    revision: {
      content:
        "My grandmother's metronome sat on the piano for eleven years before I understood what it was for. I had been playing scales against it since I was six, resenting the click that refused to bend around my mistakes. The summer I turned fifteen I started teaching piano to four kids in my apartment building. On the first afternoon I set the metronome on the windowsill and watched a seven-year-old named Dario try to outrun it. He hated it exactly the way I had, so I turned it off. We clapped instead, and I counted out loud, and when he lost the beat I lost it with him and we found it again together. The click was never the point. The point was the shared pulse — the agreement between people that this is where the beat falls. I have been looking for that agreement everywhere since: in the debate rounds where I stopped trying to win and started trying to find the actual disagreement, in the kitchen where my father and I finally learned to cook in the same small space without colliding. What I want from college is a bigger room and more people willing to keep time with me.",
      reason: "Tightened the opening and cut two hedging sentences",
    },
  },
  {
    title: "Why I Study Systems",
    family: "Why Major",
    status: "revising",
    targetWordCount: 340,
    designation: "canonical",
    content:
      "I came to computer science through a broken bus schedule. My route home was posted as every twelve minutes and arrived, reliably, in clumps of three buses followed by twenty-eight minutes of nothing. I spent a winter logging arrivals in a spreadsheet before I learned the phenomenon has a name — bus bunching — and that it emerges from the interaction of simple rules, not from anyone's incompetence. That reframing changed what I want to study. I am less interested in individual programs than in the behavior systems produce that no single component intended. I want to study distributed systems and the mathematics of queueing, and I want to keep one foot in the civic side of the problem, because the interesting failures are rarely purely technical.",
    revision: {
      content:
        "I came to computer science through a broken bus schedule. My route home was posted as every twelve minutes and arrived, reliably, in clumps of three buses followed by twenty-eight minutes of nothing. I spent a winter logging arrivals in a spreadsheet before I learned the phenomenon has a name — bus bunching — and that it emerges from the interaction of simple rules rather than from anyone's incompetence. That reframing changed what I want to study. I am less interested in individual programs than in the behavior systems produce that no single component intended: the queue that forms because everyone acted reasonably. I want to study distributed systems and the mathematics of queueing, and to keep one foot in the civic side of the problem, because the interesting failures are rarely purely technical.",
      reason: "Added the concrete image the middle paragraph was missing",
    },
  },
  {
    title: "Fixing the Free Library",
    family: "Community & Contribution",
    status: "draft",
    targetWordCount: 300,
    designation: "canonical",
    content:
      "The little free library outside our building was empty for most of a year. Not vandalized — emptied, steadily, by neighbors who needed books and had no way to return them. My first instinct was a sign-out sheet. My second, better instinct was to ask why anyone would sign a sheet for a box of paperbacks. So I stopped trying to enforce return and started trying to increase supply: a drive at my school, a standing agreement with a used bookstore for their unsellable stock, a shelf I built badly and rebuilt well. The library is full now, and it empties constantly, which is the point.",
  },
  {
    title: "The Argument I Lost",
    family: "Other",
    status: "draft",
    targetWordCount: 260,
    designation: "canonical",
    content:
      "I lost a debate round on a claim I still believe is true, and it took me two years to understand why that was correct. My case was about municipal broadband and it was, technically, airtight. It also assumed everyone in the room already agreed that internet access is infrastructure rather than a product. My opponent did not attack my evidence. She attacked the assumption, and I had no answer because I had never gone looking for one. I have since learned to write down the thing I am taking for granted before I write anything else.",
  },
  {
    title: "A Question About Rivers",
    family: "Other",
    status: "outline",
    targetWordCount: 180,
    designation: "canonical",
    content:
      "Why do rivers meander? The textbook answer is erosion on the outside bank, deposition on the inside, and that answer is correct and completely unsatisfying, because it explains how a bend deepens without explaining why a straight channel bends at all. I have spent a year reading about this — helical flow, instability thresholds, the way a perturbation the size of a stone can select a wavelength for a hundred miles of water. I do not have the mathematics yet. That is most of why I want it.",
  },
  {
    title: "The Kitchen Table Ledger",
    family: "Identity & Background",
    status: "draft",
    targetWordCount: 300,
    designation: "canonical",
    content:
      "My mother kept the household accounts in a spiral notebook on the kitchen table, in a mix of Tagalog and arithmetic I could read before I could read English properly. Nobody explained it to me. I learned what a remittance was the way you learn weather — from watching what it did to the room. Some months the number at the bottom of the page meant my cousin in Cavite started school on time. Some months it meant we ate rice and eggs for a week and my father said nothing about it at dinner. I used to be embarrassed by that notebook, by how visible it made us. What I understand now is that it was the most honest document in our house: a running record of what we owed each other across nine thousand miles, kept in pencil so it could be revised. I have my own notebook now. It is mostly bus arrival times and half-finished proofs, and it is kept in pencil for the same reason.",
  },
  {
    title: "What I Would Bring to a Hall",
    family: "Short Answers",
    status: "ready",
    targetWordCount: 120,
    designation: "canonical",
    content:
      "I will bring a rice cooker, a folding chess set with two replacement pawns carved from an eraser, and a genuinely unreasonable willingness to be woken up at 1 a.m. to discuss whether a hot dog is a sandwich. I am tidy about shared space and messy about my own. I sing while doing dishes, badly, and I will stop if asked, and I will start again.",
  },
  // Deliberately institution-specific: it names one school throughout, so the
  // matcher flags it as a high school-specificity risk against every *other*
  // school's "why us" prompt. MVP_SPEC §6 requires the demo to show that
  // dangerous-reuse case, and this is the essay that produces it.
  {
    title: "Why Brown, and the Open Curriculum",
    family: "Why Us",
    status: "draft",
    targetWordCount: 250,
    designation: "school-adaptation",
    schoolSpecificPhrases: ["Brown University", "Brown", "the Open Curriculum"],
    content:
      "The Open Curriculum is the reason I am writing this essay instead of a list of requirements I intend to survive. At Brown I would pair concentrations that my school's schedule treats as mutually exclusive: applied mathematics for the queueing theory I have been teaching myself, and urban studies for the reason I care about it. I want to take a course from the Swearer Center's community-engagement sequence and bring the bus-arrival dataset I have kept for two winters into it, because I would rather test my transit argument against a neighborhood than against a rubric. Brown asks students to justify their own path. I have been building mine since the winter I started counting buses.",
  },
];

// Re-runs the real update path so the prompt records classificationSource
// "manual", exactly as it would if a student had changed it in the UI.
async function reclassify(db: AppDatabase, familyIdByName: Map<string, string>) {
  for (const entry of DEMO_RECLASSIFIED) {
    const familyId = familyIdByName.get(entry.family);
    const row = await db
      .select({ prompt: prompts })
      .from(prompts)
      .innerJoin(schools, eq(schools.id, prompts.schoolId))
      .where(and(
        eq(prompts.workspaceId, DEMO_WORKSPACE_ID),
        eq(prompts.title, entry.promptTitle),
        eq(schools.name, entry.school),
      ))
      .then((rows) => rows[0]);
    if (!row || !familyId) continue;
    const { prompt } = row;
    const secondaryFamilyIds = (await db
      .select({ familyId: promptFamilyLinks.familyId })
      .from(promptFamilyLinks)
      .where(and(eq(promptFamilyLinks.promptId, prompt.id), eq(promptFamilyLinks.isPrimary, false))))
      .map((link) => link.familyId);

    await updatePrompt(db, DEMO_WORKSPACE_ID, prompt.id, {
      schoolId: prompt.schoolId,
      title: prompt.title,
      promptText: prompt.promptText,
      minWordCount: prompt.minWordCount,
      maxWordCount: prompt.maxWordCount,
      minCharCount: prompt.minCharCount,
      maxCharCount: prompt.maxCharCount,
      requirement: prompt.requirement,
      conditionalNote: prompt.conditionalNote ?? undefined,
      status: prompt.status,
      deadline: prompt.deadline,
      notes: prompt.notes ?? undefined,
      primaryFamilyId: familyId,
      secondaryFamilyIds,
    });
  }
}

async function familyPrompts(db: AppDatabase, familyName: string) {
  return db
    .select({ id: prompts.id, schoolId: prompts.schoolId, title: prompts.title })
    .from(prompts)
    .innerJoin(
      promptFamilyLinks,
      and(eq(promptFamilyLinks.promptId, prompts.id), eq(promptFamilyLinks.isPrimary, true)),
    )
    .innerJoin(promptFamilies, eq(promptFamilies.id, promptFamilyLinks.familyId))
    .where(and(eq(prompts.workspaceId, DEMO_WORKSPACE_ID), eq(promptFamilies.name, familyName)))
    .orderBy(prompts.title);
}

// Assignments must land on prompts at *different* schools: one essay serving
// several schools is the whole reuse thesis, and a test asserts it.
function pickAcrossSchools(rows: { id: string; schoolId: string }[], limit: number) {
  const seenSchools = new Set<string>();
  const picked: string[] = [];
  for (const row of rows) {
    if (seenSchools.has(row.schoolId)) continue;
    seenSchools.add(row.schoolId);
    picked.push(row.id);
    if (picked.length === limit) break;
  }
  return picked;
}

export type DemoWorkspaceSummary = {
  schools: number;
  prompts: number;
  essays: number;
  assignments: number;
  matches: number;
};

/**
 * Rebuilds the example workspace from scratch: real schools through the real
 * import pipeline, the sample essays above, a spread of work statuses, and
 * freshly recomputed matches. Deleting the workspace row cascades every demo
 * record, so this is idempotent and never touches personal data.
 */
export async function resetDemoWorkspace(db: AppDatabase): Promise<DemoWorkspaceSummary> {
  await db.transaction(async (tx) => {
    await tx.delete(workspaces).where(eq(workspaces.id, DEMO_WORKSPACE_ID));
    await tx.insert(workspaces).values({ id: DEMO_WORKSPACE_ID, kind: "demo", name: DEMO_WORKSPACE_NAME });
    await seedTaxonomy(tx, DEMO_WORKSPACE_ID);
  });

  // Deliberately outside the transaction above: importCollege, createEssay and
  // recomputeWorkspaceMatches each open their own.
  for (const schoolName of DEMO_SCHOOLS) {
    await importCollege(db, DEMO_WORKSPACE_ID, schoolName);
  }

  const demoFamilies = await db.select().from(promptFamilies).where(eq(promptFamilies.workspaceId, DEMO_WORKSPACE_ID));
  const familyIdByName = new Map(demoFamilies.map((family) => [family.name, family.id] as const));

  await reclassify(db, familyIdByName);

  const essayIdByTitle = new Map<string, string>();
  for (const essay of DEMO_ESSAYS) {
    const essayId = await createEssay(db, DEMO_WORKSPACE_ID, {
      title: essay.title,
      status: essay.status,
      designation: essay.designation,
      targetWordCount: essay.targetWordCount,
      notes: SAMPLE_ESSAY_NOTE,
      schoolSpecificPhrases: essay.schoolSpecificPhrases ?? [],
      primaryFamilyId: familyIdByName.get(essay.family) ?? null,
      content: essay.content,
    });
    // A second immutable version on the essays that declare one, so version
    // history and comparison have something real to show.
    if (essay.revision) await saveEssayVersion(db, DEMO_WORKSPACE_ID, essayId, essay.revision);
    essayIdByTitle.set(essay.title, essayId);
  }

  const assignmentPlan: [string, string, number][] = [
    ["What I Would Bring to a Hall", "Short Answers", 2],
    ["The Metronome", "Personal Statement", 2],
    ["Fixing the Free Library", "Community & Contribution", 2],
  ];
  // assignEssayToPrompt replaces whatever a prompt already had, so the seed
  // tracks what it has claimed and never assigns the same prompt twice.
  const claimedPrompts = new Set<string>();
  for (const [essayTitle, familyName, limit] of assignmentPlan) {
    const essayId = essayIdByTitle.get(essayTitle);
    if (!essayId) continue;
    const available = (await familyPrompts(db, familyName)).filter((row) => !claimedPrompts.has(row.id));
    for (const promptId of pickAcrossSchools(available, limit)) {
      await assignEssayToPrompt(db, DEMO_WORKSPACE_ID, promptId, essayId);
      claimedPrompts.add(promptId);
    }
  }

  // Assigned where it belongs, so the matcher's high-risk verdict against
  // every *other* school's "why us" prompt becomes the dangerous-reuse example
  // the demo needs to show.
  const specificEssayId = essayIdByTitle.get(DEMO_SCHOOL_SPECIFIC_ASSIGNMENT.essayTitle);
  const specificPrompt = await db
    .select({ id: prompts.id })
    .from(prompts)
    .innerJoin(schools, eq(schools.id, prompts.schoolId))
    .where(and(
      eq(prompts.workspaceId, DEMO_WORKSPACE_ID),
      eq(prompts.title, DEMO_SCHOOL_SPECIFIC_ASSIGNMENT.promptTitle),
      eq(schools.name, DEMO_SCHOOL_SPECIFIC_ASSIGNMENT.school),
    ))
    .then((rows) => rows[0]);
  if (specificEssayId && specificPrompt && !claimedPrompts.has(specificPrompt.id)) {
    await assignEssayToPrompt(db, DEMO_WORKSPACE_ID, specificPrompt.id, specificEssayId);
    claimedPrompts.add(specificPrompt.id);
  }

  // A deterministic spread of finished and in-flight work across schools, so
  // the progress views are not uniformly zero on a fresh demo. Applied as two
  // bulk updates rather than one per prompt: over a network connection, 112
  // sequential round-trips here is most of a request budget.
  const ordered = await db
    .select({ id: prompts.id })
    .from(prompts)
    .innerJoin(schools, eq(schools.id, prompts.schoolId))
    .where(eq(prompts.workspaceId, DEMO_WORKSPACE_ID))
    .orderBy(schools.name, prompts.title);
  const completeIds = ordered.filter((_, index) => index % 9 === 0).map((row) => row.id);
  const inProgressIds = ordered.filter((_, index) => index % 9 === 1).map((row) => row.id);
  await Promise.all([
    completeIds.length
      ? db.update(prompts).set({ status: "complete" }).where(inArray(prompts.id, completeIds)).execute()
      : Promise.resolve(),
    inProgressIds.length
      ? db.update(prompts).set({ status: "in-progress" }).where(inArray(prompts.id, inProgressIds)).execute()
      : Promise.resolve(),
  ]);

  await recomputeWorkspaceMatches(db, DEMO_WORKSPACE_ID);

  // Counted from the database rather than from what the seed intended, so the
  // summary can never disagree with what actually landed.
  const [schoolRows, promptRows, assignmentRows] = await Promise.all([
    db.select({ id: schools.id }).from(schools).where(eq(schools.workspaceId, DEMO_WORKSPACE_ID)).execute(),
    db.select({ id: prompts.id }).from(prompts).where(eq(prompts.workspaceId, DEMO_WORKSPACE_ID)).execute(),
    db.select({ id: assignedEssayResponses.id }).from(assignedEssayResponses)
      .where(eq(assignedEssayResponses.workspaceId, DEMO_WORKSPACE_ID)).execute(),
  ]);

  return {
    schools: schoolRows.length,
    prompts: promptRows.length,
    essays: DEMO_ESSAYS.length,
    assignments: assignmentRows.length,
    matches: DEMO_ESSAYS.length * promptRows.length,
  };
}
