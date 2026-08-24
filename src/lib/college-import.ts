import { and, eq } from "drizzle-orm";

import { classifyText } from "./classification";
import { CURRENT_CYCLE_LABEL } from "./cycle";
import type { AppDatabase } from "./db/client";
import { applicationCycles, promptChangeLog, promptFamilies, promptFamilyLinks, prompts, schools } from "./db/schema";
import { PROMPT_FAMILIES } from "./db/taxonomy";
import { promptContentChanged } from "./retrieval/normalize";
import { lookupSchoolSource } from "./retrieval/registry";
import type { ApplicationPlatform, RawPromptRecord, VerificationStatus } from "./retrieval/types";
import { canonicalizeUniversityName } from "./top-universities";

const FAMILY_NAME_BY_SLUG = new Map<string, string>(PROMPT_FAMILIES.map(([slug, name]) => [slug, name]));

// Parses a "20XX–YY" label into (startYear, startYear+1) - every cycle here
// spans one admissions year to the next, so the end year is never stored
// independently of the label that names it.
function parseCycleLabel(label: string) {
  const match = label.match(/(\d{4})/);
  const startYear = match ? Number(match[1]) : new Date().getFullYear();
  return { startYear, endYear: startYear + 1 };
}

// Distinct cycle rows are created per label - a previous-cycle prompt's
// "2025–26" cycle is a different row than the active "2026–27" one, which
// is what lets the UI (and, later, dashboard stats) tell them apart
// unambiguously rather than inferring it from verificationStatus alone.
function getOrCreateCycle(db: AppDatabase, workspaceId: string, label: string) {
  const existing = db.select({ id: applicationCycles.id }).from(applicationCycles)
    .where(and(eq(applicationCycles.workspaceId, workspaceId), eq(applicationCycles.label, label)))
    .get();
  if (existing) return existing.id;
  const { startYear, endYear } = parseCycleLabel(label);
  const id = crypto.randomUUID();
  db.insert(applicationCycles).values({ id, workspaceId, label, startYear, endYear, isActive: label === CURRENT_CYCLE_LABEL }).run();
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

function assignFamilies(db: Pick<AppDatabase, "select" | "insert">, workspaceId: string, promptId: string, promptText: string) {
  const classification = classifyText(promptText);
  const primaryFamilyId = classification.primarySlug
    ? familyIdByName(db, workspaceId, FAMILY_NAME_BY_SLUG.get(classification.primarySlug) ?? "")
    : null;
  const secondaryFamilyIds = classification.secondarySlugs
    .map((slug) => familyIdByName(db, workspaceId, FAMILY_NAME_BY_SLUG.get(slug) ?? ""))
    .filter((id): id is string => Boolean(id));
  const assignments = [
    ...(primaryFamilyId ? [{ familyId: primaryFamilyId, isPrimary: true }] : []),
    ...secondaryFamilyIds.map((familyId) => ({ familyId, isPrimary: false })),
  ];
  if (assignments.length > 0) {
    db.insert(promptFamilyLinks).values(assignments.map(({ familyId, isPrimary }) => ({
      id: crypto.randomUUID(),
      workspaceId,
      promptId,
      familyId,
      isPrimary,
      source: "deterministic" as const,
    }))).run();
  }
  return classification.confidence;
}

type ImportCounts = { created: number; updated: number; unchanged: number; flagged: number };

// Inserts a brand-new prompt, or - if a prompt with the same (schoolId,
// externalRef) already exists - detects whether anything tracked actually
// changed. Identical re-imports are true no-ops (idempotent); a genuine
// change updates the row, records the prior state in promptChangeLog, and
// flips verificationStatus to needs-review so a human notices rather than
// silently trusting a re-fetch. Never creates a duplicate prompt.
function upsertPrompt(
  db: AppDatabase,
  workspaceId: string,
  schoolId: string,
  cycleId: string,
  raw: RawPromptRecord,
  recordDefaults: { status: VerificationStatus; sourceUrl: string | null; platform: ApplicationPlatform; retrievedAt: Date },
  counts: ImportCounts,
) {
  const verificationStatus = raw.verificationStatus ?? recordDefaults.status;
  const existing = db.select().from(prompts)
    .where(and(eq(prompts.schoolId, schoolId), eq(prompts.externalRef, raw.externalRef)))
    .get();

  if (!existing) {
    db.transaction((tx) => {
      const promptId = crypto.randomUUID();
      tx.insert(prompts).values({
        id: promptId,
        workspaceId,
        schoolId,
        cycleId,
        externalRef: raw.externalRef,
        title: raw.title,
        promptText: raw.promptText,
        minWordCount: raw.minWordCount ?? null,
        maxWordCount: raw.maxWordCount ?? null,
        minCharCount: raw.minCharCount ?? null,
        maxCharCount: raw.maxCharCount ?? null,
        requirement: raw.requirement,
        conditionalNote: raw.conditionalNote ?? null,
        classificationSource: "deterministic",
        verificationStatus,
        applicationPlatform: recordDefaults.platform,
        sourceUrl: recordDefaults.sourceUrl,
        retrievedAt: recordDefaults.retrievedAt,
      }).run();
      assignFamilies(tx, workspaceId, promptId, `${raw.title} ${raw.promptText}`);
    });
    counts.created += 1;
    return;
  }

  if (!promptContentChanged(existing, raw)) {
    counts.unchanged += 1;
    return;
  }

  db.transaction((tx) => {
    tx.insert(promptChangeLog).values({
      id: crypto.randomUUID(),
      workspaceId,
      promptId: existing.id,
      previousPromptText: existing.promptText,
      previousMinWordCount: existing.minWordCount,
      previousMaxWordCount: existing.maxWordCount,
    }).run();
    tx.update(prompts).set({
      title: raw.title,
      promptText: raw.promptText,
      minWordCount: raw.minWordCount ?? null,
      maxWordCount: raw.maxWordCount ?? null,
      minCharCount: raw.minCharCount ?? null,
      maxCharCount: raw.maxCharCount ?? null,
      requirement: raw.requirement,
      conditionalNote: raw.conditionalNote ?? null,
      verificationStatus: "needs-review",
      sourceUrl: recordDefaults.sourceUrl,
      retrievedAt: recordDefaults.retrievedAt,
      updatedAt: new Date(),
    }).where(eq(prompts.id, existing.id)).run();
  });
  counts.updated += 1;
  counts.flagged += 1;
}

export type ImportCollegeResult = {
  schoolId: string;
  schoolName: string;
  verificationStatus: VerificationStatus;
  sourceUrl: string | null;
  note: string;
  counts: ImportCounts;
};

// The single entry point for "Add College": creates or reuses the school,
// looks up the retrieval registry, and imports/updates/flags each prompt
// through the shared upsert pipeline above - every school (however it was
// researched) goes through identical logic, never special-cased here.
export function importCollege(db: AppDatabase, workspaceId: string, schoolName: string): ImportCollegeResult {
  const currentCycleId = getOrCreateCycle(db, workspaceId, CURRENT_CYCLE_LABEL);
  const school = getOrCreateSchool(db, workspaceId, canonicalizeUniversityName(schoolName), currentCycleId);
  const source = lookupSchoolSource(school.name);
  const counts: ImportCounts = { created: 0, updated: 0, unchanged: 0, flagged: 0 };

  if (!source || source.prompts.length === 0) {
    const note = source?.note ?? "Current prompts not yet verified for this school. Add prompts manually below.";
    // Persisted on the school record (reusing the existing notes column)
    // so a no-supplement-confirmed/needs-review outcome stays visible on
    // later visits, not just as this one-time return value - otherwise a
    // school with zero prompts looks identical whether it's genuinely
    // unresearched or confirmed to have no supplement.
    if (source && !school.notes) {
      db.update(schools).set({ notes: note }).where(eq(schools.id, school.id)).run();
    }
    return {
      schoolId: school.id,
      schoolName: school.name,
      verificationStatus: source?.verificationStatus ?? "manual",
      sourceUrl: source?.sourceUrl ?? null,
      note,
      counts,
    };
  }

  // The prompts themselves are filed under whichever cycle the source
  // record actually represents (may differ from the school's own "current"
  // cycle for a previous-cycle record).
  const promptCycleId = getOrCreateCycle(db, workspaceId, source.cycleLabel);
  const retrievedAt = new Date(source.retrievedAt);
  for (const raw of source.prompts) {
    upsertPrompt(db, workspaceId, school.id, promptCycleId, raw, {
      status: source.verificationStatus,
      sourceUrl: source.sourceUrl,
      platform: source.applicationPlatform,
      retrievedAt,
    }, counts);
  }

  return {
    schoolId: school.id,
    schoolName: school.name,
    verificationStatus: source.verificationStatus,
    sourceUrl: source.sourceUrl,
    note: source.note,
    counts,
  };
}
