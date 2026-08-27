import { and, eq, inArray } from "drizzle-orm";

import { classifyText } from "./classification";
import { CURRENT_CYCLE_LABEL } from "./cycle";
import type { AppDatabase } from "./db/client";
import { applicationCycles, assignedEssayResponses, promptChangeLog, promptFamilies, promptFamilyLinks, promptTagLinks, promptTags, prompts, schools } from "./db/schema";
import { categoryReview } from "./retrieval/category-review";
import { promptContentChanged } from "./retrieval/normalize";
import { lookupSchoolSource } from "./retrieval/registry";
import type { ApplicationPlatform, PromptGroup, RawPromptRecord, SchoolSourceRecord, VerificationStatus } from "./retrieval/types";
import type { CatalogueStatus } from "./schools";
import { canonicalizeUniversityName } from "./top-universities";

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

// The categories are read once per import and passed down, rather than
// re-queried for every category of every prompt. On a network database that is
// the difference between one round-trip and several hundred.
//
// Keyed by slug, not display name: names are user-editable, so a renamed
// category used to stop matching the classifier's output entirely and every
// prompt in that category imported unclassified.
async function loadFamilyIds(db: Pick<AppDatabase, "select">, workspaceId: string) {
  const rows = await db.select({ id: promptFamilies.id, slug: promptFamilies.slug })
    .from(promptFamilies)
    .where(eq(promptFamilies.workspaceId, workspaceId));
  return new Map(rows.map((row) => [row.slug, row.id]));
}

/**
 * Turns a prompt into its category links, its internal tags, and a confidence.
 *
 * Two tiers, both offline. Nothing here calls a model or a network.
 *
 * 1. The catalogue review (../retrieval/category-review.ts) - a hand-assigned
 *    primary, secondary themes, and prompt function for all 255 committed
 *    prompts. This is the source of truth, not a hint: it *replaces* the
 *    keyword rules for those prompts rather than nudging them. 255 hand
 *    judgements beat any set of regex patterns, and the rules were measurably
 *    wrong on some of them - MIT's "field of study that appeals to you"
 *    classified as Why Us because "appeals to you" fired first.
 * 2. The keyword rules, for prompts a student adds that are not in the
 *    catalogue. Then `other` if nothing matched.
 *
 * `Other` at confidence 0 is deliberately distinct from `Other` at a real
 * confidence: the first means "nothing recognised this", which is what the
 * needs-review surface is built on, and the second means the prompt genuinely
 * belongs in Other. Other is a real category either way, never a to-do list.
 */
function classifyPrompt(
  schoolName: string,
  raw: RawPromptRecord,
): { primarySlug: string; secondarySlugs: string[]; tags: string[]; confidence: number } {
  const reviewed = categoryReview(schoolName, raw.externalRef);
  if (reviewed) {
    const [, , primarySlug, secondaryFamilySlugs, secondaryTags] = reviewed;
    // Reviewed by a person, so full confidence. The tags come from the review
    // too rather than from classifyText: a reviewer's secondary themes are the
    // whole point, and mixing in keyword-derived ones would put signal the
    // review deliberately left out back into matching.
    return { primarySlug, secondarySlugs: secondaryFamilySlugs, tags: secondaryTags, confidence: 100 };
  }
  const classification = classifyText(`${raw.title} ${raw.promptText}`);
  return {
    primarySlug: classification.primarySlug ?? "other",
    secondarySlugs: classification.secondarySlugs,
    tags: classification.tags,
    confidence: classification.confidence,
  };
}

