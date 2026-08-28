import { PROMPT_FUNCTIONS, type PromptFunction } from "./retrieval/category-review";

/**
 * Guesses what a prompt asks the writer to *do*, from its text.
 *
 * Only for prompts the catalogue review has never seen: an origin prompt a
 * student pasted in, or - as a last resort - an essay's own text. Every
 * catalogue prompt has a reviewed function, and that is always preferred, because
 * a person read it.
 *
 * **Measured precision is 76.7%** against the 255 reviewed prompts, on the 45.5%
 * of them where it commits to an answer. That is the number to keep in mind
 * before relying on it: roughly one committed answer in four disagrees with a
 * human reading, which is why a reviewed function always wins and why this is
 * the third and fourth tiers of the precedence chain rather than the first.
 *
 * Deliberately ordered rather than scored. These categories overlap in wording
 * far more than the prompt families do - almost every prompt contains "describe"
 * or "tell us about" somewhere - so what separates them is which request is
 * *central*, and precedence expresses that better than counting hits. A prompt
 * asking what you will contribute at our college is a future-contribution prompt
 * even though it also says "describe".
 *
 * There is no unconditional fallback, and that is the important design choice.
 * An earlier version ended with `describe` as a catch-all and agreed with the
 * review on 56.9% of the catalogue - but 83 of its 110 errors were prompts
 * falling through to `describe`, and a *wrong* function is expensive: it scores
 * 0 of 15 and can trigger the mismatch ceiling. Returning null instead scores
 * neutral, so the honest move is to answer only when a specific request is
 * recognisable and say "unknown" otherwise. Precision matters here; recall does
 * not.
 */
const RULES: { fn: PromptFunction; patterns: RegExp[] }[] = [
  {
    // First. These constructions are unambiguous: a prompt asking what you will
    // bring or contribute is a contribution prompt even when it names the
    // college, and letting the school patterns see it first got that wrong.
    fn: "discuss-future-contribution",
    patterns: [
      /\b(?:would|will)\s+you\s+bring\b/i,
      /\bhow\s+(?:will|would)\s+you\s+contribute\b/i,
      /\bcontribut(?:e|ion|ions)\s+to\s+(?:our|the|this)\b/i,
      /\benrich\b/i,
      /\bmake\s+your\s+mark\b/i,
      /\bwhat\s+(?:perspectives?|aspects?)\s+.{0,40}\b(?:bring|share)\b/i,
      /\blooking\s+forward\s+to\s+sharing\b/i,
    ],
  },
  {
    // After contribution, because "what would you bring to our campus
    // community" names the college and is still a contribution prompt - the
    // request is what matters, not which nouns appear. Before everything else,
    // because a fit prompt usually also mentions a major or a community.
    fn: "connect-to-school",
    patterns: [
      /\bwhy\s+(?:do\s+you\s+want\s+to\s+)?(?:attend|apply|transfer)\b/i,
      /\bwhy\s+(?:us|our|this\s+(?:college|university|school|program))\b/i,
      /\bwhy\s+[A-Z][\w'&.-]{2,}\??/,
      /\b(?:our|this)\s+(?:campus|curriculum|community|university|college)\b/i,
      /\bspecific\s+(?:programs?|resources?|opportunities|courses?|faculty)\b/i,
      /\bhow\s+(?:will|would)\s+you\s+(?:explore|use|engage\s+with)\s+\w+\s+at\b/i,
      /\bfamiliariz(?:e|ed)\s+yourself\s+with\b/i,
      /\bdraws?\s+you\s+to\b.*\bat\b/i,
    ],
  },
  {
    fn: "state-a-future-goal",
    patterns: [
      /\bhope\s+to\s+(?:use|achieve|become|grow|develop)\b/i,
      /\b(?:career|life|future|academic)\s+goals?\b/i,
      /\bplans?\s+(?:beyond|after)\b/i,
      /\baspirations?\b/i,
      /\bwould\s+(?:you\s+)?like\s+to\s+learn\b/i,
      /\bhope\s+to\s+grow\s+or\s+develop\b/i,
      /\bdefine\s+a\s+successful\b/i,
    ],
  },
  {
    fn: "explain-motivation",
    patterns: [
      /\bmotivations?\b/i,
      /\bwhy\s+(?:are|were)\s+you\s+interested\b/i,
      /\bwhy\s+(?:did|have)\s+you\s+chose?n?\b/i,
      /\bwhat\s+(?:led|drew|inspired)\s+you\b/i,
      /\bwhy\s+are\s+you\s+applying\b/i,
      /\bfactors\s+(?:influencing|that\s+influenced)\b/i,
      /\bwhy\s+[a-z]+\?/,
    ],
  },
  {
    fn: "explain-impact",
    patterns: [
      /\bwhat\s+have\s+you\s+done\b/i,
      /\bpositively\s+influenced\b/i,
      /\ba\s+better\s+place\b/i,
      /\bdeveloped\s+and\s+demonstrated\b/i,
      /\btangible\s+steps\b/i,
      /\bimpact\s+(?:you|on\s+those)\b/i,
      /\bin\s+what\s+ways\s+do\s+you\s+hope\s+to\s+make\b/i,
      /\bhow\s+(?:do|have)\s+you\s+foster\b/i,
    ],
  },
  {
    fn: "demonstrate-growth",
    patterns: [
      /\bwhat\s+did\s+you\s+learn\b/i,
      /\bwhat\s+.{0,30}\btaught\s+you\b/i,
      /\bhow\s+(?:did|have)\s+you\s+(?:grow|change|manage)\b/i,
      /\bovercome\b|\bovercame\b/i,
      /\bchanged\s+the\s+way\s+you\b/i,
      /\bhow\s+has\s+(?:it|this)\s+shaped\s+you\b/i,
      /\byour\s+growth\s+into\b/i,
      /\bwhat\s+did\s+you\s+take\s+away\b/i,
    ],
  },
  {
    fn: "reflect",
    patterns: [
      /\breflect\b/i,
      /\bwhy\s+is\s+this\b.*\bmeaningful\b/i,
      /\bwhat\s+does\s+.{0,40}\bmean\s+to\s+you\b/i,
      /\bhow\s+does\s+.{0,40}\binfluence\b/i,
      /\bwhat\s+do\s+you\s+(?:personally\s+)?want\s+to\s+emphasi[sz]e\b/i,
      /\bmost\s+proud\s+of\b/i,
      /\bsignificance\s+to\s+you\b/i,
      /\bresonates?\s+most\s+with\s+you\b/i,
    ],
  },
  // `describe` is deliberately NOT inferrable.
  //
  // It is the largest true class in the catalogue (58 prompts) and also the most
  // loosely worded, so patterns broad enough to catch it swallow the others:
  // measured against the review, including it scored 66.9% precision, and
  // excluding it scored 76.7%. Every prompt it would have claimed becomes
  // "unknown" instead, which matching scores as neutral - a safe answer rather
  // than a confident wrong one.
];

/** The reviewed vocabulary, exported so callers cannot invent a ninth value. */
export { PROMPT_FUNCTIONS };
export type { PromptFunction };

/**
 * The function a prompt's own text suggests, or null when there is nothing to
 * read.
 *
 * Never returns a guess for empty input: null means "unknown", which matching
 * scores as neutral, and inventing `describe` for an empty string would assert a
 * fact about an essay nobody has recorded.
 */
export function inferPromptFunction(title: string, text: string): PromptFunction | null {
  const subject = `${title ?? ""} ${text ?? ""}`.trim();
  if (subject.length < 8) return null;
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(subject))) return rule.fn;
  }
  return null;
}
