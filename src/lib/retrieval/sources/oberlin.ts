import type { SchoolSourceRecord } from "../types";

// Oberlin explicitly confirms that its standard College of Arts and Sciences
// application has no supplemental essay. It does, however, publish exact
// current questions for three specialized first-year application paths, so
// those are retained as conditional prompts rather than losing useful scope.
export const oberlin: SchoolSourceRecord = {
  schoolName: "Oberlin College",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://www.oberlin.edu/admissions-and-aid/conservatory/undergraduate-applicants",
  retrievedAt: "2026-08-24",
  note: "Oberlin's official College of Arts and Sciences first-year page explicitly says there is no general supplemental essay. Official specialized-program pages publish the five conditional questions recorded here: two Composition, one TIMARA, and two BA+BFA Integrated Arts questions. The Conservatory page states fall 2027 admission and gives 1,000-word limits; the BA+BFA page gives 100-250 word limits.",
  prompts: [
    { externalRef: "composition-development", title: "Composition: development and influences", promptText: "Tell us about your development as a composer so far. Include in your response a discussion of composers, specific works of music, and musical styles and genres that have inspired and influenced you.", maxWordCount: 1000, requirement: "conditional", conditionalNote: "Required only for applicants to the Oberlin Conservatory Composition program." },
    { externalRef: "composition-aspirations", title: "Composition: aspirations", promptText: "Tell us about your aspirations for your creative, academic and professional trajectories. Address such questions as: Why are you pursuing a degree in composition and what do you hope to achieve at Oberlin and beyond?", maxWordCount: 1000, requirement: "conditional", conditionalNote: "Required only for applicants to the Oberlin Conservatory Composition program." },
    { externalRef: "timara-goals", title: "TIMARA: artistic and academic goals", promptText: "What are your artistic and academic goals for the next four years?", maxWordCount: 1000, requirement: "conditional", conditionalNote: "Required only for applicants to Oberlin's TIMARA program." },
    { externalRef: "babfa-influences", title: "BA+BFA: artistic influences", promptText: "What artists, movements, cultural experiences, and/or personal experiences inspire your work?", minWordCount: 100, maxWordCount: 250, requirement: "conditional", conditionalNote: "Required only for applicants to Oberlin's BA+BFA in Integrated Arts program." },
    { externalRef: "babfa-vision", title: "BA+BFA: integrated-arts vision", promptText: "How do you envision the BA+BFA in Integrated Arts supporting the expansion and growth in your work? What is your vision for the work you hope to create in the coming years? What does “integrated arts” mean to you?", minWordCount: 100, maxWordCount: 250, requirement: "conditional", conditionalNote: "Required only for applicants to Oberlin's BA+BFA in Integrated Arts program." },
  ],
};
