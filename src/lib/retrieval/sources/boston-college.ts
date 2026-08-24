import type { SchoolSourceRecord } from "../types";

// Official Boston College Undergraduate Admission page, explicitly headed
// "Supplemental Questions 2026-27." Non-HCE applicants choose one of prompts
// 1-4; Human-Centered Engineering applicants answer prompt 5 instead.
export const bostonCollege: SchoolSourceRecord = {
  schoolName: "Boston College",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.bc.edu/content/bc-web/admission/apply.html",
  retrievedAt: "2026-08-24",
  note: "Official Boston College Undergraduate Admission page, explicitly labeled \"Supplemental Questions 2026-27.\" Applicants respond to one of prompts 1-4 (400 words); Human-Centered Engineering applicants answer prompt 5 instead.",
  prompts: [
    {
      externalRef: "choice-tradition",
      title: "A meaningful tradition",
      promptText: "Strong communities are sustained by traditions. Boston College's annual calendar is marked with both long-standing and newer traditions that help shape our community. Tell us about a meaningful tradition in your family or community. Why is it important to you, and how does it bring people together or strengthen the bonds of those who participate?",
      maxWordCount: 400,
      requirement: "conditional",
      conditionalNote: "Non-Human-Centered Engineering applicants choose one of prompts 1-4. Human-Centered Engineering applicants answer prompt 5 instead.",
    },
    {
      externalRef: "choice-conversation-partner",
      title: "A meaningful conversation partner",
      promptText: "The late BC theology professor, Father Michael Himes, argued that a university is not a place to which you go, but instead, a \"rigorous and sustained conversation about the great questions of human existence, among the widest possible circle of the best possible conversation partners.\" Who has been your most meaningful conversation partner, and what profound questions have you considered together?",
      maxWordCount: 400,
      requirement: "conditional",
      conditionalNote: "Non-Human-Centered Engineering applicants choose one of prompts 1-4. Human-Centered Engineering applicants answer prompt 5 instead.",
    },
    {
      externalRef: "choice-single-story",
      title: "The danger of a single story",
      promptText: "In her July 2009 Ted Talk, \"The Danger of a Single Story,\" Chimamanda Ngozi Adichie warned viewers against assigning people a \"single story\" through assumptions about their nationality, appearance, or background. Discuss a time when someone defined you by a single story. What challenges did this present and how did you overcome them?",
      maxWordCount: 400,
      requirement: "conditional",
      conditionalNote: "Non-Human-Centered Engineering applicants choose one of prompts 1-4. Human-Centered Engineering applicants answer prompt 5 instead.",
    },
    {
      externalRef: "choice-fourth-be",
      title: "A fourth 'Be'",
      promptText: "Boston College’s Jesuit mission highlights \"the three Be’s\": be attentive, be reflective, be loving – core to Jesuit education. If you could add a fourth \"Be,\" what would it be and why? How would this new value support your personal development and enrich the BC community?",
      maxWordCount: 400,
      requirement: "conditional",
      conditionalNote: "Non-Human-Centered Engineering applicants choose one of prompts 1-4. Human-Centered Engineering applicants answer prompt 5 instead.",
    },
    {
      externalRef: "hce-common-good",
      title: "Human-Centered Engineering and the Common Good",
      promptText: "One goal of a Jesuit education is to prepare students to serve the Common Good. Human-Centered Engineering at Boston College integrates technical knowledge, creativity, and a humanistic perspective to address societal challenges and opportunities. What societal problems are important to you and how will you use your HCE education to solve them?",
      maxWordCount: 400,
      requirement: "conditional",
      conditionalNote: "Required only for applicants to the Human-Centered Engineering major; these applicants answer this prompt instead of choosing from prompts 1-4.",
    },
  ],
};
