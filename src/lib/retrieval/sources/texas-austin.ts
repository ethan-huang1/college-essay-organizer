import type { SchoolSourceRecord } from "../types";

// UT Austin's live freshman page identifies the application as the one whose
// decisions are released in 2027 and links directly to the official prompt
// page. Program-specific first-year questions are published on the same
// admissions site; honors-program applications are intentionally out of scope.
export const universityOfTexasAtAustin: SchoolSourceRecord = {
  schoolName: "University of Texas at Austin",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://admissions.utexas.edu/apply/application-materials/essays-and-short-answers/",
  retrievedAt: "2026-08-24",
  note: "Official UT Austin freshman materials for the application season whose decisions are released in 2027. The shared Common App personal essay satisfies UT's separate essay requirement and is not duplicated here. Included are the two general UT short answers, the optional academic-circumstances response, and the additional first-year questions required for Architecture and Nursing applicants. Separate honors-program applications are outside this first-year admission prompt set.",
  prompts: [
    {
      externalRef: "short-answer-first-choice-major",
      title: "First-choice major",
      promptText: "Why are you interested in the major you indicated as your first-choice major?",
      maxWordCount: 300,
      requirement: "required",
    },
    {
      externalRef: "short-answer-proudest-activity",
      title: "Proudest activity",
      promptText: "Think of all the activities — both in and outside of school — that you have been involved with during high school. Which one are you most proud of and why? (Guidance for students: This can include an extracurricular activity, a club/organization, volunteer activity, work or a family responsibility.)",
      maxWordCount: 300,
      requirement: "required",
    },
    {
      externalRef: "short-answer-academic-circumstances",
      title: "Academic circumstances",
      promptText: "Please share background on events or special circumstances that you feel may have impacted your high school academic performance.",
      maxWordCount: 300,
      requirement: "optional",
    },
    {
      externalRef: "short-answer-architecture",
      title: "School of Architecture",
      promptText: "Inherent in the design disciplines is the capacity to impact the world around us. What does the opportunity to develop such capacity mean to you and you approach to your college education?",
      minWordCount: 250,
      maxWordCount: 300,
      requirement: "conditional",
      conditionalNote: "Required only for freshman applicants to the School of Architecture.",
    },
    {
      externalRef: "short-answer-nursing",
      title: "School of Nursing",
      promptText: "Discuss the factors that have influenced your motivation and deep desire to pursue a career in nursing. Please include any activities and/or life experiences that are related.",
      requirement: "conditional",
      conditionalNote: "Required only for freshman applicants selecting Nursing as their first-choice major.",
    },
  ],
};
