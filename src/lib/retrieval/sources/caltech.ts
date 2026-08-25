import type { SchoolSourceRecord } from "../types";

// Official Caltech Undergraduate Admissions page, explicitly headed
// "Fall 2027 Supplemental Application Essays" and describing these as the
// questions submitted through the Common App or QuestBridge supplement.
export const caltech: SchoolSourceRecord = {
  schoolName: "California Institute of Technology",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.admissions.caltech.edu/apply/first-year-applicants/supplemental-application-essays",
  retrievedAt: "2026-08-24",
  note: "Official Caltech Undergraduate Admissions page explicitly labeled Fall 2027. Applicants answer the academic-interest question, one of the two Scholarly Character options, two of the three Scientific Drive options, and the Fun question; the academic-context response is optional. The same Caltech-specific questions are supplied to eligible QuestBridge applicants.",
  promptGroups: [
    { key: "caltech-scholarly-character", label: "Scholarly Character (choose one)", requiredCount: 1 },
    { key: "caltech-scientific-drive", label: "Scientific Drive (choose two)", requiredCount: 2 },
  ],
  prompts: [
    { externalRef: "academic-interest", title: "Required STEM Academic Interest", promptText: "Why did you choose your proposed area of interest? If you selected 'other', what topics are you interested in pursuing?", minWordCount: 150, maxWordCount: 200, requirement: "required" },
    { externalRef: "scholarly-character-collaboration", title: "Scholarly Character: Collaboration", promptText: "Tell us about a time your learning in STEM was shaped by another person or group — either because you needed help, offered help, changed your thinking through collaboration, or contributed to someone else's understanding. What did that experience teach you about learning and working with others?", maxWordCount: 200, requirement: "optional", groupKey: "caltech-scholarly-character" },
    { externalRef: "scholarly-character-process", title: "Scholarly Character: Process", promptText: "Tell us about a time your approach to a STEM problem, concept, or project mattered as much as the outcome. How did you work through uncertainty or persist creatively in tackling the problem? What would you still defend about your process, regardless of the outcome?", maxWordCount: 200, requirement: "optional", groupKey: "caltech-scholarly-character" },
    { externalRef: "scientific-drive-learning", title: "Scientific Drive: Learning", promptText: "Regardless of your STEM interest listed above, take this opportunity to nerd out and talk to us about whatever STEM rabbit hole you have found yourself falling into. Be as specific or broad as you would like.", maxWordCount: 200, requirement: "optional", groupKey: "caltech-scientific-drive" },
    { externalRef: "scientific-drive-pursuing", title: "Scientific Drive: Pursuing", promptText: "Tell us about a STEM question, problem, idea, or project that has held your attention over time. What drew you to it, how have you pursued it, and what do you still want to understand?", maxWordCount: 200, requirement: "optional", groupKey: "caltech-scientific-drive" },
    { externalRef: "scientific-drive-making", title: "Scientific Drive: Making", promptText: "Tell us about something you created, tested, repaired, modeled, coded, built, or redesigned. What problem were you trying to solve and what did the process reveal to you?", maxWordCount: 200, requirement: "optional", groupKey: "caltech-scientific-drive" },
    { externalRef: "fun-contribution", title: "Fun Question", promptText: "Caltech students bring more than academic ability to the communities they join. What is something you would be excited to do, share, teach, make, start, or contribute as part of the Caltech community?", minWordCount: 100, maxWordCount: 150, requirement: "required" },
    { externalRef: "optional-academic-context", title: "Optional Academic Context", promptText: "Caltech cares about context. Is there anything about your academic preparation, coursework, school context, or learning experiences that would help us better understand your readiness for Caltech?", requirement: "optional" },
  ],
};
