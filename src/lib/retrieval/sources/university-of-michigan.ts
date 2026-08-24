import type { SchoolSourceRecord } from "../types";

// Michigan's live official essay page publishes two required U-M questions.
// Its companion Application Changes page explicitly identifies the active
// application as the 2026-2027 cycle and Fall 2027 entry.
export const universityOfMichigan: SchoolSourceRecord = {
  schoolName: "University of Michigan",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://admissions.umich.edu/apply/first-year-applicants/essay-questions",
  retrievedAt: "2026-08-24",
  note: "Official University of Michigan Undergraduate Admissions essay page, cross-checked against its 'New for 2026-2027 Application Cycle' page for Fall 2027 entry. Both U-M-specific questions are required for all first-year applicants; the separate Common App personal essay is not duplicated here.",
  prompts: [
    {
      externalRef: "leaders-and-citizens",
      title: "Leaders and citizens",
      promptText: "At the University of Michigan, we are focused on developing leaders and citizens who will challenge the present and enrich the future. In your essay, share with us how you are prepared to contribute to these goals. This could include the people, places, experiences, or aspirations that have shaped your journey and future plans.",
      minWordCount: 100,
      maxWordCount: 300,
      requirement: "required",
    },
    {
      externalRef: "specific-school-fit",
      title: "Specific undergraduate school or college",
      promptText: "Describe the unique qualities that attract you to the specific undergraduate college or school (including preferred admission and dual degree programs) to which you are applying at the University of Michigan. How would that curriculum support your interests?",
      minWordCount: 100,
      maxWordCount: 550,
      requirement: "required",
    },
  ],
};
