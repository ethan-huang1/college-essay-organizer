import type { SchoolSourceRecord } from "../types";

export const universityOfRichmond: SchoolSourceRecord = {
  schoolName: "University of Richmond",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.admissions.richmond.edu/process/materials/index.html",
  retrievedAt: "2026-08-24",
  note: "Richmond's official application-materials page explicitly labels these as the 2026–27 Richmond Question options. Applicants choose one response, with a 350-word minimum and 650-word maximum.",
  prompts: [
    { externalRef: "relentlessly-welcoming", title: "Make a space more welcoming", promptText: "Richmond is a community that strives to be relentlessly welcoming. Tell us about a time you made a space better for other people by helping them feel welcome, heard, included, or supported.", minWordCount: 350, maxWordCount: 650, requirement: "conditional", conditionalNote: "Choose one of the three required Richmond Question prompts." },
    { externalRef: "ideas-into-actions", title: "Turn ideas into actions", promptText: "Richmond students turn ideas into actions. Tell us about a time you learned by doing, making, building, testing, helping, or leading and what that experience taught you about yourself, the world, or the kind of impact you want to have.", minWordCount: 350, maxWordCount: 650, requirement: "conditional", conditionalNote: "Choose one of the three required Richmond Question prompts." },
    { externalRef: "unique-spider", title: "Your unique mark on a Spider community", promptText: "Richmond’s mascot is the Spider. Just as you are unique, this singular mascot represents over 52,680 unique species of spiders. Tell us about the communities, experiences, or ambitions that have shaped you into the unique person you are and how you will make your mark as part of a Spider community.", minWordCount: 350, maxWordCount: 650, requirement: "conditional", conditionalNote: "Choose one of the three required Richmond Question prompts." },
  ],
};
