import type { SchoolSourceRecord } from "../types";

// Wesleyan's official first-year page exhaustively lists application
// components but does not expose its member-specific questions. An official
// Freeman Asian Scholars addendum has an essay but no trustworthy cycle date.
export const wesleyan: SchoolSourceRecord = {
  schoolName: "Wesleyan University",
  cycleLabel: "2026–27",
  verificationStatus: "needs-review",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.wesleyan.edu/admission/undergraduate-admission/first-year.html",
  retrievedAt: "2026-08-24",
  note: "Checked Wesleyan's official current first-year application page (cited), which requires Common App or Coalition including Wesleyan member-specific questions but does not publish those questions or identify any general writing supplement. Also checked Wesleyan's official Freeman Asian Scholars addendum at https://www.wesleyan.edu/forms/Addendum09.pdf; it contains a conditional 400-word essay but has no reliable cycle identifier and may be a stale legacy form. Exact 2026–27 platform and scholarship writing requirements therefore remain unresolved, so no prompt is imported.",
  prompts: [],
};
