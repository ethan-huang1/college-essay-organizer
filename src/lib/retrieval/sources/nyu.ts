import type { SchoolSourceRecord } from "../types";

export const nyu: SchoolSourceRecord = {
  schoolName: "New York University",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://meet.nyu.edu/advice/application-tips/your-guide-to-the-nyu-supplemental-essay/",
  retrievedAt: "2026-08-24",
  note: "Official NYU Admissions article published August 4, 2026 and explicitly labeled for 2026-27. The optional 250-word response asks applicants to explore bridge-building through one or more of three suggested angles.",
  prompts: [
    {
      externalRef: "bridge-builders",
      title: "Bridge builders",
      promptText: "We are looking for students who want to be bridge builders—students who can connect people, groups, and ideas to span divides, foster understanding, and promote collaboration within a dynamic, interconnected, and vibrant global academic community. We are eager for you to tell us how your experiences have helped you understand what qualities and efforts are needed to bridge divides so that people can better learn and work together. Please consider one or more of these approaches: a time you encountered a different perspective and what you learned; an experience working with people who held different perspectives and the role you played; or someone you observed who helps people think or work together and the qualities you admire.",
      maxWordCount: 250,
      requirement: "optional",
    },
  ],
};
