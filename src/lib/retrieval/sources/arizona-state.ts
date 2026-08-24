import type { SchoolSourceRecord } from "../types";

// ASU's official first-year admission requirements and admissions FAQ both
// explicitly say that neither an essay nor a personal statement is required
// for the ASU application or the Common Application route.
export const arizonaState: SchoolSourceRecord = {
  schoolName: "Arizona State University",
  cycleLabel: "2026–27",
  verificationStatus: "no-supplement-confirmed",
  applicationPlatform: "school-specific",
  sourceUrl: "https://admission.asu.edu/apply/first-year/admission",
  retrievedAt: "2026-08-24",
  note: "ASU's official first-year admission requirements explicitly state that ASU does not require an essay or personal statement for either its own application or the Common Application. This confirms no general first-year writing supplement for the 2026–27 cycle; special programs may have separate requirements outside the general application.",
  prompts: [],
};
