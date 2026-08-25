import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Postgres: timestamptz rather than SQLite's integer-milliseconds, and a
// server-side now() default rather than unixepoch().
const stamp = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" }).notNull().defaultNow();

// Nullable point-in-time columns the application sets explicitly.
const optionalStamp = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    // Stored lower-cased so uniqueness is case-insensitive without needing a
    // functional index.
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: stamp("created_at"),
    lastSignedInAt: optionalStamp("last_signed_in_at"),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    // Null for the single shared example workspace, which belongs to nobody.
    // Every personal workspace is owned by exactly one user and cascades away
    // with them.
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["personal", "demo"] }).notNull(),
    name: text("name").notNull(),
    createdAt: stamp("created_at"),
    updatedAt: stamp("updated_at"),
  },
  (table) => [
    index("workspaces_user_idx").on(table.userId),
    // One personal workspace per user.
    uniqueIndex("workspaces_user_personal_unique").on(table.userId).where(sql`${table.kind} = 'personal'`),
  ],
);

export const applicationCycles = pgTable(
  "application_cycles",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    startYear: integer("start_year").notNull(),
    endYear: integer("end_year").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: stamp("created_at"),
  },
  (table) => [
    uniqueIndex("cycles_workspace_label_unique").on(table.workspaceId, table.label),
    check("cycles_year_order_check", sql`${table.endYear} >= ${table.startYear}`),
  ],
);

export const schools = pgTable(
  "schools",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    cycleId: text("cycle_id").references(() => applicationCycles.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    notes: text("notes"),
    createdAt: stamp("created_at"),
    updatedAt: stamp("updated_at"),
  },
  (table) => [
    uniqueIndex("schools_workspace_name_unique").on(table.workspaceId, table.name),
    index("schools_workspace_idx").on(table.workspaceId),
  ],
);

export const promptFamilies = pgTable(
  "prompt_families",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    color: text("color").notNull(),
    sortOrder: integer("sort_order").notNull(),
    isEditable: boolean("is_editable").notNull().default(true),
    createdAt: stamp("created_at"),
  },
  (table) => [
    uniqueIndex("families_workspace_name_unique").on(table.workspaceId, table.name),
    uniqueIndex("families_workspace_order_unique").on(table.workspaceId, table.sortOrder),
  ],
);

export const promptTags = pgTable(
  "prompt_tags",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: stamp("created_at"),
  },
  (table) => [uniqueIndex("tags_workspace_name_unique").on(table.workspaceId, table.name)],
);

export const prompts = pgTable(
  "prompts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    schoolId: text("school_id").notNull().references(() => schools.id, { onDelete: "cascade" }),
    cycleId: text("cycle_id").references(() => applicationCycles.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    promptText: text("prompt_text").notNull(),
    minWordCount: integer("min_word_count"),
    maxWordCount: integer("max_word_count"),
    minCharCount: integer("min_char_count"),
    maxCharCount: integer("max_char_count"),
    requirement: text("requirement", { enum: ["required", "optional", "conditional"] }).notNull().default("required"),
    conditionalNote: text("conditional_note"),
    deadline: optionalStamp("deadline"),
    status: text("status", { enum: ["not-started", "in-progress", "complete", "submitted"] }).notNull().default("not-started"),
    classificationConfidence: integer("classification_confidence").notNull().default(0),
    classificationSource: text("classification_source", { enum: ["deterministic", "manual"] }).notNull().default("deterministic"),
    verificationStatus: text("verification_status", { enum: ["officially-verified", "common-app-verified", "previous-cycle", "no-supplement-confirmed", "needs-review", "manual"] }).notNull().default("manual"),
    applicationPlatform: text("application_platform", { enum: ["common-app", "coalition-app", "school-specific", "questbridge", "unknown"] }).notNull().default("unknown"),
    sourceUrl: text("source_url"),
    retrievedAt: optionalStamp("retrieved_at"),
    externalRef: text("external_ref"),
    notes: text("notes"),
    createdAt: stamp("created_at"),
    updatedAt: stamp("updated_at"),
  },
  (table) => [
    index("prompts_workspace_idx").on(table.workspaceId),
    index("prompts_school_idx").on(table.schoolId),
    uniqueIndex("prompts_school_external_ref_unique").on(table.schoolId, table.externalRef).where(sql`${table.externalRef} is not null`),
    check("prompts_word_count_nonnegative_check", sql`coalesce(${table.minWordCount}, 0) >= 0 and coalesce(${table.maxWordCount}, 0) >= 0`),
    check("prompts_word_count_order_check", sql`${table.minWordCount} is null or ${table.maxWordCount} is null or ${table.maxWordCount} >= ${table.minWordCount}`),
    check("prompts_char_count_nonnegative_check", sql`coalesce(${table.minCharCount}, 0) >= 0 and coalesce(${table.maxCharCount}, 0) >= 0`),
    check("prompts_char_count_order_check", sql`${table.minCharCount} is null or ${table.maxCharCount} is null or ${table.maxCharCount} >= ${table.minCharCount}`),
    check("prompts_confidence_range_check", sql`${table.classificationConfidence} between 0 and 100`),
  ],
);

