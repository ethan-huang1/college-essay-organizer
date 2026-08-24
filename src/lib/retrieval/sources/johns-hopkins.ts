import type { SchoolSourceRecord } from "../types";

export const johnsHopkins: SchoolSourceRecord = {
  schoolName: "Johns Hopkins University",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://apply.jhu.edu/hopkins-insider/advice-for-crafting-your-supplemental-essay/",
  retrievedAt: "2026-08-24",
  note: "Official Johns Hopkins Admissions article dated August 3, 2026 and explicitly labeled as the 2026-2027 supplemental essay. Hopkins requires this response in addition to the personal statement.",
  prompts: [
    {
      externalRef: "engaging-across-differences",
      title: "Engaging across differences and building bridges",
      promptText: "At Johns Hopkins, community is built through dialogue, collaboration, and a willingness to engage across differences. Whether on campus or in the broader world, community depends on bridge builders who can listen to differing perspectives, challenge their own assumptions, or work together toward shared goals. Drawing on your own experiences, what have you learned about engaging across differences and how has it shaped the way you think about building bridges, enhancing community, and working with others?",
      maxWordCount: 350,
      requirement: "required",
    },
  ],
};
