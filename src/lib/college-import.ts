import { and, eq } from "drizzle-orm";

import { classifyText } from "./classification";
import type { AppDatabase } from "./db/client";
import { applicationCycles, promptFamilies, promptFamilyLinks, prompts, schools } from "./db/schema";
import { PROMPT_FAMILIES } from "./db/taxonomy";
import { promptRetrievalProvider, type PromptVerificationStatus, type RetrievedPrompt } from "./prompt-retrieval";
import { canonicalizeUniversityName } from "./top-universities";

const CYCLE_LABEL = "2026–27";
const FAMILY_NAME_BY_SLUG = new Map<string, string>(PROMPT_FAMILIES.map(([slug, name]) => [slug, name]));

function getOrCreateCycle(db: AppDatabase, workspaceId: string) {
  const existing = db.select({ id: applicationCycles.id }).from(applicationCycles)
    .where(and(eq(applicationCycles.workspaceId, workspaceId), eq(applicationCycles.label, CYCLE_LABEL)))
    .get();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  db.insert(applicationCycles).values({ id, workspaceId, label: CYCLE_LABEL, startYear: 2026, endYear: 2027, isActive: true }).run();
  return id;
}

// Storing the canonical name from the top-100 picker (or a cleaned manual
// name) and reusing an existing row with the same name is what prevents
// spelling variations from creating duplicates - see MVP_SPEC.md §1.
function getOrCreateSchool(db: AppDatabase, workspaceId: string, name: string, cycleId: string) {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (cleaned.length < 2 || cleaned.length > 120) throw new Error("School name must be between 2 and 120 characters.");
  const existing = db.select().from(schools)
    .where(and(eq(schools.workspaceId, workspaceId), eq(schools.name, cleaned)))
    .get();
  if (existing) return existing;
  const id = crypto.randomUUID();
  db.insert(schools).values({ id, workspaceId, cycleId, name: cleaned }).run();
  const created = db.select().from(schools).where(eq(schools.id, id)).get();
  if (!created) throw new Error("Failed to create school.");
  return created;
}

function familyIdByName(db: Pick<AppDatabase, "select">, workspaceId: string, name: string) {
  return db.select({ id: promptFamilies.id }).from(promptFamilies)
    .where(and(eq(promptFamilies.workspaceId, workspaceId), eq(promptFamilies.name, name)))
    .get()?.id ?? null;
}

function importPrompt(
  db: AppDatabase,
  workspaceId: string,
  schoolId: string,
  cycleId: string,
  retrieved: RetrievedPrompt,
  verification: { status: PromptVerificationStatus; sourceUrl: string | null; retrievedAt: Date },
) {
  const classification = classifyText(`${retrieved.title} ${retrieved.promptText}`);
  db.transaction((tx) => {
    const promptId = crypto.randomUUID();
    tx.insert(prompts).values({
      id: promptId,
      workspaceId,
      schoolId,
      cycleId,
      title: retrieved.title,
      promptText: retrieved.promptText,
      minWordCount: retrieved.minWordCount,
      maxWordCount: retrieved.maxWordCount,
      requirement: retrieved.requirement,
      classificationConfidence: classification.confidence,
      classificationSource: "deterministic",
      verificationStatus: verification.status,
      sourceUrl: verification.sourceUrl,
      retrievedAt: verification.retrievedAt,
    }).run();

    const primaryFamilyId = classification.primarySlug
      ? familyIdByName(tx, workspaceId, FAMILY_NAME_BY_SLUG.get(classification.primarySlug) ?? "")
      : null;
    const secondaryFamilyIds = classification.secondarySlugs
      .map((slug) => familyIdByName(tx, workspaceId, FAMILY_NAME_BY_SLUG.get(slug) ?? ""))
      .filter((id): id is string => Boolean(id));

    const assignments = [
      ...(primaryFamilyId ? [{ familyId: primaryFamilyId, isPrimary: true }] : []),
      ...secondaryFamilyIds.map((familyId) => ({ familyId, isPrimary: false })),
    ];
    if (assignments.length > 0) {
      tx.insert(promptFamilyLinks).values(assignments.map(({ familyId, isPrimary }) => ({
        id: crypto.randomUUID(),
        workspaceId,
        promptId,
        familyId,
        isPrimary,
        source: "deterministic" as const,
      }))).run();
    }
  });
}

export type ImportCollegeResult = {
  schoolId: string;
  schoolName: string;
  verificationStatus: PromptVerificationStatus;
  sourceUrl: string | null;
  importedPromptCount: number;
  note: string;
};

// The single entry point for "Add College": creates or reuses the school,
// looks up the curated retrieval provider, imports and auto-classifies any
// found prompts, and always returns a clear status - including the
// "not yet verified" case MVP_SPEC.md §2 requires rather than guessing.
export function importCollege(db: AppDatabase, workspaceId: string, schoolName: string): ImportCollegeResult {
  const cycleId = getOrCreateCycle(db, workspaceId);
  const school = getOrCreateSchool(db, workspaceId, canonicalizeUniversityName(schoolName), cycleId);
  const retrieved = promptRetrievalProvider.retrievePrompts(school.name);

  if (!retrieved || retrieved.prompts.length === 0) {
    return {
      schoolId: school.id,
      schoolName: school.name,
      verificationStatus: retrieved?.verificationStatus ?? "manual",
      sourceUrl: retrieved?.sourceUrl ?? null,
      importedPromptCount: 0,
      note: retrieved?.note ?? "Current prompts not yet verified for this school. Add prompts manually below.",
    };
  }

  // Idempotent: re-adding a school whose prompts were already imported from
  // the same source does not create duplicates.
  const alreadyImported = retrieved.sourceUrl
    ? db.select({ id: prompts.id }).from(prompts)
        .where(and(eq(prompts.schoolId, school.id), eq(prompts.sourceUrl, retrieved.sourceUrl)))
        .all()
    : [];
  if (alreadyImported.length > 0) {
    return {
      schoolId: school.id,
      schoolName: school.name,
      verificationStatus: retrieved.verificationStatus,
      sourceUrl: retrieved.sourceUrl,
      importedPromptCount: 0,
      note: "This school's prompts were already imported from this source.",
    };
  }

  const retrievedAt = new Date(retrieved.retrievedAt);
  for (const prompt of retrieved.prompts) {
    importPrompt(db, workspaceId, school.id, cycleId, prompt, {
      status: retrieved.verificationStatus,
      sourceUrl: retrieved.sourceUrl,
      retrievedAt,
    });
  }

  return {
    schoolId: school.id,
    schoolName: school.name,
    verificationStatus: retrieved.verificationStatus,
    sourceUrl: retrieved.sourceUrl,
    importedPromptCount: retrieved.prompts.length,
    note: retrieved.note,
  };
}
