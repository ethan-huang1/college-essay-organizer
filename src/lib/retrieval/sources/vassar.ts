import type { SchoolSourceRecord } from "../types";

// Vassar's standard first-year checklist lists no school-specific writing, but
// its official QuestBridge instructions confirm a restricted writing supplement
// without exposing the prompt. That conditional path prevents a no-supplement
// conclusion for the school as a whole.
export const vassarCollege: SchoolSourceRecord = {
  schoolName: "Vassar College",
  cycleLabel: "2026–27",
  verificationStatus: "needs-review",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.vassar.edu/admission/apply/questbridge/",
  retrievedAt: "2026-08-24",
  note: "Checked Vassar's official current first-year requirements, how-to-apply page, and QuestBridge instructions. The complete standard checklist lists the Common/Coalition application and optional non-prompted 'Your Space,' but no Vassar-specific essay. However, the official QuestBridge page confirms a Vassar QuestBridge Writing Supplement whose wording is available only after an applicant submits QuestBridge and receives portal access. Because that conditional prompt and its current-cycle wording cannot be checked publicly, the school remains needs-review rather than no-supplement-confirmed.",
  prompts: [],
};
