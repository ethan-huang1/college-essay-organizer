// Prompt retrieval architecture (MVP_SPEC.md §2's "Automatically retrieve
// the school's current prompts").
//
// This does NOT make live web requests at runtime - see OVERNIGHT_TASK.md's
// no-paid-API rule and MVP_SPEC.md §5 ("do not make paid calls... do not
// create a public AI endpoint"). There is no web-search API available to
// the running app without a paid key, and unauthenticated scraping of
// arbitrary admissions sites on every "Add College" click would be both
// fragile and irresponsible ("avoid unnecessary repeated web requests").
//
// Instead: a small provider interface (matching MVP_SPEC.md §5's existing
// deterministic-provider pattern for classification/matching) backed by a
// CURATED dataset. Each entry below was researched once, by hand, from the
// cited official source, and is stored with its retrieval date and
// verification status - never invented. Schools not in this dataset return
// null (see the school-actions.ts caller) and the UI shows "Current
// prompts not yet verified" plus the existing manual-entry fallback,
// exactly as MVP_SPEC.md requires rather than guessing.
//
// Refreshing the architecture later: swap CuratedPromptRetrievalProvider
// for one backed by a real search/fetch integration behind this same
// PromptRetrievalProvider interface - nothing else in the app needs to change.

export type PromptVerificationStatus = "verified-2026-27" | "likely-current-unverified" | "previous-cycle" | "manual";

export type RetrievedPrompt = {
  title: string;
  promptText: string;
  minWordCount: number | null;
  maxWordCount: number | null;
  requirement: "required" | "optional";
};

export type RetrievedPromptSet = {
  schoolName: string;
  cycleLabel: string;
  verificationStatus: PromptVerificationStatus;
  sourceUrl: string | null;
  retrievedAt: string; // ISO date - fixed at research time, not "now"
  note: string;
  prompts: RetrievedPrompt[];
};

export interface PromptRetrievalProvider {
  retrievePrompts(schoolName: string): RetrievedPromptSet | null;
}

// Researched by hand against each school's official admissions site.
// "verified-2026-27": the source explicitly states the 2026-27 cycle, or
// (Stanford) was updated during the window those prompts are published and
// no other cycle is indicated. "previous-cycle": the only fetchable content
// was explicitly an older cycle (e.g. Harvard's supplement is "available
// each cycle in August" and only 2025-26 content could be confirmed) - its
// prompts are deliberately NOT imported so a stale cycle is never silently
// presented as current.
const CURATED_DATASET: Record<string, RetrievedPromptSet> = {
  "Stanford University": {
    schoolName: "Stanford University",
    cycleLabel: "2026–27",
    verificationStatus: "verified-2026-27",
    sourceUrl: "https://admission.stanford.edu/apply/first-year/apply.html",
    retrievedAt: "2026-08-24",
    note: "Official Stanford admissions page, last updated July 21, 2026; the page itself does not print a cycle label, so this is inferred from recency plus the official source.",
    prompts: [
      { title: "Genuinely excited about learning", promptText: "The Stanford community is deeply curious and driven to learn in and out of the classroom. Reflect on an idea or experience that makes you genuinely excited about learning.", minWordCount: 100, maxWordCount: 250, requirement: "required" },
      { title: "Note to your future roommate", promptText: "Virtually all of Stanford's undergraduates live on campus. Write a note to your future roommate that reveals something about you or that will help your roommate—and us—get to know you better.", minWordCount: 100, maxWordCount: 250, requirement: "required" },
      { title: "Distinctive contribution", promptText: "Please describe what aspects of your life experiences, interests, and character would help you make a distinctive contribution as an undergraduate to Stanford University.", minWordCount: 100, maxWordCount: 250, requirement: "required" },
      { title: "Significant challenge society faces", promptText: "What is the most significant challenge that society faces today?", minWordCount: null, maxWordCount: 50, requirement: "required" },
      { title: "Last two summers", promptText: "How did you spend your last two summers?", minWordCount: null, maxWordCount: 50, requirement: "required" },
      { title: "Historical moment you wish you'd witnessed", promptText: "What historical moment or event do you wish you could have witnessed?", minWordCount: null, maxWordCount: 50, requirement: "required" },
      { title: "An extracurricular, job, or responsibility", promptText: "Briefly elaborate on one of your extracurricular activities, a job you hold, or responsibilities you have for your family.", minWordCount: null, maxWordCount: 50, requirement: "required" },
      { title: "Five things that matter to you", promptText: "List five things that are important to you.", minWordCount: null, maxWordCount: 50, requirement: "required" },
    ],
  },
  "Massachusetts Institute of Technology": {
    schoolName: "Massachusetts Institute of Technology",
    cycleLabel: "2026–27",
    verificationStatus: "verified-2026-27",
    sourceUrl: "https://mitadmissions.org/apply/firstyear/essays-activities-academics/",
    retrievedAt: "2026-08-24",
    note: "Official MIT Admissions page, explicitly labeled \"2026-2027 Cycle.\"",
    prompts: [
      { title: "Field of study that appeals to you", promptText: "What field of study appeals to you the most right now? (Note: Applicants select from a drop-down list.) Reflect on what has led to this interest.", minWordCount: 100, maxWordCount: 200, requirement: "required" },
      { title: "Your own trail", promptText: "While some reach their goals following well-trodden paths, others blaze their own trails achieving the unexpected. In what ways have you done something different than what was expected in your educational journey?", minWordCount: 100, maxWordCount: 200, requirement: "required" },
      { title: "Problems you want to tackle at MIT", promptText: "How have your personal and academic experiences influenced the types of problems you would want to tackle with an MIT education and the impact you aim to make on your community?", minWordCount: 100, maxWordCount: 200, requirement: "required" },
      { title: "An unexpected challenge", promptText: "How did you manage a situation or challenge that you didn't expect? What did you learn from it?", minWordCount: 100, maxWordCount: 200, requirement: "required" },
      { title: "Just for fun", promptText: "What do you do just for fun?", minWordCount: null, maxWordCount: 50, requirement: "required" },
      { title: "Someone you admire", promptText: "Who is someone you admire, whether you know them personally or look up to them from afar? Tell us why.", minWordCount: null, maxWordCount: 50, requirement: "required" },
      { title: "A topic you could talk about for hours", promptText: "What's a topic, academic or non-academic, that you could talk about for hours?", minWordCount: null, maxWordCount: 50, requirement: "required" },
      { title: "Generalist or specialist", promptText: "MIT values both \"generalists\" with varied interests and \"specialists\" who focus deeply on one or a few passions. Which do you think best describes you, and why?", minWordCount: null, maxWordCount: 50, requirement: "required" },
    ],
  },
  "Harvard University": {
    schoolName: "Harvard University",
    cycleLabel: "2026–27",
    verificationStatus: "previous-cycle",
    sourceUrl: "https://college.harvard.edu/admissions/apply/first-year-applicants",
    retrievedAt: "2026-08-24",
    note: "Harvard's official page confirms five required 150-word short-answer questions exist, but states the 2026-27 supplement is \"available each application cycle in August\" and only 2025-26 content could be confirmed - the actual question text was deliberately not imported to avoid presenting a stale cycle as current.",
    prompts: [],
  },
};

export class CuratedPromptRetrievalProvider implements PromptRetrievalProvider {
  retrievePrompts(schoolName: string): RetrievedPromptSet | null {
    return CURATED_DATASET[schoolName] ?? null;
  }
}

export const promptRetrievalProvider: PromptRetrievalProvider = new CuratedPromptRetrievalProvider();
