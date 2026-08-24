import type { SchoolSourceRecord } from "../types";

// Davidson's live official first-year admissions page publishes both
// supplemental questions and their limits. The page does not print a cycle
// year, so that caveat remains visible in the note.
export const davidson: SchoolSourceRecord = {
  schoolName: "Davidson College",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.davidson.edu/admission-and-financial-aid/apply/first-year-applicants",
  retrievedAt: "2026-08-24",
  note: "Davidson's official live First Year Applicants page publishes both supplemental questions and their 250-300 word limits. The page was current when retrieved but does not print an application-cycle year, so re-check if Davidson revises the live page.",
  prompts: [
    { externalRef: "why-davidson", title: "Why Davidson", promptText: "There are just under 4,000 four-year colleges and universities in the United States. Being as specific as possible, what interests you most about Davidson College?", minWordCount: 250, maxWordCount: 300, requirement: "required" },
    { externalRef: "intellectual-curiosity", title: "A curiosity that excites you", promptText: "Davidson encourages students to explore curiosities in and out of the classroom. What is a topic, activity or idea that excites you? Tell us why. Examples may include hobbies, books, interactions, music, podcasts, movies, etc.", minWordCount: 250, maxWordCount: 300, requirement: "required" },
  ],
};
