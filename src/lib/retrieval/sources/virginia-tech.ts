import type { SchoolSourceRecord } from "../types";

// Virginia Tech's live application page confirms that the 2027 first-year
// application is open, while official admissions/catalog materials confirm an
// Ut Prosim Profile. The current public pages do not expose its exact prompts.
export const virginiaTech: SchoolSourceRecord = {
  schoolName: "Virginia Polytechnic Institute and State University",
  cycleLabel: "2026–27",
  verificationStatus: "needs-review",
  applicationPlatform: "common-app",
  sourceUrl: "https://cnre.vt.edu/content/vt_edu/en/admissions/undergraduate/apply.html",
  retrievedAt: "2026-08-24",
  note: "Checked Virginia Tech's official live application page, which states that the 2027 first-year application is open and directs applicants to the Common App. Official Virginia Tech admissions/catalog pages also identify the Ut Prosim Profile as application material, but no public official page located publishes the exact 2026–27 questions or limits. An official eight-year-old international-application PDF and a stale 2024–25 navigation result contain prior wording, but neither can verify the current cycle; no old or secondary-source wording is imported.",
  prompts: [],
};
