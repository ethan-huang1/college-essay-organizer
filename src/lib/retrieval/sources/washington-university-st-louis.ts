import type { SchoolSourceRecord } from "../types";

// WashU's official first-year page applies to the class entering fall 2027 and
// supplies the exact required question and its 250-word limit. The same page
// also confirms scholarship writing responses whose exact text is not public.
export const washingtonUniversityStLouis: SchoolSourceRecord = {
  schoolName: "Washington University in St. Louis",
  cycleLabel: "2026–27",
  verificationStatus: "needs-review",
  applicationPlatform: "common-app",
  sourceUrl: "https://admissions.washu.edu/how-to-apply/first-year-us-applicants/",
  retrievedAt: "2026-08-24",
  note: "Checked WashU's official first-year application page for applicants entering in fall 2027. It verifies a required 250-word response to “Please tell us what you are interested in studying at college and why,” and accepts both the Common Application and Coalition Application. However, the same current page confirms an optional Scholarship Writing Supplement for the Danforth, Ervin, Rodriguez, and Howard Nemerov programs, while the official Signature Scholar page says applicants answer a 250-word question for each selected program without publishing exact wording. Because current conditional scholarship prompts remain unresolved, this school is not represented as fully verified and no partial prompt set is imported.",
  prompts: [],
};
