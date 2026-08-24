import type { SchoolSourceRecord } from "../types";

export const texasAM: SchoolSourceRecord = {
  schoolName: "Texas A&M University",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://admissions.tamu.edu/apply/freshman/index.html",
  retrievedAt: "2026-08-24",
  note: "Texas A&M's official freshman admissions page publishes these questions alongside Fall 2027 application information. The required essay permits 750 words, the life-event response permits 250, four shorter responses permit 100 each, and the final context response is optional.",
  prompts: [
    { externalRef: "personal-story", title: "Your story", promptText: "Tell us your story. What unique opportunities or challenges have you experienced throughout your high school career that have shaped who you are today?", maxWordCount: 750, requirement: "required" },
    { externalRef: "college-readiness", title: "A life event that prepared you for college", promptText: "Describe a life event which you feel has prepared you to be successful in college.", maxWordCount: 250, requirement: "required" },
    { externalRef: "life-goals", title: "Life goals and objectives", promptText: "In a few words, what are some of your life goals and objectives?", maxWordCount: 100, requirement: "required" },
    { externalRef: "major-choice", title: "Why your chosen major", promptText: "In a few words, why have you chosen your academic major(s)?", maxWordCount: 100, requirement: "required" },
    { externalRef: "why-tamu", title: "Why Texas A&M", promptText: "We know you have a lot of options. In a few words, why did you choose to apply to Texas A&M?", maxWordCount: 100, requirement: "required" },
    { externalRef: "education-plans", title: "Plans beyond a bachelor's degree", promptText: "Briefly describe any educational plans you have beyond earning your bachelor’s degree.", maxWordCount: 100, requirement: "required" },
    { externalRef: "additional-context", title: "Additional context", promptText: "Are there experiences or opportunities that have shaped or influenced your abilities or academic record, which you have not already written about?", maxWordCount: 250, requirement: "optional" },
  ],
};
