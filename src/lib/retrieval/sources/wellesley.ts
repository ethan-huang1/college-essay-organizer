import type { SchoolSourceRecord } from "../types";

// Wellesley's live first-year page identifies fall 2027 as the current entry
// cycle and publishes the required Wellesley-specific essay verbatim.
export const wellesley: SchoolSourceRecord = {
  schoolName: "Wellesley College",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.wellesley.edu/admission-aid/apply/first-year-applicants",
  retrievedAt: "2026-08-24",
  note: "Official Wellesley first-year applicant page, current for applicants seeking entry in fall 2027. It requires a personal essay plus this shorter Wellesley-specific essay and accepts the Common Application, QuestBridge Application, and Coalition Application. The official page does not state a word or character limit for the Wellesley-specific response, so none is inferred.",
  prompts: [
    {
      externalRef: "required-bridges-perspectives",
      title: "Building bridges across perspectives",
      promptText: "Wellesley students actively seek ways to build bridges and to change the world for the better. Tell us about an experience working with and alongside people of different backgrounds and/or perspectives from your own. Why was this important to you, and what lessons from this will you bring with you to Wellesley?",
      requirement: "required",
    },
  ],
};
