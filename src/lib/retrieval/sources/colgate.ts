import type { SchoolSourceRecord } from "../types";

// Colgate's public first-year requirements page confirms that applicants use
// the Common App, Coalition on Scoir, or QuestBridge and refers to a Colgate
// supplement/activity questions, but it does not publish their exact wording.
// The application platforms and applicant portal are not public sources, so
// importing remembered or third-party wording would overstate verification.
export const colgate: SchoolSourceRecord = {
  schoolName: "Colgate University",
  cycleLabel: "2026–27",
  verificationStatus: "needs-review",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.colgate.edu/admission-aid/apply/first-year-applicants",
  retrievedAt: "2026-08-24",
  note: "Checked Colgate's official First-Year Applicants and QuestBridge Applicants pages. They confirm use of the Common Application, Coalition on Scoir, and QuestBridge, and refer to a Colgate supplement/activity and involvement questions, but neither public page publishes the current questions or a cycle-labeled prompt document. Exact 2026-27 wording must be verified inside an application platform or supplied by Colgate before prompts can be imported.",
  prompts: [],
};
