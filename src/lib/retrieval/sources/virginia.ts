import type { SchoolSourceRecord } from "../types";

// UVA's public site confirms the Fall 2027 application and discusses written
// supplements, but the exact current prompt text is available only inside the
// Common Application. Older official PDFs are not evidence for this cycle.
export const universityOfVirginia: SchoolSourceRecord = {
  schoolName: "University of Virginia",
  cycleLabel: "2026–27",
  verificationStatus: "needs-review",
  applicationPlatform: "common-app",
  sourceUrl: "https://admission.virginia.edu/admission/deadlines-instructions",
  retrievedAt: "2026-08-24",
  note: "Checked UVA's official Fall 2027 Deadlines & Instructions page, current Application Review Process page, resources library, and official application-change PDFs. The current pages confirm that UVA uses the Common Application and refers to essays and written supplements, but do not publish the exact 2026–27 UVA question wording or limits. The only official verbatim prompt set located is explicitly labeled 2023–2024, so it is too old to import as permitted 2025–26 planning material. Verify the UVA section directly in the 2026–27 Common App.",
  prompts: [],
};
