import { LEGACY_FAMILY_SLUG_MAP } from "./db/taxonomy";

// Deterministic, keyword-based classifier. No model calls, no network - see
// MVP_SPEC.md §5: "do not require a paid API key... implement a
// deterministic local/demo provider." Every classification below is
// transparent and reproducible from its keyword hits alone.
//
// Rewritten for the seven-category taxonomy, and for a specific failure: the
// old "why-school" keywords were organizer-side phrasing ("why us", "why this
// school", "our campus") that no real supplement uses, because a supplement
// says "Why Duke?" or "What draws you to Nursing at Penn?". Measured on the
// catalogue, *zero* of 255 prompts ever classified as why-school and 44% landed
// unclassified. Why Us is the single most reusable-adjacent category there is -
// it is the one you must NOT reuse - so having it permanently empty made the
// reuse map quietly wrong.

/**
 * Phrases that identify a category, checked in precedence order.
 *
 * Precedence matters more than hit-counting here. A 50-word "Why Duke?" is a
 * Why Us prompt that happens to be short, not a Short Answer: what a prompt is
 * *for* outranks how long it is. Hit-counting alone got this backwards, because
 * length words are common and purpose words are not.
 */
const RULES: { slug: string; patterns: RegExp[] }[] = [
  {
    // First, and narrow. "Write a note to your future roommate" is a specific
    // recurring prompt whose essay is reusable only against another roommate
    // prompt. It used to match `shorts` on the bare word "roommates", which
    // made a 250-word roommate note look interchangeable with a 50-word
    // favourite-song answer.
    slug: "roommate",
    patterns: [
      /\broommates?\b/i,
      /\bwho\s+you'?re\s+living\s+with\b/i,
    ],
  },
  {
    // Requires a word about reading, not just "list five": "list five things
    // that are important to you" is a Short Answer, and Wake Forest's "Top Ten
    // List" is too. Only a books/reading framing belongs here.
    slug: "reading-list",
    patterns: [
      /\bbooks?\s+(?:you|that|which)\b/i,
      /\blist\s+(?:five|ten|\d+)\s+books\b/i,
      /\breading\s+list\b/i,
      /\bbooks?\s+(?:you'?ve|you\s+have)\s+read\b/i,
    ],
  },
  {
    // First, because a fit prompt often also mentions a major, a community, or
    // a programme - all of which would otherwise win.
    slug: "why-us",
    patterns: [
      // "Why Duke?", "Why are you applying to Georgetown?", "Why Penn Nursing"
      /\bwhy\s+(?:are\s+you\s+|do\s+you\s+want\s+to\s+|have\s+you\s+chosen\s+)?(?:apply|applying|attend|choose|chosen|transfer)\b/i,
      /\bwhy\s+(?:us|our|this)\b/i,
      // Capitalised, because a school or programme name is: "Why Duke?",
      // "Why Penn Nursing?". Lowercase "why medicine?" is a field, and is
      // caught by why-major below instead.
      /\b[Ww]hy\s+[A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*)?\s*\?/,
      /\b(?:draws?|drew|attracts?|appeals?)\s+(?:you|to\s+you)\b/i,
      /\bgood\s+(?:match|fit)\b/i,
      /\bwhat\s+(?:aspects?|features?|parts?)\s+of\s+(?:our|the)\b/i,
      /\b(?:our|this)\s+(?:campus|university|college|school|community|location|curriculum|programs?)\b/i,
      /\bspecific\s+(?:programs?|resources?|opportunities|courses?|faculty)\b/i,
      /\bimpression\s+of\b/i,
      /\bcontribute\s+to\s+(?:our|the)\s+(?:campus|community|university|college)\b/i,
      // "Why Davidson", "Why Wake?", "Why PLME?" - no question mark required.
      // Three characters minimum so "Why I..." and "Why do..." do not qualify.
      /\b[Ww]hy\s+[A-Z][\w'&.-]{2,}/,
      /\bas\s+your\s+(?:new\s+)?home\b/i,
      /\busing\s+your\s+[\w']+\s+education\b/i,
      /\bengag(?:e|ing)\s+with\b/i,
    ],
  },
  {
    slug: "why-major",
    patterns: [
      /\b(?:intended|proposed|prospective|chosen)\s+(?:major|field|area\s+of\s+(?:study|interest))\b/i,
      /\bwhy\s+(?:did\s+you\s+choose|do\s+you\s+want\s+to\s+study)\b/i,
      /\bacademic\s+(?:interests?|areas?|direction|goals?)\b/i,
      /\bfield\s+of\s+study\b/i,
      /\bcourse\s+of\s+study\b/i,
      /\byour\s+major\b/i,
      /\bmajor\s+or\s+minor\b/i,
      /\bcareer\s+goals?\b/i,
      /\bareas?\s+of\s+interest\b/i,
      // Lowercase "Why medicine?", "Why engineering?" - a field, not a school.
      /\b[Ww]hy\s+[a-z][\w-]+\s*\?/,
      /\bstudy\s+(?:at|in)\b/i,
      /\bsubject\s+that\s+inspires\b/i,
      /\bacademic\s+(?:subject|preparation|context)\b/i,
      /\bfurthered\s+this\s+interest\b/i,
      /\bgreat\s+(?:doctor|engineer|lawyer|scientist)\b/i,
      /\bacademic\s+programs?\b/i,
      /\bfirst[-\s]choice\s+major\b/i,
      /\bbachelor'?s\s+degree\b/i,
      /\bgeneralist\b/i,
      /\bgraduate\s+(?:school|study)\b/i,
    ],
  },
  {
    // After why-us and why-major, because a programme prompt often mentions
    // "societal challenges" it wants you to solve - that is a Why Major prompt,
    // not a prompt about an obstacle in your own life.
    //
    // Deliberately no bare /\bchallenge\b/: it matched Stanford's "most
    // significant challenge that society faces" and Michigan's "challenge the
    // present", neither of which is about the student overcoming anything.
    slug: "challenge-growth",
    patterns: [
      // Requires a past-experience framing, not just the word next to "you".
      // "the most significant challenge" alone matched Stanford's question
      // about what challenge *society* faces, and a bare /challenge\s+you/
      // would match "courses that challenge you" in a Why Us prompt.
      /\bchallenge\s+(?:you\s+have|you'?ve|you\s+faced|that\s+you)\b/i,
      /\bchallenge\s+that\s+(?:changed|shaped|tested)\s+you\b/i,
      /\bovercome\b|\bovercame\b/i,
      /\bsetback\b/i,
      /\bobstacle\b/i,
      /\badversity\b/i,
      /\bfailure\b/i,
      /\bbarrier\b/i,
      /\bdidn'?t\s+expect\b/i,
      /\bunexpected\s+(?:challenge|path|turn)\b/i,
      /\bhow\s+did\s+you\s+manage\b/i,
      /\bpersist(?:ed|ence)?\b/i,
      /\bresilien/i,
    ],
  },
  {
    slug: "community",
    patterns: [
      /\bcommunit(?:y|ies)\b/i,
      /\bbelong(?:ing)?\b/i,
      /\bservice\b/i,
      /\bvolunteer/i,
      /\bgive\s+back\b/i,
      /\bneighborhood\b/i,
      /\bcollaborat/i,
      /\bcontribution\b/i,
      /\bbetter\s+place\b/i,
      /\bgroup\s+(?:you|efforts)\b/i,
    ],
  },
  {
    slug: "diversity",
    patterns: [
      /\bidentit(?:y|ies)\b/i,
      /\bcultur(?:e|al)\b/i,
      /\bheritage\b/i,
      /\bupbringing\b/i,
      /\bdiversity\b/i,
      /\blived\s+experience\b/i,
      /\bbackground\b/i,
      /\bwhere\s+you\s+(?:come\s+from|grew\s+up)\b/i,
      /\bfamily\b/i,
      /\btraditions?\b/i,
      /\bperspectives?\s+(?:you|to)\b/i,
    ],
  },
  {
    slug: "personal-statement",
    patterns: [
      /\bdefining\s+experience\b/i,
      /\btell\s+us\s+(?:your\s+story|about\s+yourself)\b/i,
      /\bwho\s+you\s+are\b/i,
      /\bshaped\s+who\s+you\s+are\b/i,
      /\bpersonal\s+statement\b/i,
      /\bintroduce\s+yourself\b/i,
      /\bstory\s+only\s+you\b/i,
      /\bsomething\s+about\s+you(?:rself)?\s+that\b/i,
      /\bnot\s+included\s+(?:anywhere\s+)?elsewhere\b/i,
      // A broad net for personal narrative, deliberately last of the
      // content-bearing rules so community and diversity keep their prompts.
      /\b(?:describe|tell\s+us\s+about|reflect\s+on|write\s+about)\s+(?:a|an|the|your|one)\b/i,
      /\bexperience\b/i,
      /\ba\s+time\s+(?:when|you|your)\b/i,
      /\btalent\s+or\s+skill\b/i,
      /\bcreative\b/i,
      /\bcreativity\b/i,
      /\bchallenge\b/i,
      /\bsetback\b/i,
      /\bovercome|\bovercame\b/i,
      /\bdisagree/i,
      /\bopposing\s+view\b/i,
      /\bdiffering\s+viewpoint\b/i,
      /\bmeaningful\s+to\s+you\b/i,
      /\bproud\s+of\b/i,
      /\badmire\b/i,
      /\bmatters?\s+to\s+you\b/i,
      /\bwhat\s+(?:have\s+you\s+done|would\s+you\s+do)\b/i,
      /\bmost\s+significant\b/i,
      /\bshaped\b/i,
      /\bmotivat/i,
      /\bgrow\s+or\s+develop\b/i,
      /\bstrong\s+candidate\b/i,
      /\bactivity\b/i,
      /\bextracurricular\b/i,
      /\bleadership\b/i,
      /\bproject\b/i,
      /\bidea\s+that\s+excites\b/i,
      /\bexcites\s+you\b/i,
      /\btalk\s+about\s+for\s+hours\b/i,
      /\brabbit\s+hole\b/i,
      /\bcuriosity\b/i,
      /\bintellectual\b/i,
      /\bresearch\b/i,
      /\bteach\b/i,
      /\bbook\b/i,
      /\bread(?:ing)?\b/i,
      /\bskill\b/i,
      /\bopportunit(?:y|ies)\b/i,
      /\bbarrier\b/i,
      /\bexcit(?:ed|ing|es)\b/i,
      /\bnerd/i,
      /\bcurious\b/i,
      /\bdescribe\s+you\b/i,
      /\bemphasi[sz]e\b/i,
      /\bconversation\b/i,
      /\bfight\s+for\b/i,
      /\b(?:created|built|repaired|designed|coded|modeled)\b/i,
      /\bfaith\b/i,
      /\bwish\s+you\b/i,
      /\bhistorical\s+moment\b/i,
      /\bportfolio\b/i,
    ],
  },
  {
    // Last of the real categories: length and format are the weakest signal, so
    // a short prompt with any purpose above keeps that purpose.
    slug: "shorts",
    patterns: [
      /\bfavou?rite\b/i,
      /\blist\s+(?:five|ten|\d+)\b/i,
      /\bshort\s+(?:answer|take)\b/i,
      /\bin\s+a\s+few\s+words\b/i,
      /\bgratitude\b/i,
      /\bthank[-\s]?you\s+note\b/i,
      /\bbrings?\s+you\s+joy\b/i,
      /\bfun\s+question\b/i,
      /\bjust\s+for\s+fun\b/i,
      /\bquirky\b/i,
      /\bsoundtrack\b/i,
      /\btop\s+(?:three|3|five|5|ten|10)\b/i,
      /\bin\s+\d+\s+(?:words|characters)\s+or\s+(?:less|fewer)\b/i,
      /\bone\s+word\b/i,
    ],
  },
];

/**
 * Theme signal worth keeping for matching but not worth a category of its own.
 *
 * These become internal tags; nothing in the UI shows them. The vocabulary is
 * the twelve tag secondaries the catalogue review uses (the other five of its
 * seventeen are themselves categories, so they arrive as secondary family links
 * instead).
 *
 * The tag names here are the *seeded display names*, not slugs, and that is
 * deliberate. Prompt tags are stored by name; when this emitted slugs instead,
 * an essay's derived tags and a prompt's reviewed tags could never intersect,
 * so the secondary-overlap factor scored zero for every pair in the workspace
 * and the whole factor was dead weight. One vocabulary, both sides.
 *
 * Matching an essay against these rules is how an essay earns secondary signal
 * at all: a student picks only a primary category, so without this the essay
 * side of the comparison is empty.
 */
const TAG_RULES: { tag: string; patterns: RegExp[] }[] = [
  {
    tag: "intellectual curiosity",
    patterns: [/\bintellectual\b/i, /\bcuriosity\b/i, /\bcurious\b/i, /\bresearch\b/i, /\brabbit\s+hole\b/i, /\bnerd/i, /\bexplore\s+(?:a\s+)?(?:topic|idea)\b/i, /\bexcites\s+you\b/i, /\bfascinat/i],
  },
  {
    tag: "activities & impact",
    patterns: [/\bextracurricular\b/i, /\binitiative\b/i, /\bresponsibilit(?:y|ies)\b/i, /\bproject\b/i, /\bwork\s+experience\b/i, /\bemployment\b/i, /\bmade\s+a\s+difference\b/i, /\bimpact\b/i, /\bachievement\b/i],
  },
  {
    tag: "values & meaning",
    patterns: [/\bvalues?\b/i, /\bbelief\b/i, /\bethical\b/i, /\bwhat\s+matters\s+to\s+you\b/i, /\bprinciple\b/i, /\bmeaningful\b/i, /\bpurpose\b/i, /\bmoral\b/i],
  },
  {
    tag: "contribution",
    patterns: [/\bcontribut/i, /\benrich\b/i, /\bwould\s+you\s+bring\b/i, /\bbring\s+to\s+(?:our|the|a)\b/i, /\badd\s+to\s+(?:our|the)\s+community\b/i, /\bmake\s+your\s+mark\b/i],
  },
  {
    tag: "service",
    patterns: [/\bservice\b/i, /\bvolunteer/i, /\bserve\b/i, /\bgiving\s+back\b/i, /\bcommon\s+good\b/i, /\bcivic\b/i],
  },
  {
    tag: "leadership",
    patterns: [/\bleader(?:ship|s)?\b/i, /\bled\s+/i, /\bcaptain\b/i, /\bfounded\b/i, /\bpresident\s+of\b/i, /\borganiz(?:ed|ing)\b/i],
  },
  {
    tag: "disagreement",
    patterns: [/\bdisagree/i, /\bopposing\s+view\b/i, /\bdiffer(?:ing|ent)\s+(?:view|opinion|perspective)/i, /\bchanged\s+your\s+mind\b/i, /\bdebate\b/i, /\bargu(?:ment|ed)\b/i, /\bviewpoint\b/i, /\bcommon\s+ground\b/i],
  },
  {
    tag: "creativity",
    patterns: [/\bcreativ/i, /\bdesign(?:ed|ing)?\b/i, /\bartist/i, /\bbuilt\b|\bbuild\b/i, /\binvent/i, /\bcompos(?:e|ed|er|ing)\b/i, /\bportfolio\b/i, /\bimagin/i],
  },
  {
    tag: "course",
    patterns: [/\bcourse\b/i, /\bclass(?:es)?\b/i, /\bteach\b/i, /\bassignment\b/i, /\bcurricul/i, /\bseminar\b/i, /\bsyllabus\b/i],
  },
  {
    tag: "goals & future",
    patterns: [/\bcareer\s+goals?\b/i, /\bfuture\s+(?:goals?|plans?)\b/i, /\bafter\s+graduat/i, /\baspirations?\b/i, /\bhope\s+to\s+achieve\b/i, /\bplans?\s+beyond\b/i, /\byears?\s+from\s+now\b/i, /\blife\s+goals?\b/i],
  },
  {
    tag: "collaboration",
    patterns: [/\bcollaborat/i, /\bteam(?:mate|work)?\b/i, /\basked?\s+for\s+help\b/i, /\bwork(?:ing|ed)?\s+(?:with|alongside)\b/i, /\bgroup\s+(?:effort|project)\b/i],
  },
  {
    tag: "academic context",
    patterns: [/\bacademic\s+(?:record|performance|preparation|context)\b/i, /\bspecial\s+circumstances\b/i, /\bschool\s+(?:setting|context)\b/i, /\bimpacted\s+your\b/i, /\breadiness\b/i],
  },
];

export type ClassificationResult = {
  primarySlug: string | null;
  secondarySlugs: string[];
  /** Internal matching signal. Never shown to the student. */
  tags: string[];
  confidence: number;
  scores: Record<string, number>;
};

function countHits(text: string, patterns: RegExp[]) {
  return patterns.reduce((hits, pattern) => (pattern.test(text) ? hits + 1 : hits), 0);
}

/**
 * Maps a pre-seven-category slug onto its replacement.
 *
 * Exported because the import path needs it for the static override table and
 * the migration needs it for existing link rows - both should agree with the
 * classifier rather than keep their own copy.
 */
export function mapLegacySlug(slug: string): string {
  return LEGACY_FAMILY_SLUG_MAP[slug] ?? slug;
}

// A pure function over text - no DB access - so it's trivially unit-testable
// and reusable for both prompts and essays.
export function classifyText(text: string): ClassificationResult {
  const scores: Record<string, number> = {};
  for (const rule of RULES) scores[rule.slug] = countHits(text, rule.patterns);

  const tags = TAG_RULES.filter((rule) => countHits(text, rule.patterns) > 0).map((rule) => rule.tag);

  // Precedence, not hit count: the first rule with any match wins. Runner-ups
  // (in rule order) become secondaries.
  const matched = RULES.filter((rule) => scores[rule.slug] > 0);
  if (matched.length === 0) {
    // Still null rather than "other" so callers can tell "no signal" from "a
    // prompt that genuinely belongs in Other". The import path decides which
    // to store.
    return { primarySlug: null, secondarySlugs: [], tags, confidence: 0, scores };
  }

  const primarySlug = matched[0].slug;
  const secondarySlugs = matched.slice(1, 4).map((rule) => rule.slug);

  // Confidence reflects how clearly the winning category was signalled: more
  // distinct phrase hits, and less competition, means higher confidence. It is
  // what drives the needs-review surface, and is always explainable from
  // `scores` alone.
  const topScore = scores[primarySlug];
  const runnerUpScore = secondarySlugs.length > 0 ? scores[secondarySlugs[0]] : 0;
  const confidence = Math.min(100, Math.round((topScore / (topScore + runnerUpScore * 0.5 + 1)) * 100));

  return { primarySlug, secondarySlugs, tags, confidence, scores };
}
