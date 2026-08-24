import type { SchoolSourceRecord } from "../types";

// UW's live writing-section page now enumerates only the Common App personal
// essay and the two generic optional Common App writing spaces. A dated older
// instruction page still describes a UW-specific essay and is not current.
export const universityOfWashington: SchoolSourceRecord = {
  schoolName: "University of Washington",
  cycleLabel: "2026–27",
  verificationStatus: "no-supplement-confirmed",
  applicationPlatform: "common-app",
  sourceUrl: "https://admit.washington.edu/apply/first-year/how-to-apply/writing-section/",
  retrievedAt: "2026-08-24",
  note: "Official UW first-year writing-section page current during the 2026 application season. It provides the shared Common App personal essay plus the Common App's optional Challenges and Circumstances and Additional Information spaces, but no UW-specific writing prompt. This current page supersedes a separately indexed older how-to-apply page that explicitly describes the autumn 2025–26 cycle and the former UW essay. Optional Honors-program writing is a separate program application and is outside the general first-year supplement.",
  prompts: [],
};
