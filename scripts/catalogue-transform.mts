/**
 * The curated decisions that turn the 2026-27 research master into source
 * records - see build-catalogue.mts, which applies them.
 *
 * Everything here is a judgement a script cannot make from the JSON alone:
 * which rows are not prompts at all, which prompts form a choose-N set, and
 * which notes still carry research scaffolding the owner has since resolved.
 * Keeping them in one file (rather than scattered through the generator) is
 * what makes the transform auditable: the generator is mechanical, this is the
 * argument.
 */

/**
 * Rows in the master that are not prompts, and must never render as one.
 *
 * Indexed into the school's `prompts` array, with the opening words of the row
 * repeated so a mis-numbered entry fails the build instead of silently dropping
 * a real prompt. Every one was confirmed against the master's own notes.
 */
export const DROPPED: [school: string, index: number, startsWith: string, why: string][] = [
  ["Purdue University", 5, "Tell us about an experience you had which connected", "Master marks it not_applicable: contradicted by Purdue's official Honors help centre, retained there only as an audit trail."],
  ["Purdue University", 6, "Tell us about a time you were able to get involved", "Master marks it not_applicable: contradicted by Purdue's official Honors help centre, retained there only as an audit trail."],
  ["Purdue University", 7, "Share about a destination you would like to travel", "Master marks it not_applicable: contradicted by Purdue's official Honors help centre, retained there only as an audit trail."],
  ["Purdue University", 8, "Describe a leadership experience you have had in your", "Master marks it not_applicable: contradicted by Purdue's official Honors help centre, retained there only as an audit trail."],
  ["University of Connecticut", 9, "NOT PUBLICLY PUBLISHED.", "A record that no public prompt text exists, not prompt text."],
  ["Villanova University", 5, "[CONFIRMED NOT PUBLICLY PUBLISHED]", "A record that no public prompt text exists, not prompt text."],
  ["Georgia Institute of Technology", 1, "Responses to essay prompts are required.", "A requirement statement, not a prompt: the Honors portal's questions are not published."],
  ["Georgia Institute of Technology", 2, "The Grand Challenges staff will review their essay", "A description of how the essay is judged, not the prompt."],
  ["Northeastern University", 0, "Personal Statement (500-word limit)", "A portal field label, not a question."],
];

/**
 * Choose-N sets, as the app models them: members become `optional` and the
 * group carries the real obligation in `requiredCount`.
 *
 * Only sets the school actually requires appear here. A set the student may
 * answer "up to two of" but need not answer at all is deliberately absent - a
 * group's requiredCount is added to required work (see summarizeWorkload), so
 * grouping an optional set would invent essays nobody asked for. Those keep
 * their shared cap in conditionalNote instead.
 *
 * `size` is asserted against the school's post-drop prompt count so a shifted
 * index fails the build.
 */
