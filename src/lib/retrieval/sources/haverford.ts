import type { SchoolSourceRecord } from "../types";

export const haverford: SchoolSourceRecord = {
  schoolName: "Haverford College",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.haverford.edu/admission/supplement",
  retrievedAt: "2026-08-24",
  note: "Official Haverford supplement page, checked while the admissions site was serving Fall 2027 applicant information. Both required Haverford-specific responses are published with 150-200 word limits.",
  prompts: [
    {
      externalRef: "intellectual-curiosity-at-haverford",
      title: "Intellectual curiosity at Haverford",
      promptText: "Tell us about a topic or issue that sparks your curiosity and gets you intellectually excited. How do you hope to engage with this topic or issue at Haverford?",
      minWordCount: 150,
      maxWordCount: 200,
      requirement: "required",
    },
    {
      externalRef: "community-values-and-honor-code",
      title: "Community values and the Honor Code",
      promptText: "We have highlighted for you some of the values that shape the Haverford community. What are some of the values you seek in your next community? How do Haverford’s values, as demonstrated through our Honor Code, resonate with you? As you think about how to answer this question, you might draw from how you have been influenced by other communities you have been a part of, experiences you may have had within your communities, or opportunities you have had to shape or even change your communities.",
      minWordCount: 150,
      maxWordCount: 200,
      requirement: "required",
    },
  ],
};
