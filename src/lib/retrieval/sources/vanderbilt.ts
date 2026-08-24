import type { SchoolSourceRecord } from "../types";

// Vanderbilt's live prompt page is linked from its current first-year process,
// which expressly addresses applicants for fall 2027 entry.
export const vanderbiltUniversity: SchoolSourceRecord = {
  schoolName: "Vanderbilt University",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://admissions.vanderbilt.edu/apply/personal-essay-and-short-answer-prompts/",
  retrievedAt: "2026-08-24",
  note: "Official Vanderbilt Personal Essay and Short Answer Prompts page, corroborated by the current first-year application process for Fall 2027 entry. The shared Common App or Coalition personal essay is not duplicated; only Vanderbilt's approximately 250-word institutional short answer is included.",
  prompts: [
    {
      externalRef: "short-answer-dare-to-grow",
      title: "Dare to grow",
      promptText: "Vanderbilt University’s motto, Crescere aude, is Latin for “dare to grow.” In your response, reflect on how one or more aspects of your identity, culture, or background has played a role in your personal growth, and how it will contribute to our campus community as you dare to grow at Vanderbilt.",
      maxWordCount: 250,
      requirement: "required",
    },
  ],
};