export const GROUPS: {
  school: string;
  size: number;
  groups: { key: string; label: string; requiredCount: number; members: number[]; programKey?: string; programLabel?: string }[];
}[] = [
  { school: "Amherst College", size: 8, groups: [
    { key: "amherst-supplement", label: "Writing supplement (Option A, B or C)", requiredCount: 1, members: [3, 4, 5, 6, 7] },
  ] },
  { school: "Arizona State University", size: 3, groups: [
    { key: "barrett-essay", label: "Barrett Honors essay (choose one)", requiredCount: 1, members: [0, 1, 2], programKey: "barrett-honors-college", programLabel: "Barrett, The Honors College" },
  ] },
  { school: "Boston College", size: 5, groups: [
    { key: "bc-supplemental-question", label: "Supplemental question (choose one)", requiredCount: 1, members: [0, 1, 2, 3] },
  ] },
  { school: "Boston University", size: 3, groups: [
    { key: "bu-kilachand", label: "Kilachand Honors College (choose one)", requiredCount: 1, members: [1, 2], programKey: "kilachand-honors-college", programLabel: "Kilachand Honors College" },
  ] },
  { school: "California Institute of Technology", size: 8, groups: [
    { key: "caltech-scholarly-character", label: "Scholarly Character (choose one)", requiredCount: 1, members: [1, 2] },
    { key: "caltech-scientific-drive", label: "Scientific Drive (choose two)", requiredCount: 2, members: [3, 4, 5] },
  ] },
  { school: "Dartmouth College", size: 9, groups: [
    { key: "dartmouth-introduce", label: "Introduce yourself (choose one)", requiredCount: 1, members: [1, 2] },
    { key: "dartmouth-personal", label: "Longer response (choose one)", requiredCount: 1, members: [3, 4, 5, 6, 7, 8] },
  ] },
  { school: "Emory University", size: 5, groups: [
    { key: "emory-short-answer", label: "Short answer (choose one)", requiredCount: 1, members: [1, 2, 3, 4] },
  ] },
  { school: "Florida State University", size: 10, groups: [
    { key: "fsu-film-screenplay", label: "Screenplay scene (choose one)", requiredCount: 1, members: [2, 3, 4], programKey: "motion-picture-arts", programLabel: "College of Motion Picture Arts (BFA Production or Animation and Digital Arts)" },
  ] },
  { school: "Northwestern University", size: 6, groups: [
    { key: "northwestern-optional", label: "Optional prompts (answer one or two)", requiredCount: 1, members: [1, 2, 3, 4, 5] },
  ] },
  { school: "Pitzer College", size: 3, groups: [
    { key: "pitzer-writing-supplement", label: "Pitzer Writing Supplement (choose one)", requiredCount: 1, members: [0, 1] },
  ] },
  { school: "Pomona College", size: 4, groups: [
    { key: "pomona-short-response", label: "Short response (choose one)", requiredCount: 1, members: [1, 2, 3] },
  ] },
  { school: "Rice University", size: 6, groups: [
    { key: "rice-long-response", label: "500-word response (choose one)", requiredCount: 1, members: [2, 3] },
  ] },
  { school: "Scripps College", size: 4, groups: [
    { key: "scripps-second-essay", label: "Second supplemental essay (choose one)", requiredCount: 1, members: [1, 2, 3] },
  ] },
  { school: "University of Chicago", size: 7, groups: [
    { key: "uchicago-extended-essay", label: "Extended Essay (choose one)", requiredCount: 1, members: [1, 2, 3, 4, 5, 6] },
  ] },
  { school: "University of Michigan", size: 25, groups: [
    { key: "umich-acting-essay", label: "Acting essay (choose one)", requiredCount: 1, members: [21, 22], programKey: "theatre-drama-acting", programLabel: "Theatre & Drama: Acting" },
  ] },
  { school: "University of Notre Dame", size: 5, groups: [
    { key: "nd-short-answer", label: "Short answers (choose two)", requiredCount: 2, members: [1, 2, 3, 4] },
  ] },
  { school: "University of Richmond", size: 3, groups: [
    { key: "richmond-essay", label: "Essay (choose one)", requiredCount: 1, members: [0, 1, 2] },
  ] },
  { school: "Vassar College", size: 4, groups: [
    { key: "vassar-essay", label: "Vassar essay (choose one)", requiredCount: 1, members: [0, 1] },
  ] },
  { school: "Villanova University", size: 5, groups: [
    { key: "villanova-supplement", label: "Writing supplement (choose one)", requiredCount: 1, members: [0, 1, 2, 3, 4] },
  ] },
  { school: "Washington and Lee University", size: 10, groups: [
    { key: "wlu-johnson", label: "Johnson Scholarship (choose one)", requiredCount: 1, members: [5, 6, 7, 8, 9], programKey: "johnson-scholarship", programLabel: "Johnson Scholarship" },
  ] },
  { school: "Yale University", size: 10, groups: [
    { key: "yale-choose-one", label: "Yale essay (choose one)", requiredCount: 1, members: [4, 5, 6] },
  ] },
];

/**
 * Optional sets the school does not require: no group, but every member says
 * how many of the set may be answered so the cap is never lost.
 */
export const OPTIONAL_CAPS: { school: string; members: number[]; note: string }[] = [
  { school: "Duke University", members: [2, 3, 4], note: "Optional: applicants may answer at most one of these three prompts." },
  { school: "George Washington University", members: [0, 1], note: "Optional: applicants may answer one of these two GW Writing Supplement prompts." },
  { school: "Wake Forest University", members: [1, 2, 3, 4], note: "Optional written supplement: choose and respond to one of these four prompts." },
  { school: "Washington and Lee University", members: [1, 2, 3, 4], note: "Optional short answer: choose one of these four, in writing or as a video of at most two minutes." },
  { school: "William & Mary", members: [0, 1, 2, 3, 4, 5], note: "Optional: applicants may answer up to two of these six short-answer prompts." },
  { school: "University of Michigan", members: [10, 11, 12], note: "Optional additional writing for Musical Theatre applicants: choose one of these three prompts, or upload a University of Michigan supplemental essay instead." },
];

/**
 * The seven UC campuses ask the same eight Personal Insight Questions and want
 * four of them, which the master records as eight `conditional` rows per
 * campus. Left literal that reads as 56 unresolved essays across the system;
 * grouped, it reads as the four the UCs actually ask for.
 *
 * `size` is each campus's own total, because three of them add campus-specific
 * portfolio writing on top of the shared eight.
 */
