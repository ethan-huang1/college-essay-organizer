import type { SchoolSourceRecord } from "../types";

// Carleton exposes its complete current institutional supplement as a public
// official form. It is explicitly labeled 2026-27, asks whether the applicant
// intends to enroll in fall 2027, and contains only biographical, testing,
// family, and discovery-source fields -- no supplemental writing prompt.
export const carleton: SchoolSourceRecord = {
  schoolName: "Carleton College",
  cycleLabel: "2026–27",
  verificationStatus: "no-supplement-confirmed",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.admissions.carleton.edu/register/supplement",
  retrievedAt: "2026-08-24",
  note: "Official Carleton form titled 'Carleton Supplement 2026-27' for applicants intending to enroll in fall 2027. The complete public supplement contains biographical, test-choice, family, and how-you-heard-about-Carleton questions, but no school-specific essay or short-answer prompt. The separate Taste of Carleton fly-in application has essays, but those are program-application questions and are not part of first-year admission.",
  prompts: [],
};