// Pure: turns a classification into the category-link rows it should get. No
// database access, so a whole school's links can be built in memory and
// inserted in one statement.
function familyLinkRows(
  workspaceId: string,
  promptId: string,
  classification: { primarySlug: string; secondarySlugs: string[] },
  familyIds: Map<string, string>,
) {
  const familyIdFor = (slug: string) => familyIds.get(slug) ?? null;
  const primaryFamilyId = familyIdFor(classification.primarySlug);
  const secondaryFamilyIds = classification.secondarySlugs
    .map(familyIdFor)
    .filter((id): id is string => Boolean(id));
  const assignments = [
    ...(primaryFamilyId ? [{ familyId: primaryFamilyId, isPrimary: true }] : []),
    ...secondaryFamilyIds.filter((id) => id !== primaryFamilyId).map((familyId) => ({ familyId, isPrimary: false })),
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

// Secondary themes, as internal matching signal. Nothing in the UI shows these.
//
// Two vocabularies arrive here: the review's tag names, which are already the
// seeded display names, and the classifier's slugs for off-catalogue prompts.
// TAG_DISPLAY_NAMES translates the latter; a name that is already a seeded tag
// passes through unchanged.
function tagLinkRows(workspaceId: string, promptId: string, tags: readonly string[], tagIds: Map<string, string>) {
  return tags
    .map((tag) => tagIds.get(TAG_DISPLAY_NAMES[tag] ?? tag))
    .filter((tagId): tagId is string => Boolean(tagId))
    .map((tagId) => ({ id: crypto.randomUUID(), workspaceId, promptId, tagId }));
}

// The tag rows seeded in taxonomy.ts use display names; the classifier emits
// slugs.
const TAG_DISPLAY_NAMES: Record<string, string> = {
  "intellectual-curiosity": "intellectual curiosity",
  "activities-impact": "activities & impact",
  "values-meaning": "values & meaning",
};

async function loadTagIds(db: Pick<AppDatabase, "select">, workspaceId: string) {
  const rows = await db.select({ id: promptTags.id, name: promptTags.name })
    .from(promptTags)
    .where(eq(promptTags.workspaceId, workspaceId));
  return new Map(rows.map((row) => [row.name, row.id]));
}

type ImportCounts = { created: number; updated: number; unchanged: number; flagged: number };

/**
 * Copies existing canonical siblings' response state onto rows about to be
 * created, mutating their `status` in place and returning the assignment rows
 * to insert alongside them.
 *
 * This is the counterpart to the write-time fan-out in canonical.ts: that keeps
 * existing siblings in step with each other, and this brings a newly imported
 * one up to date on arrival. Together they hold the invariant that every prompt
 * sharing a canonicalKey has the same status and assignment, which is what lets
 * every read path pick any instance.
 */
async function inheritCanonicalState(
  db: AppDatabase,
  workspaceId: string,
  newPrompts: (typeof prompts.$inferInsert)[],
) {
  const canonicalKeys = [...new Set(newPrompts.map((row) => row.canonicalKey).filter((key): key is string => Boolean(key)))];
  if (canonicalKeys.length === 0) return [];

  const siblings = await db.select({ id: prompts.id, canonicalKey: prompts.canonicalKey, status: prompts.status })
    .from(prompts)
    .where(and(eq(prompts.workspaceId, workspaceId), inArray(prompts.canonicalKey, canonicalKeys)));
  if (siblings.length === 0) return [];

  const assignments = await db.select().from(assignedEssayResponses)
    .where(inArray(assignedEssayResponses.promptId, siblings.map((sibling) => sibling.id)));

  const stateByKey = new Map<string, { status: (typeof siblings)[number]["status"]; essayId: string | null }>();
  for (const sibling of siblings) {
    if (!sibling.canonicalKey || stateByKey.has(sibling.canonicalKey)) continue;
    stateByKey.set(sibling.canonicalKey, {
      status: sibling.status,
      essayId: assignments.find((assignment) => assignment.promptId === sibling.id)?.essayId ?? null,
    });
  }

  const inheritedAssignments: (typeof assignedEssayResponses.$inferInsert)[] = [];
  for (const row of newPrompts) {
    const state = row.canonicalKey ? stateByKey.get(row.canonicalKey) : undefined;
    if (!state) continue;
    row.status = state.status;
    if (state.essayId) {
      inheritedAssignments.push({
        id: crypto.randomUUID(),
        workspaceId,
        promptId: row.id,
        essayId: state.essayId,
        assignedAt: new Date(),
      });
    }
  }
  return inheritedAssignments;
}

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
  schoolName: string,
  rawPrompts: readonly RawPromptRecord[],
  recordDefaults: {
    status: VerificationStatus;
    sourceUrl: string | null;
    platform: ApplicationPlatform;
    retrievedAt: Date;
    sharedApplicationKey?: string;
    promptGroups?: readonly PromptGroup[];
  },
  familyIds: Map<string, string>,
  tagIds: Map<string, string>,
) {
  const counts: ImportCounts = { created: 0, updated: 0, unchanged: 0, flagged: 0 };
  const externalRefs = rawPrompts.map((raw) => raw.externalRef);
  const existingRows = externalRefs.length
    ? await db.select().from(prompts)
        .where(and(eq(prompts.schoolId, schoolId), inArray(prompts.externalRef, externalRefs)))
    : [];
  const existingByRef = new Map(existingRows.map((row) => [row.externalRef, row]));

  const { sharedApplicationKey } = recordDefaults;
  const groupByKey = new Map((recordDefaults.promptGroups ?? []).map((group) => [group.key, group]));
  const groupOf = (raw: RawPromptRecord) => (raw.groupKey ? groupByKey.get(raw.groupKey) : undefined);
  const canonicalKeyOf = (raw: RawPromptRecord) =>
    sharedApplicationKey ? `${sharedApplicationKey}:${raw.externalRef}` : null;

  const newPrompts: (typeof prompts.$inferInsert)[] = [];
  const newLinks: (typeof promptFamilyLinks.$inferInsert)[] = [];
  const newTagLinks: (typeof promptTagLinks.$inferInsert)[] = [];
  const changed: { existing: (typeof existingRows)[number]; raw: RawPromptRecord }[] = [];

  for (const raw of rawPrompts) {
    const existing = existingByRef.get(raw.externalRef);
    const group = groupOf(raw);

    if (!existing) {
      const promptId = crypto.randomUUID();
      const classification = classifyPrompt(schoolName, raw);
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
        sharedApplicationKey: sharedApplicationKey ?? null,
        canonicalKey: canonicalKeyOf(raw),
        groupKey: raw.groupKey ?? null,
        groupLabel: group?.label ?? null,
        groupRequiredCount: group?.requiredCount ?? null,
        programKey: raw.programKey ?? null,
        programLabel: raw.programLabel ?? null,
        classificationSource: "deterministic",
        // Previously computed and discarded, so every imported prompt sat at 0
        // and there was no way to tell a confident classification from a
        // guess. This is what the needs-review surface reads.
        classificationConfidence: classification.confidence,
        verificationStatus: raw.verificationStatus ?? recordDefaults.status,
        applicationPlatform: recordDefaults.platform,
        sourceUrl: recordDefaults.sourceUrl,
        retrievedAt: recordDefaults.retrievedAt,
      });
      newLinks.push(...familyLinkRows(workspaceId, promptId, classification, familyIds));
      newTagLinks.push(...tagLinkRows(workspaceId, promptId, classification.tags, tagIds));
      counts.created += 1;
      continue;
    }

    if (!promptContentChanged(existing, raw, group?.requiredCount ?? null)) {
      counts.unchanged += 1;
      continue;
    }

    changed.push({ existing, raw });
    counts.updated += 1;
    counts.flagged += 1;
  }

  // Adding a campus to a shared application later must not lose the work
  // already done on its questions: a new row inherits whatever its existing
  // siblings hold, so importing UC Davis after answering UCLA's PIQ 1 shows it
  // as answered immediately rather than reopening settled work.
  const inherited = await inheritCanonicalState(db, workspaceId, newPrompts);

  if (newPrompts.length === 0 && changed.length === 0) return counts;

  await db.transaction(async (tx) => {
    if (newPrompts.length > 0) await tx.insert(prompts).values(newPrompts);
    if (newLinks.length > 0) await tx.insert(promptFamilyLinks).values(newLinks);
    if (newTagLinks.length > 0) await tx.insert(promptTagLinks).values(newTagLinks);
    if (inherited.length > 0) await tx.insert(assignedEssayResponses).values(inherited);

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
        const group = groupOf(raw);
        await tx.update(prompts).set({
          title: raw.title,
          promptText: raw.promptText,
          minWordCount: raw.minWordCount ?? null,
          maxWordCount: raw.maxWordCount ?? null,
          minCharCount: raw.minCharCount ?? null,
          maxCharCount: raw.maxCharCount ?? null,
          requirement: raw.requirement,
          conditionalNote: raw.conditionalNote ?? null,
          // Re-import is how newly encoded group and program metadata reaches a
          // workspace that already holds the row.
          sharedApplicationKey: sharedApplicationKey ?? null,
          canonicalKey: canonicalKeyOf(raw),
          groupKey: raw.groupKey ?? null,
          groupLabel: group?.label ?? null,
          groupRequiredCount: group?.requiredCount ?? null,
          programKey: raw.programKey ?? null,
          programLabel: raw.programLabel ?? null,
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
// The registry record's own verification outcome, mapped to the school-level
// state the UI shows. A school typed in by hand has no record at all, which is
// exactly what "manual" means.
function catalogueStatusFor(source: SchoolSourceRecord | null): CatalogueStatus {
  if (!source) return "manual";
  if (source.prompts.length === 0) {
    return source.verificationStatus === "no-supplement-confirmed" ? "no-supplement" : "not-published";
  }
  return source.verificationStatus === "previous-cycle" ? "previous-cycle" : "current";
}

export async function importCollege(db: AppDatabase, workspaceId: string, schoolName: string): Promise<ImportCollegeResult> {
  const currentCycleId = await getOrCreateCycle(db, workspaceId, CURRENT_CYCLE_LABEL);
  const school = await getOrCreateSchool(db, workspaceId, canonicalizeUniversityName(schoolName), currentCycleId);
  const source = lookupSchoolSource(school.name);

  if (!source || source.prompts.length === 0) {
    const note = source?.note ?? "Current prompts not yet verified for this school. Add prompts manually below.";
    // catalogueStatus is the structured reason this school has no prompts, so
    // the UI never has to guess (or parse `notes`) whether a zero-prompt
    // college is confirmed supplement-free or merely unresearched. It is
    // rewritten on every import so a re-import converges; `notes` stays the
    // human-readable justification and is still only written once.
    await db.update(schools).set({
      catalogueStatus: catalogueStatusFor(source),
      ...(source && !school.notes ? { notes: note } : {}),
    }).where(eq(schools.id, school.id));
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
  // Almost every record is current-cycle, and that row was just created or
  // found above - so re-resolving it costs a round-trip per school for nothing.
  const promptCycleId = source.cycleLabel === CURRENT_CYCLE_LABEL
    ? currentCycleId
    : await getOrCreateCycle(db, workspaceId, source.cycleLabel);
  const [familyIds, tagIds] = await Promise.all([loadFamilyIds(db, workspaceId), loadTagIds(db, workspaceId)]);
  const counts = await upsertPrompts(db, workspaceId, school.id, promptCycleId, school.name, source.prompts, {
    status: source.verificationStatus,
    sourceUrl: source.sourceUrl,
    platform: source.applicationPlatform,
    retrievedAt: new Date(source.retrievedAt),
    sharedApplicationKey: source.sharedApplicationKey,
    promptGroups: source.promptGroups,
  }, familyIds, tagIds);
  await db.update(schools).set({ catalogueStatus: catalogueStatusFor(source) }).where(eq(schools.id, school.id));

  return {
    schoolId: school.id,
    schoolName: school.name,
    verificationStatus: source.verificationStatus,
    sourceUrl: source.sourceUrl,
    note: source.note,
    counts,
  };
}
