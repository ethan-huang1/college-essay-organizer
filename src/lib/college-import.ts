import { and, eq, inArray } from "drizzle-orm";

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
async function getOrCreateCycle(db: AppDatabase, workspaceId: string, label: string) {
  const existing = await db.select({ id: applicationCycles.id }).from(applicationCycles)
    .where(and(eq(applicationCycles.workspaceId, workspaceId), eq(applicationCycles.label, label)))
    .then((rows) => rows[0]);
  if (existing) return existing.id;
  const { startYear, endYear } = parseCycleLabel(label);
  const id = crypto.randomUUID();
  await db.insert(applicationCycles).values({ id, workspaceId, label, startYear, endYear, isActive: label === CURRENT_CYCLE_LABEL });
  return id;
}

// Storing the canonical name from the top-100 picker (or a cleaned manual
// name) and reusing an existing row with the same name is what prevents
// spelling variations from creating duplicates - see MVP_SPEC.md §1.
async function getOrCreateSchool(db: AppDatabase, workspaceId: string, name: string, cycleId: string) {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (cleaned.length < 2 || cleaned.length > 120) throw new Error("School name must be between 2 and 120 characters.");
  const existing = await db.select().from(schools)
    .where(and(eq(schools.workspaceId, workspaceId), eq(schools.name, cleaned)))
    .then((rows) => rows[0]);
  if (existing) return existing;
  const id = crypto.randomUUID();
  const [created] = await db.insert(schools).values({ id, workspaceId, cycleId, name: cleaned }).returning();
  if (!created) throw new Error("Failed to create school.");
  return created;
}

// The ten categories are read once per import and passed down, rather than
// re-queried for every category of every prompt. On a network database that is
// the difference between one round-trip and several hundred.
async function loadFamilyIds(db: Pick<AppDatabase, "select">, workspaceId: string) {
  const rows = await db.select({ id: promptFamilies.id, name: promptFamilies.name })
    .from(promptFamilies)
    .where(eq(promptFamilies.workspaceId, workspaceId));
  return new Map(rows.map((row) => [row.name, row.id]));
}

// Pure: turns a prompt's text into the category-link rows it should get. No
// database access, so a whole school's links can be built in memory and
// inserted in one statement.
function familyLinkRows(workspaceId: string, promptId: string, promptText: string, familyIds: Map<string, string>) {
  const classification = classifyText(promptText);
  const familyIdFor = (slug: string) => familyIds.get(FAMILY_NAME_BY_SLUG.get(slug) ?? "") ?? null;
  const primaryFamilyId = classification.primarySlug ? familyIdFor(classification.primarySlug) : null;
  const secondaryFamilyIds = classification.secondarySlugs
    .map(familyIdFor)
    .filter((id): id is string => Boolean(id));
  const assignments = [
    ...(primaryFamilyId ? [{ familyId: primaryFamilyId, isPrimary: true }] : []),
    ...secondaryFamilyIds.map((familyId) => ({ familyId, isPrimary: false })),
  ];
  return assignments.map(({ familyId, isPrimary }) => ({
    id: crypto.randomUUID(),
    workspaceId,
    promptId,
    familyId,
    isPrimary,
    source: "deterministic" as const,
  }));
}

type ImportCounts = { created: number; updated: number; unchanged: number; flagged: number };

