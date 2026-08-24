import type { SchoolSourceRecord } from "../types";

// Penn State's current official first-year materials strongly encourage a
// personal statement, but do not publish exact wording or a limit publicly.
export const pennState: SchoolSourceRecord = {
  schoolName: "Pennsylvania State University",
  cycleLabel: "2026–27",
  verificationStatus: "needs-review",
  applicationPlatform: "common-app",
  sourceUrl: "https://admissions.psu.edu/index.cfm/_api/render/file/?fileID=A46AB9BE-5056-8A62-FA8D60F32BB6508F&method=attachment",
  retrievedAt: "2026-08-24",
  note: "Checked Penn State Undergraduate Admissions' current official First-Year guide and application materials. They strongly encourage completing a personal statement and confirm MyPennState, Common App, and Coalition application routes, but do not publish the current statement's exact wording, word limit, or cycle label. Schreyer Honors also has a separate essay-bearing application whose official brochure directs applicants elsewhere for questions. Verify exact 2026-27 general and Honors wording in the live applications before import.",
  prompts: [],
};
