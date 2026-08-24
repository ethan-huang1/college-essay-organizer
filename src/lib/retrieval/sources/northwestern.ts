import type { SchoolSourceRecord } from "../types";

// Official Northwestern admissions requirements page, explicitly labeled
// 2026-27 and Class of 2031.
export const northwestern: SchoolSourceRecord = {
  schoolName: "Northwestern University",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://admissions.northwestern.edu/apply/requirements.html",
  retrievedAt: "2026-08-24",
  note: "Official Northwestern Undergraduate Admissions requirements page, explicitly labeled \"Northwestern 2026-27 First-Year Writing Supplements\" for the Class of 2031. The 300-word background response is required for Common App and Coalition/Scoir applicants but optional for QuestBridge applicants; applicants are encouraged to answer one or two of the five responses whose stated limit is fewer than 200 words.",
  prompts: [
    { externalRef: "required-personal-context", title: "Personal context and Northwestern", promptText: "We want to be sure we’re considering your application in the context of your personal experiences: What aspects of your background (your identity, your school setting, your community, your household, etc.) have most shaped how you see yourself engaging in Northwestern’s community, be it academically, extracurricularly, culturally, politically, socially, or otherwise?", maxWordCount: 300, requirement: "required" },
    { externalRef: "optional-the-rock", title: "Painting The Rock", promptText: "Painting “The Rock” is a tradition at Northwestern that invites all forms of expression—students promote campus events or extracurricular groups, support social or activist causes, show their Wildcat spirit (what we call “Purple Pride”), celebrate their culture, and more. What would you paint on The Rock, and why?", maxWordCount: 199, requirement: "optional" },
    { externalRef: "optional-interdisciplinary-project", title: "An interdisciplinary project", promptText: "Northwestern fosters a distinctively interdisciplinary culture. We believe discovery and innovation thrive at the intersection of diverse ideas, perspectives, and academic interests. Within this setting, if you could dream up an undergraduate class, research project, or creative effort (a start-up, a design prototype, a performance, etc.), what would it be? Who might be some ideal classmates or collaborators?", maxWordCount: 199, requirement: "optional" },
    { externalRef: "optional-community-belonging", title: "Community and belonging", promptText: "Community and belonging matter at Northwestern. Tell us about one or more communities, networks, or student groups you see yourself connecting with on campus.", maxWordCount: 199, requirement: "optional" },
    { externalRef: "optional-location", title: "Northwestern's location", promptText: "Northwestern’s location is special: on the shore of Lake Michigan, steps from downtown Evanston, just a few miles from Chicago. What aspects of our location are most compelling to you, and why?", maxWordCount: 199, requirement: "optional" },
    { externalRef: "optional-diverse-perspectives", title: "Diverse perspectives", promptText: "Northwestern is a place where people with diverse backgrounds from all over the world can study, live, and talk with one another. This range of experiences and viewpoints immeasurably enriches learning. How might your individual background contribute to this diversity of perspectives in Northwestern’s classrooms and around our campus?", maxWordCount: 199, requirement: "optional" },
  ],
};
