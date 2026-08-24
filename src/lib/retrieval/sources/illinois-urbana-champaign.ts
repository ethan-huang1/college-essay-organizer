import type { SchoolSourceRecord } from "../types";

// Illinois' official archived application-help page explicitly identifies
// itself as the 2025-2026 Common App walkthrough. The current site publishes
// the same questions but does not label them with a 2026-27 cycle, so the
// cycle-attributed set remains previous-cycle until Illinois confirms it.
export const universityOfIllinoisUrbanaChampaign: SchoolSourceRecord = {
  schoolName: "University of Illinois Urbana-Champaign",
  cycleLabel: "2025–26",
  verificationStatus: "previous-cycle",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.archive.admissions.illinois.edu/apply/freshman/help-with-applying",
  retrievedAt: "2026-08-24",
  note: "Official Illinois Undergraduate Admissions archive explicitly labeled as the 2025–2026 Common App first-year application walkthrough, corroborated by the official essay-prompts page. Declared-major applicants answer the two first-choice-major questions; undeclared applicants answer the two undeclared alternatives; applicants listing a second-choice major answer the additional question. The live prompt page does not state a 2026–27 cycle, so these remain previous-cycle planning prompts.",
  prompts: [
    {
      externalRef: "first-choice-major-experience",
      title: "First-choice major: related experience",
      promptText: "Explain, in detail, an experience you’ve had in the past 3 to 4 years related to your first-choice major. This can be an experience from an extracurricular activity, in a class you’ve taken, or through something else.",
      maxWordCount: 150,
      requirement: "conditional",
      conditionalNote: "Required for applicants selecting a declared first-choice major; undeclared applicants answer the undeclared alternatives instead.",
    },
    {
      externalRef: "first-choice-major-goals",
      title: "First-choice major: goals after Illinois",
      promptText: "Describe your personal and/or career goals after graduating from Illinois and how your selected first-choice major will help you achieve them.",
      maxWordCount: 150,
      requirement: "conditional",
      conditionalNote: "Required for applicants selecting a declared first-choice major; undeclared applicants answer the undeclared alternatives instead.",
    },
    {
      externalRef: "undeclared-future-goals",
      title: "Undeclared: future goals",
      promptText: "What are your future career or academic goals? You may include courses you took in high school and how these impacted your goals.",
      maxWordCount: 150,
      requirement: "conditional",
      conditionalNote: "Required only for applicants applying to Illinois as undeclared.",
    },
    {
      externalRef: "undeclared-academic-interests",
      title: "Undeclared: academic interests",
      promptText: "What are your academic interests? Please include 2-3 majors you’re considering at Illinois and why.",
      maxWordCount: 150,
      requirement: "conditional",
      conditionalNote: "Required only for applicants applying to Illinois as undeclared.",
    },
    {
      externalRef: "second-choice-major-interest",
      title: "Second-choice major interest",
      promptText: "Please explain your interest in your second-choice major or your overall academic or career goals.",
      maxWordCount: 150,
      requirement: "conditional",
      conditionalNote: "Required only when the applicant lists a second-choice major.",
    },
  ],
};
