import type { SchoolSourceRecord } from "../types";

export const universityOfRochester: SchoolSourceRecord = {
  schoolName: "University of Rochester",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://admissions.rochester.edu/applying/how-to-apply/",
  retrievedAt: "2026-08-24",
  note: "Rochester's official how-to-apply page explicitly labels this the supplemental essay prompt for the 2026–27 application cycle and says it must be completed as part of the application.",
  prompts: [
    { externalRef: "curiosity-creativity", title: "Combine curiosity, creativity, and Rochester opportunities", promptText: "The University of Rochester is a place where curiosity and creativity meet. How will you combine our academic flexibility and co-curricular opportunities to create an experience that reflects your interests and ambitions?", maxWordCount: 250, requirement: "required" },
  ],
};
