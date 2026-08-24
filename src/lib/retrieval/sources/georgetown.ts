import type { SchoolSourceRecord } from "../types";

// Official Georgetown Office of Undergraduate Admissions page. The three
// core essays below are verbatim-confirmed. The school-specific essay (one
// of seven variants depending on the undergraduate school an applicant
// selects) could only be retrieved as a summarized description per school,
// not exact quoted wording - each variant is imported as "needs-review"
// rather than presented as verbatim, and as "conditional" since only the
// one matching the applicant's chosen school applies. No application
// cycle year was printed on the source page.
export const georgetown: SchoolSourceRecord = {
  schoolName: "Georgetown University",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://uadmissions.georgetown.edu/apply/first-year-applicants/application-requirements-and-forms/",
  retrievedAt: "2026-08-24",
  note: "Official Georgetown admissions page. The three core essays are quoted verbatim; no cycle year is printed on the source page. Georgetown began accepting the Common App for this cycle (previously used only its own application). The seven school-specific essay variants (one per undergraduate school) were only available as summarized descriptions, not exact wording - each is imported separately as needs-review/conditional; verify exact current wording on the source page before use.",
  prompts: [
    { externalRef: "short-essay-activity", title: "Most significant activity", promptText: "Briefly discuss the significance to you of the school or summer activity in which you have been most involved.", maxWordCount: 250, requirement: "required" },
    { externalRef: "short-essay-differing-viewpoint", title: "A differing viewpoint", promptText: "In all our lives, we interact with people who hold different viewpoints than our own. Describe such an event you experienced. What did you learn from the experience?", maxWordCount: 250, requirement: "required" },
    { externalRef: "essay-personal-creative", title: "Personal or creative essay", promptText: "Please submit a brief personal or creative essay which you feel best describes you and reflects on your personal background and individual experiences, skills, and talents.", maxWordCount: 650, requirement: "required" },
    { externalRef: "school-essay-college-arts-sciences", title: "School-specific: College of Arts & Sciences", promptText: "Describe your interest in integrated education and research across the natural sciences, humanities, social sciences, and fine arts. Applicants interested in the sciences, math, or languages should reference their specific intended major. (Summarized from Georgetown's official page - verify exact current wording before use.)", requirement: "conditional", conditionalNote: "Applies only to applicants selecting the College of Arts & Sciences.", verificationStatus: "needs-review" },
    { externalRef: "school-essay-mccourt", title: "School-specific: McCourt School of Public Policy", promptText: "Describe your motivations for studying public policy and your commitment to public service; note the opportunity to study on the Capitol Campus. (Summarized from Georgetown's official page - verify exact current wording before use.)", requirement: "conditional", conditionalNote: "Applies only to applicants selecting the McCourt School of Public Policy.", verificationStatus: "needs-review" },
    { externalRef: "school-essay-earth-commons", title: "School-specific: Earth Commons Institute", promptText: "Describe your primary motivations for studying environment and sustainability and how you hope to effect positive change. (Summarized from Georgetown's official page - verify exact current wording before use.)", requirement: "conditional", conditionalNote: "Applies only to applicants selecting the Earth Commons Institute.", verificationStatus: "needs-review" },
    { externalRef: "school-essay-nursing", title: "School-specific: Berkley School of Nursing", promptText: "Describe the factors influencing your interest in nursing, focusing on ethical, empathetic leadership formation. (Summarized from Georgetown's official page - verify exact current wording before use.)", requirement: "conditional", conditionalNote: "Applies only to applicants selecting the Berkley School of Nursing.", verificationStatus: "needs-review" },
    { externalRef: "school-essay-health", title: "School-specific: School of Health", promptText: "Describe the factors influencing your interest in healthcare and specify your intended major (Global Health, Health Care Management & Policy, or Human Science). (Summarized from Georgetown's official page - verify exact current wording before use.)", requirement: "conditional", conditionalNote: "Applies only to applicants selecting the School of Health.", verificationStatus: "needs-review" },
    { externalRef: "school-essay-sfs", title: "School-specific: Walsh School of Foreign Service", promptText: "Describe your motivations for studying international affairs and your commitment to global service. (Summarized from Georgetown's official page - verify exact current wording before use.)", requirement: "conditional", conditionalNote: "Applies only to applicants selecting the Walsh School of Foreign Service.", verificationStatus: "needs-review" },
    { externalRef: "school-essay-mcdonough", title: "School-specific: McDonough School of Business", promptText: "Describe your motivations for studying business, emphasizing global, ethical, and analytical perspectives. (Summarized from Georgetown's official page - verify exact current wording before use.)", requirement: "conditional", conditionalNote: "Applies only to applicants selecting the McDonough School of Business.", verificationStatus: "needs-review" },
  ],
};