// A record of what a prompt's tracked fields looked like immediately before
// a re-import changed them - written by the import pipeline's change
// detection, never edited in place. Lets "changed prompts are flagged"
// (verificationStatus flips to needs-review) come with an actual diff.
export const promptChangeLog = pgTable(
  "prompt_change_log",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    promptId: text("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
    previousPromptText: text("previous_prompt_text").notNull(),
    previousMinWordCount: integer("previous_min_word_count"),
    previousMaxWordCount: integer("previous_max_word_count"),
    detectedAt: stamp("detected_at"),
  },
  (table) => [index("prompt_change_log_prompt_idx").on(table.promptId)],
);

export const promptFamilyLinks = pgTable(
  "prompt_family_links",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    promptId: text("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
    familyId: text("family_id").notNull().references(() => promptFamilies.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    source: text("source", { enum: ["deterministic", "manual"] }).notNull().default("deterministic"),
  },
  (table) => [
    uniqueIndex("prompt_family_pair_unique").on(table.promptId, table.familyId),
    uniqueIndex("prompt_primary_family_unique").on(table.promptId).where(sql`${table.isPrimary}`),
  ],
);

export const promptTagLinks = pgTable(
  "prompt_tag_links",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    promptId: text("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull().references(() => promptTags.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("prompt_tag_pair_unique").on(table.promptId, table.tagId)],
);

export const essays = pgTable(
  "essays",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    currentContent: text("current_content").notNull().default(""),
    targetWordCount: integer("target_word_count"),
    status: text("status", { enum: ["idea", "outline", "draft", "revising", "ready", "submitted"] }).notNull().default("idea"),
    designation: text("designation", { enum: ["canonical", "school-adaptation"] }).notNull().default("canonical"),
    adaptedFromEssayId: text("adapted_from_essay_id"),
    notes: text("notes"),
    schoolSpecificPhrases: jsonb("school_specific_phrases").$type<string[]>().notNull().default([]),
    lastEditedAt: stamp("last_edited_at"),
    createdAt: stamp("created_at"),
  },
  (table) => [
    index("essays_workspace_idx").on(table.workspaceId),
    check("essays_target_words_nonnegative_check", sql`${table.targetWordCount} is null or ${table.targetWordCount} >= 0`),
    foreignKey({ columns: [table.adaptedFromEssayId], foreignColumns: [table.id], name: "essays_adapted_from_fk" }).onDelete("set null"),
  ],
);

export const essayVersions = pgTable(
  "essay_versions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    essayId: text("essay_id").notNull().references(() => essays.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    content: text("content").notNull(),
    wordCount: integer("word_count").notNull(),
    reason: text("reason"),
    createdAt: stamp("created_at"),
  },
  (table) => [
    uniqueIndex("essay_version_number_unique").on(table.essayId, table.versionNumber),
    check("essay_version_positive_check", sql`${table.versionNumber} > 0`),
    check("essay_version_words_nonnegative_check", sql`${table.wordCount} >= 0`),
  ],
);

export const essayFamilyLinks = pgTable(
  "essay_family_links",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    essayId: text("essay_id").notNull().references(() => essays.id, { onDelete: "cascade" }),
    familyId: text("family_id").notNull().references(() => promptFamilies.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    source: text("source", { enum: ["deterministic", "manual"] }).notNull().default("deterministic"),
  },
  (table) => [
    uniqueIndex("essay_family_pair_unique").on(table.essayId, table.familyId),
    uniqueIndex("essay_primary_family_unique").on(table.essayId).where(sql`${table.isPrimary}`),
  ],
);

export const essayTagLinks = pgTable(
  "essay_tag_links",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    essayId: text("essay_id").notNull().references(() => essays.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull().references(() => promptTags.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("essay_tag_pair_unique").on(table.essayId, table.tagId)],
);

export const essayPromptMatches = pgTable(
  "essay_prompt_matches",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    essayId: text("essay_id").notNull().references(() => essays.id, { onDelete: "cascade" }),
    promptId: text("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    matchedThemes: jsonb("matched_themes").$type<string[]>().notNull().default([]),
    missingRequirements: jsonb("missing_requirements").$type<string[]>().notNull().default([]),
    wordCountDifference: integer("word_count_difference").notNull().default(0),
    schoolSpecificityRisk: text("school_specificity_risk", { enum: ["low", "medium", "high"] }).notNull().default("low"),
    recommendedAction: text("recommended_action", { enum: ["ready-to-reuse", "minor-adaptation", "major-adaptation", "new-response"] }).notNull(),
    explanation: text("explanation").notNull(),
    calculatedAt: stamp("calculated_at"),
  },
  (table) => [
    uniqueIndex("essay_prompt_match_unique").on(table.essayId, table.promptId),
    check("essay_prompt_score_range_check", sql`${table.score} between 0 and 100`),
  ],
);

export const assignedEssayResponses = pgTable(
  "assigned_essay_responses",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    promptId: text("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
    essayId: text("essay_id").notNull().references(() => essays.id, { onDelete: "cascade" }),
    essayVersionId: text("essay_version_id").references(() => essayVersions.id, { onDelete: "set null" }),
    assignedAt: stamp("assigned_at"),
  },
  (table) => [
    uniqueIndex("assigned_response_prompt_unique").on(table.promptId),
    index("assigned_response_essay_idx").on(table.essayId),
  ],
);

export const schema = {
  users,
  workspaces,
  applicationCycles,
  schools,
  promptFamilies,
  promptTags,
  prompts,
  promptChangeLog,
  promptFamilyLinks,
  promptTagLinks,
  essays,
  essayVersions,
  essayFamilyLinks,
  essayTagLinks,
  essayPromptMatches,
  assignedEssayResponses,
};
