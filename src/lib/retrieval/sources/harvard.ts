import type { SchoolSourceRecord } from "../types";

// Harvard's official page confirms five required 150-word short-answer
// questions exist, but states the 2026-27 supplement is "available each
// application cycle in August" and only 2025-26 content could be
// confirmed - the actual question text was deliberately NOT imported to
// avoid presenting a stale cycle as current. Re-check after Harvard
// publishes its 2026-27 supplement.
export const harvard: SchoolSourceRecord = {
  schoolName: "Harvard University",
  cycleLabel: "2026–27",
  verificationStatus: "previous-cycle",
  applicationPlatform: "common-app",
  sourceUrl: "https://college.harvard.edu/admissions/apply/first-year-applicants",
  retrievedAt: "2026-08-24",
  note: "Harvard's official page confirms five required 150-word short-answer questions exist, but states the 2026-27 supplement is \"available each application cycle in August\" and only 2025-26 content could be confirmed - the actual question text was deliberately not imported to avoid presenting a stale cycle as current.",
  prompts: [],
};
