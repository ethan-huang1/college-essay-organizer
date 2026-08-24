import type { SchoolSourceRecord } from "../types";

// Minnesota explicitly says an essay is not required for Fall 2027, but its
// current official pages also refer to optional short-answer questions and
// required Nursing supplemental questions without exposing their wording.
export const universityOfMinnesotaTwinCities: SchoolSourceRecord = {
  schoolName: "University of Minnesota Twin Cities",
  cycleLabel: "2026–27",
  verificationStatus: "needs-review",
  applicationPlatform: "common-app",
  sourceUrl: "https://admissions.tc.umn.edu/apply/application-checklist/application-checklist-freshman",
  retrievedAt: "2026-08-24",
  note: "Checked the official Fall 2027 freshman checklist (cited), which explicitly says an essay is not required; the official ACT/SAT page at https://admissions.tc.umn.edu/admissions/freshman-admission/act-sat-information, which still encourages optional personal responses to short-answer questions; and the official Nursing page at https://nursing.umn.edu/academics/bachelor-science-nursing/freshman-admissions, which requires Nursing supplemental questions available in Common App. Those current question texts are not published on the official public pages, so the complete 2026–27 wording cannot be confirmed and no prompts are imported.",
  prompts: [],
};
