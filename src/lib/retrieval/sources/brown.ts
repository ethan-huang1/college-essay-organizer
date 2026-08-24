import type { SchoolSourceRecord } from "../types";

// Brown's official admissions page explicitly labels these as its essays for
// the 2026-2027 application cycle. Four essays apply to every first-year
// applicant; PLME and Brown|RISD applicants have additional conditional essays.
export const brown: SchoolSourceRecord = {
  schoolName: "Brown University",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://admission.brown.edu/apply/how-apply",
  retrievedAt: "2026-08-24",
  note: "Official Brown Undergraduate Admission page, explicitly identifying these as the 2026–2027 application-cycle essays. Four essays are required for all first-year applicants. PLME applicants answer three additional 250-word questions, and Brown|RISD Dual Degree applicants answer one additional 650-word essay. The page's introductory sentences for the special programs still say 'in addition to the three essays' even though the same current section now lists four core essays; the imported prompt list follows the four-item current section and flags special-program prompts as conditional.",
  prompts: [
    {
      externalRef: "core-open-curriculum",
      title: "Your approach to the Open Curriculum",
      promptText: "\"There is something distinctive about Brown students. It is a blend of intellectual curiosity, creativity, and humility. A commitment to collaboration. An openness to new ideas and perspectives. A desire to make the world better. And it is resilience: the ability to recover and thrive after experiencing difficulties.\" From President Christina Paxson's 2025 Convocation Address. How will you use these characteristics or others to shape your approach to the Open Curriculum?",
      minWordCount: 150,
      maxWordCount: 250,
      requirement: "required",
    },
    {
      externalRef: "core-growing-up",
      title: "Growing up and contributing to Brown",
      promptText: "Students entering Brown often find that making their home on College Hill naturally invites reflection on where they came from. Share how an aspect of your growing up has inspired or challenged you, and what unique contributions this might allow you to make to the Brown community.",
      minWordCount: 150,
      maxWordCount: 250,
      requirement: "required",
    },
    {
      externalRef: "core-teach-a-class",
      title: "Teach a class",
      promptText: "If you could teach a class on any one thing, whether academic or otherwise, what would it be?",
      minWordCount: 100,
      maxWordCount: 150,
      requirement: "required",
    },
    {
      externalRef: "core-joy",
      title: "What brings you joy",
      promptText: "Brown students care deeply about their work and the world around them. Students find contentment, satisfaction, and meaning in daily interactions and major discoveries. Whether big or small, mundane or spectacular, tell us about something that brings you joy.",
      minWordCount: 100,
      maxWordCount: 150,
      requirement: "required",
    },
    {
      externalRef: "plme-why-medicine",
      title: "PLME: Why medicine?",
      promptText: "Why medicine?",
      maxWordCount: 250,
      requirement: "conditional",
      conditionalNote: "Required only for applicants to the eight-year Program in Liberal Medical Education (PLME), in addition to the core Brown essays.",
    },
    {
      externalRef: "plme-why-plme",
      title: "PLME: Why PLME?",
      promptText: "Why PLME?",
      maxWordCount: 250,
      requirement: "conditional",
      conditionalNote: "Required only for applicants to the eight-year Program in Liberal Medical Education (PLME), in addition to the core Brown essays.",
    },
    {
      externalRef: "plme-great-doctor",
      title: "PLME: What will make you a great doctor?",
      promptText: "Tell us something about yourself, beyond your interest in medicine, that you think will make you a great doctor.",
      maxWordCount: 250,
      requirement: "conditional",
      conditionalNote: "Required only for applicants to the eight-year Program in Liberal Medical Education (PLME), in addition to the core Brown essays.",
    },
    {
      externalRef: "brown-risd-dual-degree",
      title: "Brown | RISD Dual Degree",
      promptText: "The Brown | RISD Dual Degree Program draws on the complementary strengths of Brown University and Rhode Island School of Design (RISD) to provide students with the opportunity to explore and engage with diverse spheres of academic and creative inquiry. Considering your understanding of the academic programs at Brown and RISD, describe how and why the specific blend of RISD's experimental, immersive art and design program and Brown's wide-ranging courses and curricula could constitute an optimal undergraduate education for you. Reflect on how you might integrate or synthesize content, approaches, and methods from these two distinct learning experiences. Additionally, how might you contribute to the Dual Degree community and its commitment to interdisciplinary work?",
      maxWordCount: 650,
      requirement: "conditional",
      conditionalNote: "Required only for applicants to the five-year Brown | Rhode Island School of Design Dual Degree Program, in addition to the core Brown essays.",
    },
  ],
};
