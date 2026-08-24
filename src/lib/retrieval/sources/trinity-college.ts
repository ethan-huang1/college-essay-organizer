import type { SchoolSourceRecord } from "../types";

// Trinity's official Application Process page publishes one optional prompt and
// explicitly labels the page's application calendar "2026-27 Deadlines."
export const trinityCollege: SchoolSourceRecord = {
  schoolName: "Trinity College",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.trincoll.edu/admissions/undergraduate-admissions/application-process/",
  retrievedAt: "2026-08-24",
  note: "Official Trinity College application page, explicitly accompanied by '2026-27 Deadlines.' It publishes one optional Trinity-specific essay with a limit of less than 300 words. The structured maximum is 299 to preserve that exclusive limit.",
  prompts: [
    {
      externalRef: "background-at-trinity",
      title: "Background and the Trinity community",
      promptText: "The identities you claim, the challenges you face, and the successes you enjoy shape the background for your college experience to come. What is an aspect of your background that you are excited to share and/or explore as a member of the Trinity community and why?",
      maxWordCount: 299,
      requirement: "optional",
    },
  ],
};
