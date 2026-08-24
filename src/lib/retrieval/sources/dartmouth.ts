import type { SchoolSourceRecord } from "../types";

// Official Dartmouth Admissions writing-supplement page for the Class of
// 2031, updated July 22, 2026. Applicants answer prompt 1, one prompt from
// group 2, and one prompt from group 3.
export const dartmouth: SchoolSourceRecord = {
  schoolName: "Dartmouth College",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://admissions.dartmouth.edu/glossary-term/writing-supplement",
  retrievedAt: "2026-08-24",
  note: "Official Dartmouth Admissions page for the Class of 2031, updated July 22, 2026. All applicants answer the 100-word fit prompt, choose one 250-word prompt from group 2, and choose one 250-word prompt from group 3.",
  prompts: [
    { externalRef: "fit", title: "Dartmouth fit", promptText: "As you seek admission to Dartmouth's Class of 2031, what aspects of the college's academic program, community, and/or campus environment attract your interest? How is Dartmouth a good fit for you?", maxWordCount: 100, requirement: "required" },
    { externalRef: "introduce-environment", title: "Your environment", promptText: "There is a Quaker saying: Let your life speak. Describe the environment in which you were raised and the impact it has had on the person you are today.", maxWordCount: 250, requirement: "conditional", conditionalNote: "Choose one of the two prompts in Dartmouth's second required response group." },
    { externalRef: "introduce-yourself", title: "Introduce yourself", promptText: "\"Be yourself,\" Oscar Wilde advised. \"Everyone else is taken.\" Introduce yourself.", maxWordCount: 250, requirement: "conditional", conditionalNote: "Choose one of the two prompts in Dartmouth's second required response group." },
    { externalRef: "personal-excitement", title: "What excites you?", promptText: "What excites you?", maxWordCount: 250, requirement: "conditional", conditionalNote: "Choose one of the six prompts in Dartmouth's third required response group." },
    { externalRef: "personal-impact", title: "A life of purpose", promptText: "Labor leader and civil rights activist Dolores Huerta recommended a life of purpose. \"We must use our lives to make the world a better place to live, not just to acquire things,\" she said. \"That is what we are put on the earth for.\" In what ways do you hope to make—or are you already making—an impact? Why? How?", maxWordCount: 250, requirement: "conditional", conditionalNote: "Choose one of the six prompts in Dartmouth's third required response group." },
    { externalRef: "personal-reading", title: "Insight from reading", promptText: "In an Instagram post, best-selling British author Matt Haig cheered the impact of reading. \"A good novel is the best invention humans have ever created for imagining other lives,\" he wrote. How have you experienced such insight from reading? What did you read and how did it alter the way you understand yourself and others?", maxWordCount: 250, requirement: "conditional", conditionalNote: "Choose one of the six prompts in Dartmouth's third required response group." },
    { externalRef: "personal-dialogue", title: "Finding common ground", promptText: "The social and family interactions of wild chimpanzees have been the focus of Dame Jane Goodall's research for decades. Her understanding of animal behavior prompted the English primatologist to see a lesson for human communities as well: \"Change happens by listening and then starting a dialogue with the people who are doing something you don't believe is right.\" Channel Dame Goodall: Tell us about a moment when you engaged in a difficult conversation or encountered someone with an opinion or perspective that was different from your own. How did you find common ground?", maxWordCount: 250, requirement: "conditional", conditionalNote: "Choose one of the six prompts in Dartmouth's third required response group." },
    { externalRef: "personal-nerdy-side", title: "Celebrate your nerdy side", promptText: "Celebrate your nerdy side.", maxWordCount: 250, requirement: "conditional", conditionalNote: "Choose one of the six prompts in Dartmouth's third required response group." },
    { externalRef: "personal-difference", title: "Embracing difference", promptText: "\"It's not easy being green…\" was the frequent refrain of Kermit the Frog. How has difference been a part of your life, and how have you embraced it as part of your identity, outlook, or sense of purpose?", maxWordCount: 250, requirement: "conditional", conditionalNote: "Choose one of the six prompts in Dartmouth's third required response group." },
  ],
};
