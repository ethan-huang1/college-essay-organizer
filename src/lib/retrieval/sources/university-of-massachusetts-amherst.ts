import type { SchoolSourceRecord } from "../types";

// Official UMass Amherst admissions workshop material published in September
// 2025 for FY26/Fall 2026 applicants. The current application instructions do
// not publish 2026-27 custom-question wording, so these remain previous-cycle.
export const universityOfMassachusettsAmherst: SchoolSourceRecord = {
  schoolName: "University of Massachusetts Amherst",
  cycleLabel: "2025–26",
  verificationStatus: "previous-cycle",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.umass.edu/sites/default/files/2025-09/FY26AdmissionsUREPUMassReadySetApply_EmpoweringVoiceEssay_FINAL_a11y.pdf",
  retrievedAt: "2026-08-24",
  note: "Official UMass Amherst Admissions 'Empowering Your Voice' workshop PDF, published September 2025 for the FY26/Fall 2026 application. It prints three UMass custom questions at 100 words each. The live 2026–27 first-year instructions confirm UMass still uses Common App but do not publish current custom-question wording, so these are imported as previous-cycle planning prompts and must not be treated as current requirements.",
  prompts: [
    {
      externalRef: "custom-why-major",
      title: "Why this major?",
      promptText: "Please tell us: Why did you choose this major(s)?",
      maxWordCount: 100,
      requirement: "required",
    },
    {
      externalRef: "custom-why-umass",
      title: "Why UMass Amherst?",
      promptText: "Please tell us: Why do you want to attend UMass Amherst?",
      maxWordCount: 100,
      requirement: "required",
    },
    {
      externalRef: "custom-community",
      title: "Community and contribution",
      promptText: "At UMass Amherst, no two students are alike. Our communities and groups often define us and shape our individual worlds. Community can refer to various aspects, including shared geography, religion, race/ethnicity, income, ideology, and more. Please choose one of your communities or groups and describe its significance. Explain how, as a product of this community or group, you would enrich our campus.",
      maxWordCount: 100,
      requirement: "required",
    },
  ],
};
