import type { SchoolSourceRecord } from "../types";

// Official CMC first-year instructions. The live page's testing policy is
// expressly for applicants through the fall 2027 entry term, and the same
// page publishes both required supplement questions verbatim.
export const claremontMcKenna: SchoolSourceRecord = {
  schoolName: "Claremont McKenna College",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.cmc.edu/admission/first-year-application-instructions",
  retrievedAt: "2026-08-24",
  note: "Official Claremont McKenna first-year application instructions for the fall 2027 entry term. Both questions are required and appear in the Common Application and Coalition Application. The official page does not publish a word limit, so none is inferred here.",
  prompts: [
    { externalRef: "supplement-why-cmc", title: "Why Claremont McKenna", promptText: "CMC’s mission is to prepare students for thoughtful and productive lives and responsible leadership in business, government, and the professions. With this mission in mind, please explain why you want to attend Claremont McKenna College.", requirement: "required" },
    { externalRef: "supplement-open-academy-dialogue", title: "Open Academy and constructive dialogue", promptText: "A critical part of fulfilling our mission is living out the commitments of CMC’s Open Academy: Freedom of Expression, Viewpoint Diversity, and Constructive Dialogue. We want to learn more about your commitment to listening and learning from others with different viewpoints, perspectives, and life experiences from your own. Describe a time when engaging with someone about a specific topic resulted in you changing your attitude, belief, or behavior, or you changed the belief or behavior of someone else. What was the change that occurred for you, and what facilitated that change? What did you learn from that experience, and how has it informed how you engage with others?", requirement: "required" },
  ],
};
