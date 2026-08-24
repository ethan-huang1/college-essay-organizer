import type { SchoolSourceRecord } from "../types";

// Official Harvard College First Year Application Supplement PDF. Harvard's
// live essay-topics page could only confirm 2025-26 content (the 2026-27
// supplement is "available each application cycle in August" and wasn't
// yet published as of this research date), so per policy these are
// imported as previous-cycle, not current, with a prominent UI warning.
//
// Cycle-label note: the filename/URL path is explicitly
// "Harvard_FY_supplement_2025-2026.pdf" (uploaded under a 2025-08 path,
// consistent with 2025-26-cycle materials), but the PDF's own boilerplate
// text reads "Valid for entrance in Fall 2025" - which literally describes
// the PRIOR (2024-25) cycle. This is most likely stale boilerplate Harvard
// didn't update, not evidence this is actually the 2024-25 document - the
// filename and upload date are stronger signals. Flagged here rather than
// silently resolved; re-verify this discrepancy when 2026-27 prompts are
// checked.
export const harvard: SchoolSourceRecord = {
  schoolName: "Harvard University",
  cycleLabel: "2025–26",
  verificationStatus: "previous-cycle",
  applicationPlatform: "common-app",
  sourceUrl: "https://college.harvard.edu/sites/default/files/2025-08/Harvard_FY_supplement_2025-2026.pdf",
  retrievedAt: "2026-08-24",
  note: "Official Harvard College First Year Application Supplement PDF (filename/upload path: 2025-2026 cycle). The document's own boilerplate text says \"Valid for entrance in Fall 2025,\" which is likely stale/unupdated wording rather than evidence of an older cycle - flagged for human review. 2026-27 wording was not available on Harvard's site as of this research date (their supplement publishes each cycle in August). Imported as previous-cycle per policy: visible for early planning, not a current requirement.",
  prompts: [
    { externalRef: "short-answer-life-experiences", title: "Life experiences and contribution to Harvard", promptText: "Harvard has long recognized the importance of enrolling a student body with a diversity of perspectives and experiences. How will the life experiences that shaped who you are today enable you to contribute to Harvard?", maxWordCount: 150, requirement: "required" },
    { externalRef: "short-answer-disagreement", title: "A strong disagreement", promptText: "Describe a time when you strongly disagreed with someone about an idea or issue. How did you communicate or engage with this person? What did you learn from this experience?", maxWordCount: 150, requirement: "required" },
    { externalRef: "short-answer-activities-shaped-you", title: "Activities, employment, travel, or family responsibilities", promptText: "Briefly describe any of your extracurricular activities, employment experience, travel, or family responsibilities that have shaped who you are.", maxWordCount: 150, requirement: "required" },
    { externalRef: "short-answer-future-use", title: "Using your Harvard education", promptText: "How do you hope to use your Harvard education in the future?", maxWordCount: 150, requirement: "required" },
    { externalRef: "short-answer-roommates", title: "Top 3 things your roommates might like to know", promptText: "Top 3 things your roommates might like to know about you.", maxWordCount: 150, requirement: "required" },
  ],
};
