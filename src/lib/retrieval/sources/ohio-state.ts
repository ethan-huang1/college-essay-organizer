import type { SchoolSourceRecord } from "../types";

// Ohio State publishes all of its general university-specific Common App
// questions, none of which is an essay, but confirms a separate Morrill
// Scholarship essay without exposing the prompt.
export const ohioState: SchoolSourceRecord = {
  schoolName: "Ohio State University",
  cycleLabel: "2026–27",
  verificationStatus: "needs-review",
  applicationPlatform: "common-app",
  sourceUrl: "https://undergrad.osu.edu/apply/freshmen-columbus/common-app",
  retrievedAt: "2026-08-24",
  note: "Checked Ohio State's official Common Application preparation page for autumn 2027 applicants. It enumerates the general Ohio State-specific questions and none is a supplemental essay beyond the shared Common App personal statement. However, the same official page confirms a Morrill Scholarship Program essay and does not publish its exact prompt. Verify that conditional 2026-27 scholarship wording in the Common App before treating Ohio State as fully covered or no-supplement-confirmed.",
  prompts: [],
};
