import type { SchoolSourceRecord } from "../types";

// Columbia's public admissions pages confirm a required series of
// Columbia-specific questions, but the current exact questions are exposed
// only after starting the Common App or Coalition application.
export const columbia: SchoolSourceRecord = {
  schoolName: "Columbia University",
  cycleLabel: "2026–27",
  verificationStatus: "needs-review",
  applicationPlatform: "common-app",
  sourceUrl: "https://undergrad.admissions.columbia.edu/faq?body_value=&field_question_topics_tid=405&page=0",
  retrievedAt: "2026-08-24",
  note: "Checked Columbia Undergraduate Admissions' official application FAQ and application materials. They confirm that first-year applicants complete Columbia-specific questions through the Common Application or Coalition Application, but the public site does not publish the current exact questions or a cycle-labeled prompt document. Exact 2026-27 wording must be verified in the application before import; third-party prompt lists were not used.",
  prompts: [],
};
