import type { SchoolSourceRecord } from "../types";

// Official Amherst Admission form for the 2027 QuestBridge Regular Decision
// supplement. The form is due January 5, 2027 and says the same supplementary
// writing requirement applies to all Amherst applicants. Option A asks the
// applicant to choose one of these three prompts; Options B (a graded paper)
// and C (reuse of an A2A essay) do not ask the applicant to write a new essay.
export const amherst: SchoolSourceRecord = {
  schoolName: "Amherst College",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "questbridge",
  sourceUrl: "https://admission.amherst.edu/register/qbrdsupplement",
  retrievedAt: "2026-08-24",
  note: "Official Amherst College 2027 QuestBridge Regular Decision Supplement, due January 5, 2027. The form states that Amherst requires a supplemental writing submission from all applicants and offers three ways to satisfy it: choose one Option A prompt, submit a graded paper (Option B), or, for eligible Access to Amherst applicants, reuse the A2A essay (Option C). Only the three prompts that ask for a new response are imported here. Platform metadata is QuestBridge because that is the official public form used to verify the wording.",
  prompts: [
    {
      externalRef: "option-a-curiosity",
      title: "Option A: Curiosity",
      promptText: "\"Hope and curiosity — these are qualities that are the foundation of what Amherst College means, of everything that we do here. Curiosity is at the core of a liberal arts education — a spirit of inquiry that shapes not only what our students do in the classroom, but also how they learn from and about each other.\" — Michael A. Elliott, 20th President of Amherst College, address at Amherst College’s 203rd Commencement. What does curiosity mean to you? How do you experience curiosity in your own life?",
      maxWordCount: 350,
      requirement: "conditional",
      conditionalNote: "Applies only when using Option A to satisfy Amherst's writing supplement; choose one of the three Option A prompts.",
    },
    {
      externalRef: "option-a-unique-experiences",
      title: "Option A: Unique experiences",
      promptText: "\"We seek an Amherst made stronger because it includes those whose experiences can enhance our understanding of our nation and our world. We do so in the faith that our humanity is an identity forged from diversity, and that our different perspectives enrich our inquiry, deepen our knowledge, strengthen our community, and prepare students to engage with an ever-changing world.\" — from the Trustee Statement on Diversity and Community. In what ways could your unique experiences enhance our understanding of our nation and our world?",
      maxWordCount: 350,
      requirement: "conditional",
      conditionalNote: "Applies only when using Option A to satisfy Amherst's writing supplement; choose one of the three Option A prompts. Eligible A2A applicants may instead reuse their A2A response through Option C.",
    },
    {
      externalRef: "option-a-differing-viewpoint",
      title: "Option A: Disagreement and connection",
      promptText: "\"We are working together to build a community that makes room for both true disagreement and true connection, one that practices the kind of recognition and robust negotiation that the everyday life of democracy requires, and one that explicitly prepares our students to work for the greater good in their professional and personal endeavors.\" — Presidential Priorities: Serving the Greater Good. Tell us about a time that you engaged with a viewpoint different from your own. How did you enter that engagement, and what did you learn about yourself from it?",
      maxWordCount: 350,
      requirement: "conditional",
      conditionalNote: "Applies only when using Option A to satisfy Amherst's writing supplement; choose one of the three Option A prompts.",
    },
  ],
};
