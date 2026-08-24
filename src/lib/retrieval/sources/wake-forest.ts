import type { SchoolSourceRecord } from "../types";

// Wake Forest's July 22, 2026 admissions announcement explicitly describes the
// 2026-2027 cycle, including the required Why Wake response and the optional
// written supplement's choose-one structure.
export const wakeForest: SchoolSourceRecord = {
  schoolName: "Wake Forest University",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://admissions.wfu.edu/2026/07/wake-forest-applications-open-august-1-heres-whats-new/",
  retrievedAt: "2026-08-24",
  note: "Official Wake Forest Undergraduate Admissions announcement dated July 22, 2026, explicitly describing the 2026-2027 admissions cycle. The Why Wake response is required. The written supplement is optional; applicants who elect it choose one of four prompts. Wake Forest accepts both the Common Application and Coalition Application. Per-item and per-line character limits cannot be represented exactly by the current schema, so they are retained in the conditional notes instead of being converted into misleading aggregate limits.",
  prompts: [
    {
      externalRef: "required-why-wake",
      title: "Why Wake?",
      promptText: "Why Wake?",
      maxWordCount: 100,
      requirement: "required",
    },
    {
      externalRef: "optional-written-books",
      title: "Five intriguing books",
      promptText: "List five books you’ve read that have intrigued you.",
      requirement: "conditional",
      conditionalNote: "Optional written supplement; if selected, choose one of four prompts. Each of the five book titles has a 150-character limit.",
    },
    {
      externalRef: "optional-written-curiosity",
      title: "Intellectual curiosity",
      promptText: "Tell us what piques your intellectual curiosity or has helped you understand the world’s complexity. This can include a work you’ve read, a project you’ve completed for a class, and even co-curricular activities in which you have been involved.",
      maxWordCount: 150,
      requirement: "conditional",
      conditionalNote: "Optional written supplement; if selected, choose one of four prompts.",
    },
    {
      externalRef: "optional-written-maya-angelou",
      title: "A Maya Angelou quote",
      promptText: "Dr. Maya Angelou, renowned author, poet, civil-rights activist, and former Wake Forest University Reynolds Professor of American Studies, inspired others to celebrate their identities and to honor each person’s dignity. Choose one of Dr. Angelou’s powerful quotes. How does this quote relate to your lived experience or reflect how you plan to contribute to the Wake Forest community?",
      maxWordCount: 300,
      requirement: "conditional",
      conditionalNote: "Optional written supplement; if selected, choose one of four prompts.",
    },
    {
      externalRef: "optional-written-top-ten",
      title: "Top Ten List",
      promptText: "Give us your Top Ten List. (The choice of theme is yours.)",
      requirement: "conditional",
      conditionalNote: "Optional written supplement; if selected, choose one of four prompts. Each of the ten lines has a 100-character limit.",
    },
  ],
};
