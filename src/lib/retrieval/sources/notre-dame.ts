import type { SchoolSourceRecord } from "../types";

// Notre Dame's live official Application Overview publishes the complete
// writing section: one required 150-word response and two responses chosen
// from four 50-100-word questions.
export const notreDame: SchoolSourceRecord = {
  schoolName: "University of Notre Dame",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://admissions.nd.edu/apply/application-overview/",
  retrievedAt: "2026-08-24",
  note: "Official Notre Dame Undergraduate Admissions Application Overview for the active application, retrieved in August 2026. It publishes one required 150-word essay and four short-answer options, of which applicants choose two (50–100 words each). The supplement is available through Common App and Coalition; QuestBridge applicants use Notre Dame's corresponding supplement.",
  prompts: [
    {
      externalRef: "required-non-negotiables",
      title: "College-search non-negotiables",
      promptText: "Everyone has different priorities when considering their higher education options and building their college or university list. Tell us about your “non-negotiable” factor(s) when searching for your future college home.",
      maxWordCount: 150,
      requirement: "required",
    },
    {
      externalRef: "choice-faith",
      title: "Faith and decisions",
      promptText: "How does faith influence the decisions you make?",
      minWordCount: 50,
      maxWordCount: 100,
      requirement: "conditional",
      conditionalNote: "Choose two of the four Notre Dame short-answer options.",
    },
    {
      externalRef: "choice-personal-experiences",
      title: "Distinctive personal experiences",
      promptText: "What is distinctive about your personal experiences and development (eg, family support, culture, disability, personal background, community)? Why are these experiences important to you and how will you enrich the Notre Dame community?",
      minWordCount: 50,
      maxWordCount: 100,
      requirement: "conditional",
      conditionalNote: "Choose two of the four Notre Dame short-answer options.",
    },
    {
      externalRef: "choice-service",
      title: "Service to others",
      promptText: "Notre Dame’s undergraduate experience is characterized by a collective sense of care for every person. How do you foster service to others in your community?",
      minWordCount: 50,
      maxWordCount: 100,
      requirement: "conditional",
      conditionalNote: "Choose two of the four Notre Dame short-answer options. QuestBridge applicants answer this as their second Notre Dame supplement question.",
    },
    {
      externalRef: "choice-fight-for",
      title: "What would you fight for?",
      promptText: "What would you fight for?",
      minWordCount: 50,
      maxWordCount: 100,
      requirement: "conditional",
      conditionalNote: "Choose two of the four Notre Dame short-answer options.",
    },
  ],
};
