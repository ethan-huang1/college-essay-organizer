import type { SchoolSourceRecord } from "../types";

// The live official page still identifies its testing policy and applicant
// audience as Fall 2026, so its two displayed questions are retained as useful
// prior-cycle planning material rather than represented as 2026-27 prompts.
export const harveyMudd: SchoolSourceRecord = {
  schoolName: "Harvey Mudd College",
  cycleLabel: "2025–26",
  verificationStatus: "previous-cycle",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.hmc.edu/admission/apply/first-year-students/",
  retrievedAt: "2026-08-24",
  note: "Official Harvey Mudd first-year page. The page publishes two required writing questions but still describes applicants for Fall 2026, so these are imported as 2025-26 previous-cycle material. They remain usable for planning and matching but are not current-cycle completion; re-check when Harvey Mudd labels its 2026-27 application.",
  prompts: [
    {
      externalRef: "impact-problems-and-community",
      title: "Experiences, community, and problems to solve",
      promptText: "The problems that Harvey Mudd College students hope to tackle are shaped by their experiences, values, and communities. Through our intentionally interdisciplinary curriculum and our mission to develop “a clear understanding of the impact of their work,” Mudders develop the skills needed to address these complex challenges and contribute meaningfully to society. Share how an experience you’ve had or community you belong to has shaped the kinds of problems you want to solve and the impact you want to make.",
      maxWordCount: 500,
      requirement: "required",
    },
    {
      externalRef: "asking-for-help",
      title: "Asking for help",
      promptText: "No one succeeds alone, and at Harvey Mudd College, no one expects you to. In and out of the classroom, HMC students are encouraged to embrace challenges, collaborate with one another, and ask for support when they need it. Describe a time when asking for help made a difference in your work or wellbeing. What led you to reach out, and what did you take away from the experience?",
      maxWordCount: 250,
      requirement: "required",
    },
  ],
};
