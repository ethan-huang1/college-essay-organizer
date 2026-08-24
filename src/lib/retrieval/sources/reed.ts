import type { SchoolSourceRecord } from "../types";

// Reed's live official application page requires and publishes one writing
// supplement for current first-year applicants.
export const reed: SchoolSourceRecord = {
  schoolName: "Reed College",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.reed.edu/admission-aid/how-to-apply/",
  retrievedAt: "2026-08-24",
  note: "Official Reed College live application requirements for the active 2026–27 application, retrieved after applications opened in August 2026. Reed requires one writing supplement of up to 500 words through Common App or Coalition and publishes the prompt verbatim.",
  prompts: [
    {
      externalRef: "paideia-class",
      title: "A Paideia class",
      promptText: "For one week at the end of January, Reed students upend the traditional classroom hierarchy and teach classes about any topic they love, academic or otherwise. This week is known as Paideia, after the Greek term signifying “education”—the complete education of mind, body, and spirit. What would you teach that would contribute to the Reed community?",
      maxWordCount: 500,
      requirement: "required",
    },
  ],
};
