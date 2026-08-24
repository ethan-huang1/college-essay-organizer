import type { SchoolSourceRecord } from "../types";

// Northeastern's public checklist refers to application essays and
// Northeastern-specific questions but neither labels the cycle nor publishes
// the exact current writing requirements.
export const northeastern: SchoolSourceRecord = {
  schoolName: "Northeastern University",
  cycleLabel: "2026–27",
  verificationStatus: "needs-review",
  applicationPlatform: "common-app",
  sourceUrl: "https://admissions.northeastern.edu/application-information/first-year-applicants/",
  retrievedAt: "2026-08-24",
  note: "Checked Northeastern's official First-Year Applicants, Required Materials, and How to Apply pages. They require the Common Application or Coalition Application and elsewhere refer to application essays/Northeastern-specific questions, but the public checklist does not state whether a school-specific writing supplement is required or publish exact current wording. The only public 500-word personal statement found is conditional portfolio material for College of Arts, Media and Design applicants, not a general prompt. Verify the 2026-27 application itself before importing or declaring no supplement.",
  prompts: [],
};
