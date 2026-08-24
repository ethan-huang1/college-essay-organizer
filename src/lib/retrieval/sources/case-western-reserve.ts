import type { SchoolSourceRecord } from "../types";

// The current official first-year page confirms two conditional essays for
// Pre-Professional Scholars applicants, but only exposes them inside the
// application platforms and does not publish their wording. The general
// requirements page also lists writing for certain arts applicants, so this
// school cannot accurately be classified as having no supplement.
export const caseWesternReserve: SchoolSourceRecord = {
  schoolName: "Case Western Reserve University",
  cycleLabel: "2026–27",
  verificationStatus: "needs-review",
  applicationPlatform: "common-app",
  sourceUrl: "https://case.edu/admission/apply/first-year-applicants",
  retrievedAt: "2026-08-24",
  note: "Checked Case Western Reserve's official current First-Year Applicants and Deadlines and Requirements pages. General applicants submit the platform essay, but Pre-Professional Scholars applicants must answer two additional essays whose exact wording is available only inside the Common App or Coalition with Scoir. The requirements page also identifies conditional arts-program writing. Because current conditional supplemental wording could not be verified from a public official source, no prompt is imported and this record needs review in the application platform.",
  prompts: [],
};
