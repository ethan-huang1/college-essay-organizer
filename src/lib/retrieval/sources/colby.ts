import type { SchoolSourceRecord } from "../types";

// Colby's current official first-year requirements page enumerates every
// required and optional application material. It requires only a completed
// Common, Coalition, or QuestBridge application and does not list a Colby-
// specific writing supplement among either category.
export const colby: SchoolSourceRecord = {
  schoolName: "Colby College",
  cycleLabel: "2026–27",
  verificationStatus: "no-supplement-confirmed",
  applicationPlatform: "common-app",
  sourceUrl: "https://afa.colby.edu/apply/requirements/",
  retrievedAt: "2026-08-24",
  note: "Official Colby Admissions requirements page for first-year applicants. Its complete required- and optional-materials lists require a completed Common Application, Coalition Application, or QuestBridge Application but identify no Colby-specific essay or short-answer supplement. The platform's general application essay is not a Colby supplemental prompt.",
  prompts: [],
};
