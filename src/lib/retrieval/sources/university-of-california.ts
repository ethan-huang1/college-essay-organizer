import type { RawPromptRecord, SchoolSourceRecord } from "../types";

// The University of California's 8 Personal Insight Questions are shared
// verbatim across every UC campus - applicants answer any 4 of the 8 (not
// modeled as a distinct "choose N of group" concept; each is imported as
// "optional" and the 4-of-8 instruction lives in each record's note, shown
// to the user). Official UC admissions page; no cycle year was printed.
const UC_PIQ_SOURCE_URL = "https://admission.universityofcalifornia.edu/how-to-apply/applying-as-a-freshman/personal-insight-questions.html";
const UC_PIQ_NOTE = "Official University of California admissions page. Answer any 4 of these 8 Personal Insight Questions (350 words each) - all 8 are imported as optional since the choice of which 4 is the applicant's. No cycle year was printed on the source page.";

const PERSONAL_INSIGHT_QUESTIONS: RawPromptRecord[] = [
  { externalRef: "piq-1-leadership", title: "PIQ 1: Leadership experience", promptText: "Describe an example of your leadership experience in which you have positively influenced others, helped resolve disputes or contributed to group efforts over time.", maxWordCount: 350, requirement: "optional" },
  { externalRef: "piq-2-creativity", title: "PIQ 2: Creative side", promptText: "Every person has a creative side, and it can be expressed in many ways: problem solving, original and innovative thinking, and artistically, to name a few. Describe how you express your creative side.", maxWordCount: 350, requirement: "optional" },
  { externalRef: "piq-3-talent", title: "PIQ 3: Greatest talent or skill", promptText: "What would you say is your greatest talent or skill? How have you developed and demonstrated that talent over time?", maxWordCount: 350, requirement: "optional" },
  { externalRef: "piq-4-educational-opportunity", title: "PIQ 4: Educational opportunity or barrier", promptText: "Describe how you have taken advantage of a significant educational opportunity or worked to overcome an educational barrier you have faced.", maxWordCount: 350, requirement: "optional" },
  { externalRef: "piq-5-challenge", title: "PIQ 5: Most significant challenge", promptText: "Describe the most significant challenge you have faced and the steps you have taken to overcome this challenge. How has this challenge affected your academic achievement?", maxWordCount: 350, requirement: "optional" },
  { externalRef: "piq-6-academic-interest", title: "PIQ 6: An academic subject that inspires you", promptText: "Think about an academic subject that inspires you. Describe how you have furthered this interest inside and/or outside of the classroom.", maxWordCount: 350, requirement: "optional" },
  { externalRef: "piq-7-community", title: "PIQ 7: Made your community a better place", promptText: "What have you done to make your school or your community a better place?", maxWordCount: 350, requirement: "optional" },
  { externalRef: "piq-8-strong-candidate", title: "PIQ 8: What makes you a strong candidate", promptText: "Beyond what has already been shared in your application, what do you believe makes you a strong candidate for admissions to the University of California?", maxWordCount: 350, requirement: "optional" },
];

function ucCampusRecord(schoolName: string): SchoolSourceRecord {
  return {
    schoolName,
    cycleLabel: "2026–27",
    verificationStatus: "officially-verified",
    applicationPlatform: "school-specific",
    sourceUrl: UC_PIQ_SOURCE_URL,
    retrievedAt: "2026-08-24",
    note: UC_PIQ_NOTE,
    prompts: PERSONAL_INSIGHT_QUESTIONS,
  };
}

export const universityOfCaliforniaBerkeley = ucCampusRecord("University of California, Berkeley");
export const universityOfCaliforniaLosAngeles = ucCampusRecord("University of California, Los Angeles");
