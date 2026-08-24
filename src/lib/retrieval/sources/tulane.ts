import type { SchoolSourceRecord } from "../types";

// Tulane's current checklist is live for fall 2027 but does not expose any
// school-specific writing prompt. A separate official planning page still
// describes an optional Why Tulane statement while referring to the Class of
// 2025, leaving both current inclusion and exact current wording unresolved.
export const tulane: SchoolSourceRecord = {
  schoolName: "Tulane University",
  cycleLabel: "2026–27",
  verificationStatus: "needs-review",
  applicationPlatform: "common-app",
  sourceUrl: "https://admission.tulane.edu/apply/instructions",
  retrievedAt: "2026-08-24",
  note: "Checked Tulane's current Application Instructions and Fall 2027 standardized-testing pages, plus its official Start Planning for College page. The current checklist names the Common Application personal statement but publishes no school-specific prompt; the planning page describes an optional Why Tulane statement but contains stale Class of 2025 language and no current-cycle wording or limit. Because the official pages conflict on whether that supplement is current, no prompt is imported pending verification in the 2026–27 Common Application.",
  prompts: [],
};
