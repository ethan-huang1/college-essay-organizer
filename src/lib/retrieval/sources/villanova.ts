import type { SchoolSourceRecord } from "../types";

// Villanova's official writing-supplement page explicitly labels these as the
// 2026-2027 prompts. Every applicant chooses one prompt and writes about 250
// words; "about" is guidance rather than a hard maximum, so no numeric maximum
// is asserted below.
export const villanova: SchoolSourceRecord = {
  schoolName: "Villanova University",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.villanova.edu/university/undergraduate-admission/applying-to-villanova/application-essays.html",
  retrievedAt: "2026-08-24",
  note: "Official Villanova Undergraduate Admission page explicitly labeled \"Villanova Writing Supplement (2026-2027).\" Applicants using either the Common Application or Coalition Application must choose one of five Villanova prompts and respond in about 250 words; because the university describes that length as approximate, no hard maximum is encoded.",
  prompts: [
    {
      externalRef: "supplement-equity-justice",
      title: "Advancing equity and justice",
      promptText: "As Pope Leo XIV (Villanova Class of 1977) has said, “no one can single-handedly bear the weight of the challenges the world is facing, just as no one is so weak that they cannot play their part.” What have you done to play your part in advancing equity and justice in your community?",
      requirement: "conditional",
      conditionalNote: "Required writing supplement; choose one of Villanova's five prompts and respond in about 250 words.",
    },
    {
      externalRef: "supplement-life-lesson",
      title: "A lesson in life",
      promptText: "What is a lesson in life that you have learned that you would want to share with others at Villanova?",
      requirement: "conditional",
      conditionalNote: "Required writing supplement; choose one of Villanova's five prompts and respond in about 250 words.",
    },
    {
      externalRef: "supplement-new-home",
      title: "Villanova as your new home",
      promptText: "\"Villanova\" means \"new home.\" Why do you want to call Villanova your new home?",
      requirement: "conditional",
      conditionalNote: "Required writing supplement; choose one of Villanova's five prompts and respond in about 250 words.",
    },
    {
      externalRef: "supplement-ai-common-good",
      title: "Technology and the common good",
      promptText: "Villanova embraces Artificial Intelligence (AI) with a commitment to thoughtful, ethical use rooted in our Augustinian mission and values. How do you see technology helping you to lead, serve, and contribute to the common good?",
      requirement: "conditional",
      conditionalNote: "Required writing supplement; choose one of Villanova's five prompts and respond in about 250 words.",
    },
    {
      externalRef: "supplement-borrowed-strength",
      title: "Someone borrowing your strength",
      promptText: "At Villanova, we often say \"each of us strengthens all of us.\" Please detail a time when someone has borrowed some of your strength in their time of need.",
      requirement: "conditional",
      conditionalNote: "Required writing supplement; choose one of Villanova's five prompts and respond in about 250 words.",
    },
  ],
};
