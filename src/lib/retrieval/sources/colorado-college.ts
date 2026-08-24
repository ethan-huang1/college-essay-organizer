import type { SchoolSourceRecord } from "../types";

// Official Colorado College admission page, explicitly labeled 2026-27 and
// last updated August 3, 2026.
export const coloradoCollege: SchoolSourceRecord = {
  schoolName: "Colorado College",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.coloradocollege.edu/admission/apply/supplemental-essay.html",
  retrievedAt: "2026-08-24",
  note: "Official Colorado College admission page, explicitly labeled \"2026-27 Essay Prompt\" and last updated August 3, 2026. The page emphasizes that the response is genuinely optional.",
  prompts: [
    {
      externalRef: "optional-deep-focus",
      title: "The luxury of focus",
      promptText: "One of the benefits of Colorado College’s Block Plan is the opportunity to immerse yourself fully in a single subject for 3.5 weeks. We see this as the luxury of focus—the joy and value of directing your full attention to one thing. Tell us about a time when you experienced this kind of deep focus in an academic or extracurricular setting. What were you doing, and how did it turn out?",
      maxWordCount: 300,
      requirement: "optional",
    },
  ],
};
