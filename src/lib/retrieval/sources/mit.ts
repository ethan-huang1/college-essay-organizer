import type { SchoolSourceRecord } from "../types";

// Official MIT Admissions page, explicitly labeled "2026-2027 Cycle."
export const mit: SchoolSourceRecord = {
  schoolName: "Massachusetts Institute of Technology",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "school-specific",
  sourceUrl: "https://mitadmissions.org/apply/firstyear/essays-activities-academics/",
  retrievedAt: "2026-08-24",
  note: "Official MIT Admissions page, explicitly labeled \"2026-2027 Cycle.\" MIT uses its own application portal, not Common App.",
  prompts: [
    { externalRef: "essay-field-of-study", title: "Field of study that appeals to you", promptText: "What field of study appeals to you the most right now? (Note: Applicants select from a drop-down list.) Reflect on what has led to this interest.", minWordCount: 100, maxWordCount: 200, requirement: "required" },
    { externalRef: "essay-own-trail", title: "Your own trail", promptText: "While some reach their goals following well-trodden paths, others blaze their own trails achieving the unexpected. In what ways have you done something different than what was expected in your educational journey?", minWordCount: 100, maxWordCount: 200, requirement: "required" },
    { externalRef: "essay-mit-impact", title: "Problems you want to tackle at MIT", promptText: "How have your personal and academic experiences influenced the types of problems you would want to tackle with an MIT education and the impact you aim to make on your community?", minWordCount: 100, maxWordCount: 200, requirement: "required" },
    { externalRef: "essay-unexpected-challenge", title: "An unexpected challenge", promptText: "How did you manage a situation or challenge that you didn't expect? What did you learn from it?", minWordCount: 100, maxWordCount: 200, requirement: "required" },
    { externalRef: "short-answer-fun", title: "Just for fun", promptText: "What do you do just for fun?", maxWordCount: 50, requirement: "required" },
    { externalRef: "short-answer-admire", title: "Someone you admire", promptText: "Who is someone you admire, whether you know them personally or look up to them from afar? Tell us why.", maxWordCount: 50, requirement: "required" },
    { externalRef: "short-answer-topic", title: "A topic you could talk about for hours", promptText: "What's a topic, academic or non-academic, that you could talk about for hours?", maxWordCount: 50, requirement: "required" },
    { externalRef: "short-answer-generalist", title: "Generalist or specialist", promptText: "MIT values both \"generalists\" with varied interests and \"specialists\" who focus deeply on one or a few passions. Which do you think best describes you, and why?", maxWordCount: 50, requirement: "required" },
  ],
};