// Imports a school's whole prompt set in a fixed number of round-trips rather
// than five per prompt: one read of everything that already exists, the
// create/update/unchanged decision made in memory, then one transaction that
// bulk-inserts the new prompts and their category links. Against a network
// database the per-prompt version cost ~5 round-trips each, which made a
// 112-prompt demo rebuild take 15 seconds.
//
// The semantics are unchanged and still covered by the persistence tests: an
// identical re-import is a true no-op, and a prompt whose official wording
// changed is updated, recorded in promptChangeLog, and flipped to
// needs-review so a human notices.
async function upsertPrompts(
  db: AppDatabase,
  workspaceId: string,
  schoolId: string,
  cycleId: string,
  rawPrompts: readonly RawPromptRecord[],
  recordDefaults: { status: VerificationStatus; sourceUrl: string | null; platform: ApplicationPlatform; retrievedAt: Date },
  familyIds: Map<string, string>,
) {
  const counts: ImportCounts = { created: 0, updated: 0, unchanged: 0, flagged: 0 };
  const externalRefs = rawPrompts.map((raw) => raw.externalRef);
  const existingRows = externalRefs.length
    ? await db.select().from(prompts)
        .where(and(eq(prompts.schoolId, schoolId), inArray(prompts.externalRef, externalRefs)))
    : [];
  const existingByRef = new Map(existingRows.map((row) => [row.externalRef, row]));

  const newPrompts: (typeof prompts.$inferInsert)[] = [];
  const newLinks: (typeof promptFamilyLinks.$inferInsert)[] = [];
  const changed: { existing: (typeof existingRows)[number]; raw: RawPromptRecord }[] = [];

  for (const raw of rawPrompts) {
    const existing = existingByRef.get(raw.externalRef);

    if (!existing) {
      const promptId = crypto.randomUUID();
      newPrompts.push({
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
        verificationStatus: raw.verificationStatus ?? recordDefaults.status,
        applicationPlatform: recordDefaults.platform,
        sourceUrl: recordDefaults.sourceUrl,
        retrievedAt: recordDefaults.retrievedAt,
      });
      newLinks.push(...familyLinkRows(workspaceId, promptId, `${raw.title} ${raw.promptText}`, familyIds));
      counts.created += 1;
      continue;
    }

    if (!promptContentChanged(existing, raw)) {
      counts.unchanged += 1;
      continue;
    }

    changed.push({ existing, raw });
    counts.updated += 1;
    counts.flagged += 1;
  }

  if (newPrompts.length === 0 && changed.length === 0) return counts;

  await db.transaction(async (tx) => {
    if (newPrompts.length > 0) await tx.insert(prompts).values(newPrompts);
    if (newLinks.length > 0) await tx.insert(promptFamilyLinks).values(newLinks);

    if (changed.length > 0) {
      await tx.insert(promptChangeLog).values(changed.map(({ existing }) => ({
        id: crypto.randomUUID(),
        workspaceId,
        promptId: existing.id,
        previousPromptText: existing.promptText,
        previousMinWordCount: existing.minWordCount,
        previousMaxWordCount: existing.maxWordCount,
      })));
      // Updates stay one statement per prompt: a changed official prompt is
      // rare, so there is nothing to gain from a bulk CASE expression.
      for (const { existing, raw } of changed) {
        await tx.update(prompts).set({
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
        }).where(eq(prompts.id, existing.id));
      }
    }
  });

  return counts;
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
export async function importCollege(db: AppDatabase, workspaceId: string, schoolName: string): Promise<ImportCollegeResult> {
  const currentCycleId = await getOrCreateCycle(db, workspaceId, CURRENT_CYCLE_LABEL);
  const school = await getOrCreateSchool(db, workspaceId, canonicalizeUniversityName(schoolName), currentCycleId);
  const source = lookupSchoolSource(school.name);

  if (!source || source.prompts.length === 0) {
    const note = source?.note ?? "Current prompts not yet verified for this school. Add prompts manually below.";
    // Persisted on the school record (reusing the existing notes column)
    // so a no-supplement-confirmed/needs-review outcome stays visible on
    // later visits, not just as this one-time return value - otherwise a
    // school with zero prompts looks identical whether it's genuinely
    // unresearched or confirmed to have no supplement.
    if (source && !school.notes) {
      await db.update(schools).set({ notes: note }).where(eq(schools.id, school.id));
    }
    return {
      schoolId: school.id,
      schoolName: school.name,
      verificationStatus: source?.verificationStatus ?? "manual",
      sourceUrl: source?.sourceUrl ?? null,
      note,
      counts: { created: 0, updated: 0, unchanged: 0, flagged: 0 },
    };
  }

  // The prompts themselves are filed under whichever cycle the source
  // record actually represents (may differ from the school's own "current"
  // cycle for a previous-cycle record).
  const promptCycleId = await getOrCreateCycle(db, workspaceId, source.cycleLabel);
  const familyIds = await loadFamilyIds(db, workspaceId);
  const counts = await upsertPrompts(db, workspaceId, school.id, promptCycleId, source.prompts, {
    status: source.verificationStatus,
    sourceUrl: source.sourceUrl,
    platform: source.applicationPlatform,
    retrievedAt: new Date(source.retrievedAt),
  }, familyIds);

  return {
    schoolId: school.id,
    schoolName: school.name,
    verificationStatus: source.verificationStatus,
    sourceUrl: source.sourceUrl,
    note: source.note,
    counts,
  };
}
