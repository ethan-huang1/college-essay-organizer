import type { SchoolSourceRecord } from "../types";

// Pitzer's live first-year page publishes both alternatives, and its official
// Fall 2026 Preview Pitzer application explicitly says that the same essay is
// used for the Common Application supplement.
export const pitzer: SchoolSourceRecord = {
  schoolName: "Pitzer College",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.pitzer.edu/admission-aid/how-apply/first-year-applicants",
  retrievedAt: "2026-08-24",
  note: "Pitzer's official live first-year page requires applicants to choose one of these two prompts in no more than 650 words. The page itself does not print a cycle label; Pitzer's official Fall 2026 Preview application corroborates the wording and explicitly says it is the same prompt used for the Common Application supplement.",
  prompts: [
    { externalRef: "core-values", title: "Engaging with a Pitzer core value", promptText: "At Pitzer, five core values distinguish our approach to education: social responsibility, intercultural understanding, interdisciplinary learning, student engagement, and environmental sustainability. As agents of change, our students utilize these values to create solutions to our world’s challenges. Reflecting on your involvement throughout high school or within the community, how have you engaged with one of Pitzer’s core values?", maxWordCount: 650, requirement: "conditional", conditionalNote: "Choose one of Pitzer's two required writing-supplement prompts." },
    { externalRef: "college-fit", title: "Your college experience and Pitzer fit", promptText: "At Pitzer, five core values distinguish our approach to education: social responsibility, intercultural understanding, interdisciplinary learning, student engagement, and environmental sustainability. As agents of change, our students utilize these values to create solutions to our world’s challenges. Describe what you are looking for from your college experience and why Pitzer would be a good fit for you.", maxWordCount: 650, requirement: "conditional", conditionalNote: "Choose one of Pitzer's two required writing-supplement prompts." },
  ],
};
