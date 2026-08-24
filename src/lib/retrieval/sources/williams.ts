import type { SchoolSourceRecord } from "../types";

// Williams explicitly says it does not require a writing supplement. It permits
// an optional pre-existing academic paper, which is supplemental material rather
// than a school prompt asking the applicant to compose a response.
export const williams: SchoolSourceRecord = {
  schoolName: "Williams College",
  cycleLabel: "2026–27",
  verificationStatus: "no-supplement-confirmed",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.williams.edu/admission-aid/how-to-apply/first-year/",
  retrievedAt: "2026-08-24",
  note: "Williams College's official current first-year application page explicitly states, 'Williams does not require a writing supplement.' Applicants may optionally submit a pre-existing academic paper on any topic with a description of its assignment; that optional work sample is not a Williams-authored essay prompt and is therefore not imported.",
  prompts: [],
};
