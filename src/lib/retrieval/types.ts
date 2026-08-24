// Shared types for the prompt-retrieval pipeline. Every school's data is a
// SchoolSourceRecord conforming to this shape - see sources/README for the
// research method - so the import pipeline (normalize.ts, registry.ts,
// ../college-import.ts) can process any school identically instead of
// special-casing each one.

export type VerificationStatus = "officially-verified" | "common-app-verified" | "previous-cycle" | "needs-review" | "manual";
export type ApplicationPlatform = "common-app" | "coalition-app" | "school-specific" | "questbridge" | "unknown";
export type RequirementType = "required" | "optional" | "conditional";

export type RawPromptRecord = {
  // Stable within a school across re-imports (e.g. "short-essay-roommate")
  // - the dedup/change-detection key. Never derived from title/text, which
  // can be reworded without the prompt being a genuinely new question.
  externalRef: string;
  title: string;
  promptText: string;
  minWordCount?: number | null;
  maxWordCount?: number | null;
  minCharCount?: number | null;
  maxCharCount?: number | null;
  requirement: RequirementType;
  // Required when requirement is "conditional" (e.g. "Only applicants to
  // the School of Nursing & Health Studies answer this question.").
  conditionalNote?: string | null;
  // Overrides the school record's verificationStatus for this one prompt -
  // confidence isn't always uniform across a school's questions (e.g. a
  // school's core essays might be verbatim-confirmed while a set of
  // program-specific variants were only summarized, not quoted exactly).
  // Omit to inherit the record's status.
  verificationStatus?: VerificationStatus;
};

export type SchoolSourceRecord = {
  // Must exactly match an entry in ../top-universities.ts (or be a school a
  // user can still add manually - the registry doesn't require list
  // membership, but canonicalizeUniversityName() only resolves listed names).
  schoolName: string;
  cycleLabel: string;
  verificationStatus: VerificationStatus;
  applicationPlatform: ApplicationPlatform;
  sourceUrl: string | null;
  // ISO date the research was actually done - fixed at research time, never
  // "now" at import time.
  retrievedAt: string;
  // Human-readable justification for the verificationStatus - always shown
  // to the user, especially important when prompts is empty.
  note: string;
  // Empty when verificationStatus doesn't warrant import (previous-cycle,
  // or nothing confidently found) - see normalize.ts's validateRecord for
  // the enforced invariant.
  prompts: RawPromptRecord[];
};
