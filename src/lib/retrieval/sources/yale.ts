import type { SchoolSourceRecord } from "../types";

// Official Yale Admissions "Essay Topics" page, explicitly labeled
// "2026-2027." Includes a genuine character-limited prompt type ("Short
// Takes," 200 characters) alongside word-limited ones, and a real "answer
// one of three" essay pool (modeled as optional with the choice explained
// in this record's note, same pattern as the UC PIQs).
export const yale: SchoolSourceRecord = {
  schoolName: "Yale University",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://admissions.yale.edu/essay-topics",
  retrievedAt: "2026-08-24",
  note: "Official Yale Admissions \"Essay Topics\" page, explicitly labeled \"2026-2027.\" The three \"Choose One\" essays are all imported as optional - answer exactly one of the three.",
  prompts: [
    { externalRef: "short-answer-academic-interests", title: "Academic interests", promptText: "Students at Yale have time to explore their academic interests before committing to one or more major fields of study. Many students either modify their original academic direction or change their minds entirely. As of this moment, what academic areas seem to fit your interests or goals most comfortably? Please indicate up to three from the list provided.", maxWordCount: 200, requirement: "required" },
    { externalRef: "short-answer-topic-excites", title: "A topic or idea that excites you", promptText: "Tell us about a topic or idea that excites you and is related to one or more academic areas you selected above.", maxWordCount: 200, requirement: "required" },
    { externalRef: "short-take-teach-write-create", title: "Short Take: teach, write, or create", promptText: "If you could teach any college course, write a book, or create an original piece of art of any kind, what would it be?", maxCharCount: 200, requirement: "required" },
    { externalRef: "short-take-grow-develop", title: "Short Take: grow or develop", promptText: "What is one aspect of yourself that you hope to grow or develop during college?", maxCharCount: 200, requirement: "required" },
    { externalRef: "short-take-not-elsewhere", title: "Short Take: not included elsewhere", promptText: "What is something about you that is not included anywhere else in your application?", maxCharCount: 200, requirement: "required" },
    { externalRef: "essay-opposing-view", title: "Choose One: an opposing view", promptText: "Reflect on a time you discussed an issue important to you with someone holding an opposing view. Why did you find the experience meaningful?", maxWordCount: 400, requirement: "optional" },
    { externalRef: "essay-community", title: "Choose One: a meaningful community", promptText: "Reflect on your membership in a community to which you feel connected. Why is this community meaningful to you? You may define community however you like.", maxWordCount: 400, requirement: "optional" },
    { externalRef: "essay-personal-experience", title: "Choose One: personal experience", promptText: "Reflect on an element of your personal experience that you feel will enrich your college. How has it shaped you?", maxWordCount: 400, requirement: "optional" },
  ],
};
