import type { SchoolSourceRecord } from "../types";

// CU Boulder's official application page publishes the short answer
// verbatim, and its current planning/application-season pages explicitly
// identify the same requirement as part of the 2027 first-year application.
export const universityOfColoradoBoulder: SchoolSourceRecord = {
  schoolName: "University of Colorado Boulder",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.colorado.edu/admissions/process/first-year/apply",
  retrievedAt: "2026-08-24",
  note: "Official CU Boulder first-year application page, corroborated by the Office of Admissions' 2027 application-season guide and 2027 first-year planning page. The Common Application personal essay is also required but is shared platform content, so only CU Boulder's school-specific 250-word academic-interest response is included here.",
  prompts: [
    {
      externalRef: "short-answer-academic-interest",
      title: "Academic interests at CU Boulder",
      promptText: "What do you hope to study, and why, at CU Boulder? Or if you don't know quite yet, think about your studies so far, extracurricular/after-school activities, jobs, volunteering, future goals or anything else that has shaped your interests.",
      maxWordCount: 250,
      requirement: "required",
    },
  ],
};
