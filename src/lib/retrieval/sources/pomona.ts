import type { SchoolSourceRecord } from "../types";

export const pomona: SchoolSourceRecord = {
  schoolName: "Pomona College",
  cycleLabel: "2025–26",
  verificationStatus: "previous-cycle",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.pomona.edu/admissions/apply",
  retrievedAt: "2026-08-24",
  note: "Pomona's official application page still explicitly labels these as the prompts for Fall 2026 admission. They are imported as 2025-26 previous-cycle planning material, not current requirements, and must be rechecked when Pomona publishes Fall 2027 wording.",
  prompts: [
    { externalRef: "academic-interest", title: "Academic interest", promptText: "What draws you to the subject(s) you selected as potential major(s)? If undecided, share more about one of your academic passions or interests.", maxWordCount: 150, requirement: "required" },
    { externalRef: "short-response-community-values", title: "Community values and perspectives", promptText: "Reflecting on a community that you are a part of, what values or perspectives from that community would you bring to Pomona?", maxWordCount: 250, requirement: "conditional", conditionalNote: "Choose one of the three Pomona short-response options." },
    { externalRef: "short-response-outside-classroom", title: "An experience outside the classroom", promptText: "Describe an experience you had outside the classroom that changed the way you think and/or how you engage with your peers. What was that experience and what did you learn from it?", maxWordCount: 250, requirement: "conditional", conditionalNote: "Choose one of the three Pomona short-response options." },
    { externalRef: "short-response-how-others-see-you", title: "How others would describe you", promptText: "Choose any person or group of people in your life and share how they would describe you.", maxWordCount: 250, requirement: "conditional", conditionalNote: "Choose one of the three Pomona short-response options." },
  ],
};
