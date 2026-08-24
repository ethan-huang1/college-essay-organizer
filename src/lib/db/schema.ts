import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) =>
  integer(name, { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["personal", "demo"] }).notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const applicationCycles = sqliteTable(
  "application_cycles",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    startYear: integer("start_year").notNull(),
    endYear: integer("end_year").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("cycles_workspace_label_unique").on(table.workspaceId, table.label),
    check("cycles_year_order_check", sql`${table.endYear} >= ${table.startYear}`),
  ],
);

export const schools = sqliteTable(
  "schools",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    cycleId: text("cycle_id").references(() => applicationCycles.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("schools_workspace_name_unique").on(table.workspaceId, table.name),
    index("schools_workspace_idx").on(table.workspaceId),
  ],
);

export const promptFamilies = sqliteTable(
  "prompt_families",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    color: text("color").notNull(),
    sortOrder: integer("sort_order").notNull(),
    isEditable: integer("is_editable", { mode: "boolean" }).notNull().default(true),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("families_workspace_name_unique").on(table.workspaceId, table.name),
    uniqueIndex("families_workspace_order_unique").on(table.workspaceId, table.sortOrder),
  ],
);

export const promptTags = sqliteTable(
  "prompt_tags",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [uniqueIndex("tags_workspace_name_unique").on(table.workspaceId, table.name)],
);

export const prompts = sqliteTable(
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
    requirement: text("requirement", { enum: ["required", "optional"] }).notNull().default("required"),
    deadline: integer("deadline", { mode: "timestamp_ms" }),
    status: text("status", { enum: ["not-started", "in-progress", "complete", "submitted"] }).notNull().default("not-started"),
    classificationConfidence: integer("classification_confidence").notNull().default(0),
    classificationSource: text("classification_source", { enum: ["deterministic", "manual"] }).notNull().default("deterministic"),
    verificationStatus: text("verification_status", { enum: ["verified-2026-27", "likely-current-unverified", "previous-cycle", "manual"] }).notNull().default("manual"),
    sourceUrl: text("source_url"),
    retrievedAt: integer("retrieved_at", { mode: "timestamp_ms" }),
    notes: text("notes"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("prompts_workspace_idx").on(table.workspaceId),
    index("prompts_school_idx").on(table.schoolId),
    check("prompts_word_count_nonnegative_check", sql`coalesce(${table.minWordCount}, 0) >= 0 and coalesce(${table.maxWordCount}, 0) >= 0`),
    check("prompts_word_count_order_check", sql`${table.minWordCount} is null or ${table.maxWordCount} is null or ${table.maxWordCount} >= ${table.minWordCount}`),
    check("prompts_confidence_range_check", sql`${table.classificationConfidence} between 0 and 100`),
  ],
);

export const promptFamilyLinks = sqliteTable(
  "prompt_family_links",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    promptId: text("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
    familyId: text("family_id").notNull().references(() => promptFamilies.id, { onDelete: "cascade" }),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    source: text("source", { enum: ["deterministic", "manual"] }).notNull().default("deterministic"),
  },
  (table) => [
    uniqueIndex("prompt_family_pair_unique").on(table.promptId, table.familyId),
    uniqueIndex("prompt_primary_family_unique").on(table.promptId).where(sql`${table.isPrimary} = 1`),
  ],
);

export const promptTagLinks = sqliteTable(
  "prompt_tag_links",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    promptId: text("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull().references(() => promptTags.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("prompt_tag_pair_unique").on(table.promptId, table.tagId)],
);

export const essays = sqliteTable(
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
    schoolSpecificPhrases: text("school_specific_phrases", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    lastEditedAt: timestamp("last_edited_at"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("essays_workspace_idx").on(table.workspaceId),
    check("essays_target_words_nonnegative_check", sql`${table.targetWordCount} is null or ${table.targetWordCount} >= 0`),
    foreignKey({ columns: [table.adaptedFromEssayId], foreignColumns: [table.id], name: "essays_adapted_from_fk" }).onDelete("set null"),
  ],
);

export const essayVersions = sqliteTable(
  "essay_versions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    essayId: text("essay_id").notNull().references(() => essays.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    content: text("content").notNull(),
    wordCount: integer("word_count").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("essay_version_number_unique").on(table.essayId, table.versionNumber),
    check("essay_version_positive_check", sql`${table.versionNumber} > 0`),
    check("essay_version_words_nonnegative_check", sql`${table.wordCount} >= 0`),
  ],
);

export const essayFamilyLinks = sqliteTable(
  "essay_family_links",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    essayId: text("essay_id").notNull().references(() => essays.id, { onDelete: "cascade" }),
    familyId: text("family_id").notNull().references(() => promptFamilies.id, { onDelete: "cascade" }),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    source: text("source", { enum: ["deterministic", "manual"] }).notNull().default("deterministic"),
  },
  (table) => [
    uniqueIndex("essay_family_pair_unique").on(table.essayId, table.familyId),
    uniqueIndex("essay_primary_family_unique").on(table.essayId).where(sql`${table.isPrimary} = 1`),
  ],
);

export const essayTagLinks = sqliteTable(
  "essay_tag_links",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    essayId: text("essay_id").notNull().references(() => essays.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull().references(() => promptTags.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("essay_tag_pair_unique").on(table.essayId, table.tagId)],
);

export const essayPromptMatches = sqliteTable(
  "essay_prompt_matches",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    essayId: text("essay_id").notNull().references(() => essays.id, { onDelete: "cascade" }),
    promptId: text("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    matchedThemes: text("matched_themes", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    missingRequirements: text("missing_requirements", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    wordCountDifference: integer("word_count_difference").notNull().default(0),
    schoolSpecificityRisk: text("school_specificity_risk", { enum: ["low", "medium", "high"] }).notNull().default("low"),
    recommendedAction: text("recommended_action", { enum: ["ready-to-reuse", "minor-adaptation", "major-adaptation", "new-response"] }).notNull(),
    explanation: text("explanation").notNull(),
    calculatedAt: timestamp("calculated_at"),
  },
  (table) => [
    uniqueIndex("essay_prompt_match_unique").on(table.essayId, table.promptId),
    check("essay_prompt_score_range_check", sql`${table.score} between 0 and 100`),
  ],
);

export const assignedEssayResponses = sqliteTable(
  "assigned_essay_responses",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    promptId: text("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
    essayId: text("essay_id").notNull().references(() => essays.id, { onDelete: "cascade" }),
    essayVersionId: text("essay_version_id").references(() => essayVersions.id, { onDelete: "set null" }),
    assignedAt: timestamp("assigned_at"),
  },
  (table) => [
    uniqueIndex("assigned_response_prompt_unique").on(table.promptId),
    index("assigned_response_essay_idx").on(table.essayId),
  ],
);

export const schema = {
  workspaces,
  applicationCycles,
  schools,
  promptFamilies,
  promptTags,
  prompts,
  promptFamilyLinks,
  promptTagLinks,
  essays,
  essayVersions,
  essayFamilyLinks,
  essayTagLinks,
  essayPromptMatches,
  assignedEssayResponses,
};
