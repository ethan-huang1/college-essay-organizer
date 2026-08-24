import type { SchoolSourceRecord } from "../types";

// Fetched directly from Stanford's official admissions page. The page
// itself doesn't print a cycle label, so "officially-verified" here rests
// on official-source + recency (fetched during the window 2026-27
// supplements are published), not an explicit "2026-27" string on the page.
export const stanford: SchoolSourceRecord = {
  schoolName: "Stanford University",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://admission.stanford.edu/apply/first-year/apply.html",
  retrievedAt: "2026-08-24",
  note: "Official Stanford admissions page, last updated July 21, 2026; the page itself does not print a cycle label, so this is inferred from recency plus the official source.",
  prompts: [
    { externalRef: "short-essay-learning", title: "Genuinely excited about learning", promptText: "The Stanford community is deeply curious and driven to learn in and out of the classroom. Reflect on an idea or experience that makes you genuinely excited about learning.", minWordCount: 100, maxWordCount: 250, requirement: "required" },
    { externalRef: "short-essay-roommate", title: "Note to your future roommate", promptText: "Virtually all of Stanford's undergraduates live on campus. Write a note to your future roommate that reveals something about you or that will help your roommate—and us—get to know you better.", minWordCount: 100, maxWordCount: 250, requirement: "required" },
    { externalRef: "short-essay-contribution", title: "Distinctive contribution", promptText: "Please describe what aspects of your life experiences, interests, and character would help you make a distinctive contribution as an undergraduate to Stanford University.", minWordCount: 100, maxWordCount: 250, requirement: "required" },
    { externalRef: "short-answer-challenge", title: "Significant challenge society faces", promptText: "What is the most significant challenge that society faces today?", maxWordCount: 50, requirement: "required" },
    { externalRef: "short-answer-summers", title: "Last two summers", promptText: "How did you spend your last two summers?", maxWordCount: 50, requirement: "required" },
    { externalRef: "short-answer-historical-moment", title: "Historical moment you wish you'd witnessed", promptText: "What historical moment or event do you wish you could have witnessed?", maxWordCount: 50, requirement: "required" },
    { externalRef: "short-answer-activity", title: "An extracurricular, job, or responsibility", promptText: "Briefly elaborate on one of your extracurricular activities, a job you hold, or responsibilities you have for your family.", maxWordCount: 50, requirement: "required" },
    { externalRef: "short-answer-five-things", title: "Five things that matter to you", promptText: "List five things that are important to you.", maxWordCount: 50, requirement: "required" },
  ],
};
