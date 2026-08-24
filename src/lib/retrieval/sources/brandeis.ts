import type { SchoolSourceRecord } from "../types";

// The official first-year checklist and application landing page do not expose
// exact general supplement wording or a cycle label. A separate official page
// publishes a conditional Myra Kraft Achievers response, but does not resolve
// whether there are other general prompts in the application platform.
export const brandeis: SchoolSourceRecord = {
  schoolName: "Brandeis University",
  cycleLabel: "2026–27",
  verificationStatus: "needs-review",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.brandeis.edu/admissions/apply/application-process/first-year.html",
  retrievedAt: "2026-08-24",
  note: "Checked Brandeis's official first-year application checklist (the cited source), its official application landing page at https://www.brandeis.edu/admissions/apply/supplements.html, and its Myra Kraft Achievers Program page at https://www.brandeis.edu/admissions/apply/myra-kraft-achievers.html. The first two do not publish exact general supplemental-essay wording or a 2026–27 cycle label. The program page exposes one 250-word conditional response, but does not establish the complete general first-year supplement. Exact current-cycle application-platform wording remains unresolved, so no prompts are imported.",
  prompts: [],
};
