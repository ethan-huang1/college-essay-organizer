import type { SchoolSourceRecord } from "../types";

// Cornell removed its former public first-year writing-prompts page. The live
// official page confirms school-specific essays but directs applicants to the
// Common App for the actual wording.
export const cornell: SchoolSourceRecord = {
  schoolName: "Cornell University",
  cycleLabel: "2026–27",
  verificationStatus: "needs-review",
  applicationPlatform: "common-app",
  sourceUrl: "https://admissions.cornell.edu/how-to-apply/first-year-applicants",
  retrievedAt: "2026-08-24",
  note: "Checked Cornell Undergraduate Admissions' official First-Year Applicants and Writing Supplement submission pages. Cornell confirms that its Common App supplement includes college- or school-specific essay questions, but the live public site no longer publishes their exact wording; the former public prompts URL redirects to the general first-year page. Exact 2026-27 wording for every Cornell college/school must be verified in the Common App before import.",
  prompts: [],
};
