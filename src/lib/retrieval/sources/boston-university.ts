import type { SchoolSourceRecord } from "../types";

// BU's public first-year checklist confirms that a BU supplemental essay is
// required for Common Application applicants and that Kilachand Honors has an
// additional essay, but it does not publish either prompt's exact wording or a
// cycle label. Do not import consultant-blog wording as if BU verified it.
export const bostonUniversity: SchoolSourceRecord = {
  schoolName: "Boston University",
  cycleLabel: "2026–27",
  verificationStatus: "needs-review",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.bu.edu/admissions/apply/first-year/",
  retrievedAt: "2026-08-24",
  note: "Checked Boston University's official first-year applicant checklist. It confirms that Common Application applicants must submit a BU supplemental essay and that applicants requesting Kilachand Honors College consideration complete an additional essay, but the public page does not expose either exact prompt or identify its cycle. Exact 2026–27 wording could not be confirmed from an official public source, so no secondary-source wording is imported.",
  prompts: [],
};
