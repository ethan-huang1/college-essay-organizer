import type { SchoolSourceRecord } from "../types";

export const tufts: SchoolSourceRecord = {
  schoolName: "Tufts University",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://admissions.tufts.edu/apply/short-answer-questions/",
  retrievedAt: "2026-08-24",
  note: "Tufts Admissions explicitly labels these questions for the Class of 2031. Every first-year applicant answers the first prompt and one program-specific version of the second prompt; the official deadline page dates this application cycle to November 2026 through January 2027.",
  prompts: [
    { externalRef: "college-search-engagement", title: "Learning about and engaging with Tufts", promptText: "Please describe how you have learned about and engaged with Tufts during your college search process.", minWordCount: 75, maxWordCount: 150, requirement: "required" },
    { externalRef: "arts-sciences-assignment", title: "A favorite school assignment", promptText: "Tell us about one of your favorite school assignments in the past two years. What was the assignment and why did you enjoy it?", minWordCount: 100, maxWordCount: 200, requirement: "conditional", conditionalNote: "Required second response for School of Arts and Sciences applicants." },
    { externalRef: "engineering-project", title: "An engineering or science project", promptText: "Tell us about an engineering or science-related project that you have helped build, design, create, or iterate in the past two years. What was the project and what was your role?", minWordCount: 100, maxWordCount: 200, requirement: "conditional", conditionalNote: "Required second response for School of Engineering applicants." },
    { externalRef: "bfa-portfolio-piece", title: "A specific portfolio piece", promptText: "Tell us more about a specific piece in your portfolio. What were the ideas you intended to explore, and how did those ideas inform the process of making the piece?", minWordCount: 100, maxWordCount: 200, requirement: "conditional", conditionalNote: "Required second response for BFA applicants." },
    { externalRef: "combined-degree-portfolio", title: "Portfolio and academic inspiration", promptText: "Tell us more about a specific piece in your portfolio. How did an academic course, project, or interest inspire the ideas that you explored in this piece? Or, how did making this piece influence your academic interests?", minWordCount: 100, maxWordCount: 200, requirement: "conditional", conditionalNote: "Required second response for Combined Degree (BFA+BA/BS) applicants." },
  ],
};
