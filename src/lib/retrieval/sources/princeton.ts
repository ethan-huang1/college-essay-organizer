import type { SchoolSourceRecord } from "../types";

// Official Princeton Admission page, explicitly labeled "2026-27 Cycle."
// The two academic-interest essay variants are a real conditional-prompt
// case: only one applies, depending on the applicant's intended degree.
export const princeton: SchoolSourceRecord = {
  schoolName: "Princeton University",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://admission.princeton.edu/apply/princeton-specific-questions",
  retrievedAt: "2026-08-24",
  note: "Official Princeton Admission page, explicitly labeled \"2026-27 Cycle.\"",
  prompts: [
    { externalRef: "academic-interest-ab", title: "Academic interest (A.B. degree or undecided)", promptText: "As a research institution that also prides itself on its liberal arts curriculum, Princeton allows students to explore areas across the humanities and the arts, the natural sciences, and the social sciences. What academic areas most pique your curiosity, and how do the programs offered at Princeton suit your particular interests?", maxWordCount: 250, requirement: "conditional", conditionalNote: "Answer this version only if applying for the A.B. degree or undecided; B.S.E. applicants answer the engineering variant instead." },
    { externalRef: "academic-interest-bse", title: "Academic interest (B.S.E. degree)", promptText: "Please describe why you are interested in studying engineering at Princeton. Include any of your experiences in or exposure to engineering, and how you think the programs offered at the University suit your particular interests.", maxWordCount: 250, requirement: "conditional", conditionalNote: "Answer this version only if applying for the B.S.E. (engineering) degree; A.B./undecided applicants answer the other variant instead." },
    { externalRef: "your-voice-1", title: "Your Voice: lived experience", promptText: "Princeton values community and encourages students, faculty, staff and leadership to engage in respectful conversations that can expand their perspectives and challenge their ideas and beliefs. As a prospective member of this community, reflect on how your lived experiences will impact the conversations you will have in the classroom, the dining hall or other campus spaces. What lessons have you learned in life thus far? What will your classmates learn from you? In short, how has your lived experience shaped you?", minWordCount: 400, maxWordCount: 500, requirement: "required" },
    { externalRef: "your-voice-2", title: "Your Voice: service and civic engagement", promptText: "Princeton has a longstanding commitment to understanding our responsibility to society through service and civic engagement. How does your own story intersect with these ideals?", maxWordCount: 250, requirement: "required" },
    { externalRef: "more-about-you-skill", title: "More About You: a new skill", promptText: "What is a new skill you would like to learn in college?", maxWordCount: 50, requirement: "required" },
    { externalRef: "more-about-you-joy", title: "More About You: what brings you joy", promptText: "What brings you joy?", maxWordCount: 50, requirement: "required" },
    { externalRef: "more-about-you-song", title: "More About You: soundtrack of your life", promptText: "What song represents the soundtrack of your life at this moment?", maxWordCount: 50, requirement: "required" },
  ],
};
