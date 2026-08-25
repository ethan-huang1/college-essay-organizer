import { LEGACY_FAMILY_SLUG_MAP, RETIRED_FAMILY_TAGS } from "./db/taxonomy";

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
      /\broommates?\b/i,
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
 * Signal worth keeping for matching but not worth a category of its own. These
 * become internal tags; nothing in the UI shows them.
 */
const TAG_RULES: { tag: (typeof RETIRED_FAMILY_TAGS)[number]; patterns: RegExp[] }[] = [
  {
    tag: "intellectual-curiosity",
    patterns: [/\bintellectual\b/i, /\bcuriosity\b/i, /\bresearch\b/i, /\brabbit\s+hole\b/i, /\bnerd\b/i, /\bexplore\s+(?:a\s+)?(?:topic|idea)\b/i, /\bexcites\s+you\b/i],
  },
  {
    tag: "challenge-growth",
    patterns: [/\bchallenge\b/i, /\bsetback\b/i, /\bobstacle\b/i, /\bfailure\b/i, /\bconflict\b/i, /\bresilien/i, /\bovercome|\bovercame\b/i, /\badversity\b/i, /\bmistake\b/i, /\bgrow\s+or\s+develop\b/i],
  },
  {
    tag: "activities-impact",
    patterns: [/\bextracurricular\b/i, /\bleadership\b/i, /\binitiative\b/i, /\bresponsibilit(?:y|ies)\b/i, /\bproject\b/i, /\bwork\s+experience\b/i, /\bemployment\b/i, /\bmade\s+a\s+difference\b/i, /\bimpact\b/i],
  },
  {
    tag: "values-meaning",
    patterns: [/\bvalues?\b/i, /\bbelief\b/i, /\bethical\b/i, /\bdisagree/i, /\bchanged\s+your\s+mind\b/i, /\bopposing\s+view\b/i, /\bwhat\s+matters\s+to\s+you\b/i, /\bprinciple\b/i, /\breconsider/i],
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
