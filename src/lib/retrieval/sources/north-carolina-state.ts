import type { SchoolSourceRecord } from "../types";

// NC State's live first-year page publishes the general required short answer,
// and its dedicated 2027-applicant update publishes the new Honors prompt.
export const northCarolinaState: SchoolSourceRecord = {
  schoolName: "North Carolina State University",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://admissions.ncsu.edu/apply/first-year/",
  retrievedAt: "2026-08-24",
  note: "Official NC State first-year admissions page and its 2027 First-Year Applicant update. The general major-interest short answer is required; the 600-word curiosity prompt applies only to applicants seeking University Honors consideration and is also used by the separately applied-to Park Scholarships Program. NC State also accepts Coalition on Scoir.",
  prompts: [
    {
      externalRef: "required-major-interest",
      title: "Why your selected academic programs",
      promptText: "Explain why you selected the academic program(s) above and why you are interested in studying these at NC State.",
      requirement: "required",
    },
    {
      externalRef: "honors-curiosity-to-action",
      title: "University Honors: curiosity in action",
      promptText: "Think about a time when your curiosity led you to not just learn, but to act. How did you learn more, and what tangible steps did you take as a result of what you learned? What insights about yourself, others, or the world did you take away from this process of learning and doing?",
      maxWordCount: 600,
      requirement: "conditional",
      conditionalNote: "Required only for first-year applicants seeking NC State University Honors Program consideration. The same prompt is also part of the separate Park Scholarships application.",
    },
  ],
};
