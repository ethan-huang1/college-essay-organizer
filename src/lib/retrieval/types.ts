// Shared types for the prompt-retrieval pipeline. Every school's data is a
// SchoolSourceRecord conforming to this shape - see sources/README for the
// research method - so the import pipeline (normalize.ts, registry.ts,
// ../college-import.ts) can process any school identically instead of
// special-casing each one.

export type VerificationStatus = "officially-verified" | "common-app-verified" | "previous-cycle" | "no-supplement-confirmed" | "needs-review" | "manual";
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
  // Requirements the schema has no column for: "two pages", "13 words per
  // stem", "one of three named songs". Stored as the prompt's note rather than
  // guessed at in words - a page count converted to a word count is a number
  // the student would then write to, and it would be invented.
  note?: string;
  /**
   * Set when this record is a **supporting-material requirement rather than an
   * essay prompt**, to a short phrase saying which kind.
   *
   * Princeton asks every applicant for a graded written paper; Williams and
   * UIUC want a writing sample; a dozen art and music programmes want a caption
   * on each portfolio item. Those are real application requirements with real
   * deadlines and a student has to see them - but the deliverable is an
   * existing artefact, metadata attached to one, or an administrative upload,
   * not prose composed for this application. Nothing about them belongs in an
   * essay library.
   *
   * The test is whether the student **composes original application prose that
   * could be reused elsewhere**. It keeps in some things that look like
   * exclusions: "list five books that intrigued you" is a real answer the
   * student writes, and FSU's screenwriting scenarios are original creative
   * work. It excludes some things that call themselves essays: UCI's "submit a
   * short essay that analyses a dramatic text" explicitly accepts one the
   * student has already written for school.
   *
   * Consequences, all of them because this is not an essay rather than because
   * of anything about scoring: excluded from reuse matching and from
   * recommendations, from essay-completion counts and progress totals, from the
   * category explorer, from the committed prompt vectors, and from the
   * classification worksheet. It is still imported, still tracked, still
   * deadlined, and shown in its own section of the school's requirements.
   */
  supportingMaterial?: string;
  // Ties this prompt into an "answer any N of these" set declared in the
  // school record's promptGroups. Without it every prompt in the set counts as
  // separate work, which is why seven UC campuses read as 56 essays.
  groupKey?: string;
  // The program that makes a conditional prompt actually apply, e.g.
  // "wharton". A conditional prompt without one cannot be resolved for or
  // against a given student, so the app has to show it as unresolved rather
  // than guess - see summarizeWorkload.
  programKey?: string;
  programLabel?: string;
};

// "Answer any 4 of these 8." requiredCount is what the school actually asks
// for; the set size is however many prompts carry the matching groupKey.
export type PromptGroup = {
  key: string;
  label: string;
  requiredCount: number;
};

export type SchoolSourceRecord = {
  // Must exactly match an entry in ../top-universities.ts (or be a school a
  // user can still add manually - the registry doesn't require list
  // membership, but canonicalizeUniversityName() only resolves listed names).
  schoolName: string;
  // The cycle THIS DATA represents - "2026–27" for officially-verified,
  // "2025–26" for previous-cycle (never left as the current label just
  // because that's what we're tracking; must match what was actually
  // confirmed). Ignored (but still required) for no-supplement-confirmed/
  // needs-review, where there's no prompt content to date.
  cycleLabel: string;
  verificationStatus: VerificationStatus;
  applicationPlatform: ApplicationPlatform;
  sourceUrl: string | null;
  // ISO date the research was actually done - fixed at research time, never
  // "now" at import time.
  retrievedAt: string;
  // Human-readable justification for the verificationStatus - always shown
  // to the user, especially important when prompts is empty. For
  // needs-review this must explain what was actually checked (which
  // sources, why neither current nor previous wording could be confirmed) -
  // never a placeholder.
  note: string;
  // officially-verified and previous-cycle require at least one prompt
  // (previous-cycle prompts ARE imported now, distinctly labeled - see
  // MVP policy). no-supplement-confirmed and needs-review must be empty -
  // see normalize.ts's validateRecord for the enforced invariant.
  prompts: RawPromptRecord[];
  // Set when several schools ask the identical question through one shared
  // application - the UC system's seven campuses share eight Personal Insight
  // Questions. Prompts matching on (sharedApplicationKey, externalRef) are one
  // question, so the app renders them once and keeps their response state
  // identical. Records sharing a key must agree about the question; see
  // validateCanonicalAgreement, which fails the build if they do not.
  sharedApplicationKey?: string;
  promptGroups?: PromptGroup[];
};