export const UC_PIQ_MEMBERS = [0, 1, 2, 3, 4, 5, 6, 7];
export const UC_CAMPUSES: { school: string; exportName: string; size: number }[] = [
  { school: "University of California, Berkeley", exportName: "universityOfCaliforniaBerkeley", size: 9 },
  { school: "University of California, Los Angeles", exportName: "universityOfCaliforniaLosAngeles", size: 8 },
  { school: "University of California, Davis", exportName: "universityOfCaliforniaDavis", size: 8 },
  { school: "University of California, Irvine", exportName: "universityOfCaliforniaIrvine", size: 15 },
  { school: "University of California, San Diego", exportName: "universityOfCaliforniaSanDiego", size: 15 },
  { school: "University of California, Santa Barbara", exportName: "universityOfCaliforniaSantaBarbara", size: 26 },
  { school: "University of California, Santa Cruz", exportName: "universityOfCaliforniaSantaCruz", size: 8 },
];
for (const campus of UC_CAMPUSES) {
  GROUPS.push({
    school: campus.school,
    size: campus.size,
    groups: [{ key: "uc-piq", label: "Personal Insight Questions (choose four)", requiredCount: 4, members: UC_PIQ_MEMBERS }],
  });
}

/**
 * Prompts the master calls `conditional` whose own condition describes an
 * optional field rather than a gate: "optional field for applicants who…" is
 * an invitation, not a requirement contingent on a program. Left conditional
 * they would each count as an unresolved requirement the student can never
 * settle.
 */
export const REQUIREMENT_OVERRIDES: [school: string, index: number, startsWith: string, requirement: "required" | "optional"][] = [
  ["Amherst College", 2, "If you have engaged in significant research", "optional"],
  ["University of Rochester", 1, "What field/area of study are you interested in researching", "optional"],
  ["University of Southern California", 2, "Starting with the beginning of high school", "optional"],
  // Yale's three short takes are gated on the application platform, not on a
  // programme: every Common App and Coalition applicant answers them, and the
  // master's only scope value is "Yale College", which every Yale applicant
  // belongs to. Left conditional they would sit forever as "depends on your
  // programs" behind a gate that matches everyone. Required, as the previous
  // catalogue also had them, with the QuestBridge carve-out kept in the note.
  ["Yale University", 1, "If you could teach any college course, write a book", "required"],
  ["Yale University", 2, "What is one aspect of yourself that you hope to grow", "required"],
  ["Yale University", 3, "What is something about you that is not included anywhere else", "required"],
];

/**
 * Scope for prompts gated by something real that the master left out of
 * `program_or_major` - an applicant type or a choice the student makes on the
 * application, which the app can resolve the same way it resolves a major.
 */
export const PROGRAM_OVERRIDES: [school: string, index: number, startsWith: string, key: string, label: string][] = [
  ["Brandeis University", 0, "What excites you the most about being an international", "international-applicants", "International applicants"],
  ["North Carolina State University", 1, "Explain why you selected the second choice academic program", "second-choice-major", "Second-choice academic program"],
  ["Purdue University", 2, "Briefly discuss your reasons for pursuing the alternate major", "alternate-major", "Alternate major or campus choice"],
];

/**
 * Prompts whose wording changed too much for the generator to recognise, but
 * which are the same question - checked by hand against the master and the
 * previous catalogue. Carrying the ref across keeps the owner's category review
 * and the committed embedding attached to the question rather than retiring
 * both over a rewrite.
 */
export const REF_CARRYOVER: [school: string, index: number, startsWith: string, ref: string][] = [
  ["Wake Forest University", 0, "Why have you decided to apply to Wake Forest?", "required-why-wake"],
  // Georgetown's per-school essays: the previous catalogue summarised them, the
  // master quotes them. Same question, one per undergraduate school, so the
  // mapping is unambiguous.
  ["Georgetown University", 3, "Founded in 1789, the Georgetown College of Arts & Sciences", "school-essay-college-arts-sciences"],
  ["Georgetown University", 4, "For nearly 50 years, Georgetown University", "school-essay-mccourt"],
  ["Georgetown University", 5, "Through this joint program between the College of Arts & Sciences", "school-essay-earth-commons"],
  ["Georgetown University", 6, "Georgetown University’s Berkley School of Nursing", "school-essay-nursing"],
  ["Georgetown University", 7, "Georgetown University’s School of Health", "school-essay-health"],
  ["Georgetown University", 8, "Georgetown University’s Walsh School of Foreign Service", "school-essay-sfs"],
  ["Georgetown University", 9, "Georgetown University’s McDonough School of Business", "school-essay-mcdonough"],
];
