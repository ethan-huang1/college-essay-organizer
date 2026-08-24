import type { SchoolSourceRecord } from "../types";

export const rice: SchoolSourceRecord = {
  schoolName: "Rice University",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "questbridge",
  sourceUrl: "https://admission.rice.edu/apply/questbridge-applicants",
  retrievedAt: "2026-08-24",
  note: "Official Rice admission page explicitly labels these Essay Prompts 2026-2027. Two 150-word responses are required and applicants may answer one of two optional 500-word community prompts. The public QuestBridge page was used to verify the wording; equivalent Rice questions should be checked in the applicant's chosen platform.",
  prompts: [
    { externalRef: "academic-areas", title: "Academic areas at Rice", promptText: "Please explain what draws you to the academic areas you selected above and how you hope to explore them at Rice University.", maxWordCount: 150, requirement: "required" },
    { externalRef: "rice-experience", title: "The Rice experience", promptText: "Based upon your exploration of Rice University, what elements of the Rice experience appeal to you?", maxWordCount: 150, requirement: "required" },
    { externalRef: "community-residential-college", title: "Residential College perspectives", promptText: "The Residential College System is at the heart of Rice student life and is heavily influenced by the particular cultural traditions and unique life experiences each student brings. What life experiences and/or unique perspectives are you looking forward to sharing with fellow Owls in the residential college system?", maxWordCount: 500, requirement: "conditional", conditionalNote: "Optional; choose this or the alternate Rice community prompt." },
    { externalRef: "community-change-agents", title: "Joining a community of change agents", promptText: "Rice is strengthened by its diverse community of learning and discovery that produces leaders and change agents across the spectrum of human endeavor. What perspectives shaped by your background, experiences, upbringing, and/or cultural identity inspire you to join our community of change agents at Rice?", maxWordCount: 500, requirement: "conditional", conditionalNote: "Optional; choose this or the alternate Rice community prompt." },
  ],
};
