import type { SchoolSourceRecord } from "../types";

// Bucknell's official admissions blog publishes exact supplemental wording,
// but the March 2025 article does not identify which application cycle that
// wording belongs to. The current application and requirements pages were
// also checked; neither ties the quoted question to 2026-27 or explicitly to
// 2025-26, so importing it under either allowed cycle would overstate the
// evidence.
export const bucknell: SchoolSourceRecord = {
  schoolName: "Bucknell University",
  cycleLabel: "2026–27",
  verificationStatus: "needs-review",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.bucknell.edu/admissions-aid/admissions-blog/tips-writing-college-application-essay",
  retrievedAt: "2026-08-24",
  note: "Checked Bucknell's official March 3, 2025 admissions essay-advice article, which quotes one major-interest supplemental question, plus the live Apply to Bucknell and Undergraduate Admission Requirements pages. Bucknell accepts the Common Application and Coalition Application, but none of those official pages identifies the quoted prompt as either 2026–27 or 2025–26. Exact cycle attribution therefore remains unresolved, so no prompt is imported until Bucknell publishes or labels current-cycle wording.",
  prompts: [],
};
