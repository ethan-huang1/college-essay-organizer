import type { SchoolSourceRecord } from "../types";

// UGA's admissions office explicitly announced the removal of its school-
// specific supplement for the fall 2027 application. Applicants retain only
// the shared Common Application personal essay.
export const universityOfGeorgia: SchoolSourceRecord = {
  schoolName: "University of Georgia",
  cycleLabel: "2026–27",
  verificationStatus: "no-supplement-confirmed",
  applicationPlatform: "common-app",
  sourceUrl: "https://admissions.uga.edu/blog/changes-for-the-2027-freshman-application/",
  retrievedAt: "2026-08-24",
  note: "Official UGA Admissions announcement dated July 22, 2026 for the Fall 2027 freshman application. UGA explicitly removed its supplemental essay question and retains only the longer shared Common Application personal essay, so there is no UGA-specific supplemental writing prompt to import for 2026–27.",
  prompts: [],
};
