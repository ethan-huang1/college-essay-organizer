import type { SchoolSourceRecord } from "../types";

// Official Duke Undergraduate Admissions Apply page, explicitly describing
// the 2026-27 first-year requirements. Applicants answer both required
// questions and may answer one of the three optional questions.
export const duke: SchoolSourceRecord = {
  schoolName: "Duke University",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://admissions.duke.edu/apply/",
  retrievedAt: "2026-08-24",
  note: "Official Duke Undergraduate Admissions page, explicitly labeled as the 2026-27 first-year admission cycle. All applicants answer two required 250-word questions and may answer one of three optional 250-word questions.",
  prompts: [
    { externalRef: "required-why-duke", title: "Why Duke", promptText: "What is your impression of Duke as a university and community, and why do you believe it is a good match for your goals, values, and interests? If there is something specific that attracts you to our academic offerings in Trinity College of Arts and Sciences or the Pratt School of Engineering, or to our co-curricular opportunities, feel free to include that, too.", maxWordCount: 250, requirement: "required" },
    { externalRef: "required-community", title: "A community that shaped you", promptText: "We all belong to communities defined by place, faith, family, culture, interests or shared experience. Tell us about a community that has shaped who you are, any way it has set you apart, and what you’ve learned from being part of it that you hope to bring to Duke.", maxWordCount: 250, requirement: "required" },
    { externalRef: "optional-viewpoints", title: "Viewpoints and experiences", promptText: "We believe a wide range of viewpoints and experiences is essential to maintaining Duke’s vibrant living and learning community. Please share anything in this context that might help us better understand you and your potential contributions to Duke.", maxWordCount: 250, requirement: "optional" },
    { externalRef: "optional-disagreement", title: "Difference of opinion", promptText: "Meaningful dialogue often involves respectful disagreement. Provide an example of a difference of opinion you’ve had with someone you care about. What did you learn from it?", maxWordCount: 250, requirement: "optional" },
    { externalRef: "optional-excitement", title: "Something you are excited about", promptText: "What’s the last thing that you’ve been really excited about?", maxWordCount: 250, requirement: "optional" },
  ],
};
