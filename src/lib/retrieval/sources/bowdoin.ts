import type { SchoolSourceRecord } from "../types";

// The live official application page publishes both optional prompts. Its
// 2027-28 aid requirements identify it as the active Fall 2027 application.
export const bowdoin: SchoolSourceRecord = {
  schoolName: "Bowdoin College",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.bowdoin.edu/admissions/apply/",
  retrievedAt: "2026-08-24",
  note: "Official Bowdoin Admissions application page for the active Fall 2027 application cycle (the live page includes 2027–28 aid requirements). It publishes two optional Bowdoin Supplement essays verbatim, each with a 250-word maximum. The supplement is available through Common App, Coalition on Scoir, and QuestBridge; Common App is recorded as the primary platform metadata.",
  prompts: [
    {
      externalRef: "offer-of-the-college",
      title: "The Offer of the College",
      promptText: "Generations of students have found connection and meaning in Bowdoin’s “The Offer of the College,” written in 1906 by Bowdoin President William DeWitt Hyde. Which line from The Offer resonates most with you?",
      maxWordCount: 250,
      requirement: "optional",
    },
    {
      externalRef: "navigating-through-differences",
      title: "Navigating through differences",
      promptText: "Bowdoin believes that its broadly diverse and inclusive campus community prepares graduates to be contributing and useful citizens of the world. Every graduate of this institution should be confident in their preparation to be able to navigate through differences and in all sorts of situations. A Bowdoin education does not guarantee these skills, but it does impart a set of tools necessary to bravely enter unfamiliar conditions with the confidence to deal effectively with ambiguity. If you wish, you may share anything about the unique experiences and perspectives that you would bring with you to the Bowdoin campus and community or an experience you have had that required you to navigate across or through difference.",
      maxWordCount: 250,
      requirement: "optional",
    },
  ],
};
