import type { SchoolSourceRecord } from "../types";

// Carnegie Mellon's live official consideration page publishes the three
// questions verbatim, but its cycle-specific testing section is for fall
// 2026 entry. That ties the page to the 2025-26 application cycle, so the
// prompts remain useful for planning but cannot count as current coverage.
export const carnegieMellon: SchoolSourceRecord = {
  schoolName: "Carnegie Mellon University",
  cycleLabel: "2025–26",
  verificationStatus: "previous-cycle",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.cmu.edu/admission/admission/admission-consideration",
  retrievedAt: "2026-08-24",
  note: "Official Carnegie Mellon Undergraduate Admission page. It gives the three Common Application Writing Supplement questions and 300-word limits verbatim, while the same page's cycle-specific testing policy is explicitly for fall 2026 entry. These are therefore labeled 2025–26 previous-cycle prompts and must be rechecked before being treated as requirements for fall 2027 entry.",
  prompts: [
    { externalRef: "short-answer-major-inspiration", title: "Passion behind your intended area of study", promptText: "Most students choose their intended major or area of study based on a passion or inspiration that’s developed over time — what passion or inspiration led you to choose this area of study?", maxWordCount: 300, requirement: "required" },
    { externalRef: "short-answer-successful-college-experience", title: "A successful college experience", promptText: "Many students pursue college for a specific degree, career opportunity or personal goal. Whichever it may be, learning will be critical to achieve your ultimate goal. As you think ahead to the process of learning during your college years, how will you define a successful college experience?", maxWordCount: 300, requirement: "required" },
    { externalRef: "short-answer-emphasize", title: "What you want to emphasize", promptText: "Consider your application as a whole. What do you personally want to emphasize about your application for the admission committee’s consideration? Highlight something that’s important to you or something you haven’t had a chance to share. Tell us, don’t show us (no websites please).", maxWordCount: 300, requirement: "required" },
  ],
};
