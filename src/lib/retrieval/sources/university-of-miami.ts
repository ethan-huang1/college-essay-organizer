import type { SchoolSourceRecord } from "../types";

// The official 2026-2027 Bulletin exhaustively lists first-year application
// requirements and requires Common App, transcripts, a school report, and a
// recommendation, but no Miami-specific essay or writing supplement.
export const universityOfMiami: SchoolSourceRecord = {
  schoolName: "University of Miami",
  cycleLabel: "2026–27",
  verificationStatus: "no-supplement-confirmed",
  applicationPlatform: "common-app",
  sourceUrl: "https://bulletin.miami.edu/general-university-information/undergraduate-policies-and-procedures/admission/freshman-admission/",
  retrievedAt: "2026-08-24",
  note: "The official University of Miami 2026–2027 Bulletin's First-Year Admission section lists the complete application requirements and school-specific audition/portfolio exceptions. It requires submission through Common App but lists no Miami-specific supplemental essay or short-answer response. The general Common App personal statement is not a Miami supplement.",
  prompts: [],
};
