// A static, well-known reference list of ~100 major U.S. universities and
// colleges for the Add College picker. This is public knowledge (school
// names only, no prompt content) - not researched, and safe to keep as a
// plain list rather than treating it as a "live data" concern. Users can
// always add a school not on this list via manual entry (see school-actions.ts).
export const TOP_UNIVERSITIES: readonly string[] = [
  "Amherst College", "Arizona State University", "Boston College", "Boston University",
  "Bowdoin College", "Brandeis University", "Brown University", "Bucknell University",
  "California Institute of Technology", "Carleton College", "Carnegie Mellon University",
  "Case Western Reserve University", "Claremont McKenna College", "Colby College",
  "Colgate University", "Colorado College", "Columbia University", "Cornell University",
  "Dartmouth College", "Davidson College", "Duke University", "Emory University",
  "Florida State University", "George Washington University", "Georgetown University",
  "Georgia Institute of Technology", "Grinnell College", "Hamilton College", "Harvard University",
  "Harvey Mudd College", "Haverford College", "Indiana University Bloomington",
  "Johns Hopkins University", "Lehigh University", "Massachusetts Institute of Technology",
  "Michigan State University", "Middlebury College", "New York University",
  "North Carolina State University", "Northeastern University", "Northwestern University",
  "Oberlin College", "Ohio State University", "Pennsylvania State University",
  "Pitzer College", "Pomona College", "Princeton University", "Purdue University",
  "Rice University", "Rutgers University", "Scripps College", "Smith College",
  "Stanford University", "Swarthmore College", "Texas A&M University", "Tufts University",
  "Tulane University", "University of California, Berkeley", "University of California, Davis",
  "University of California, Irvine", "University of California, Los Angeles",
  "University of California, San Diego", "University of California, Santa Barbara",
  "University of Chicago", "University of Colorado Boulder", "University of Connecticut",
  "University of Florida", "University of Georgia", "University of Illinois Urbana-Champaign",
  "University of Maryland, College Park", "University of Massachusetts Amherst",
  "University of Miami", "University of Michigan", "University of Minnesota Twin Cities",
  "University of North Carolina at Chapel Hill", "University of Notre Dame",
  "University of Pennsylvania", "University of Pittsburgh", "University of Richmond",
  "University of Rochester", "University of Southern California", "University of Texas at Austin",
  "University of Virginia", "University of Washington", "University of Wisconsin-Madison",
  "Vanderbilt University", "Vassar College", "Villanova University",
  "Virginia Polytechnic Institute and State University", "Wake Forest University",
  "Washington and Lee University", "Washington University in St. Louis", "Wellesley College",
  "Wesleyan University", "Williams College", "Yale University",
  "Reed College", "University of California, Santa Cruz", "William & Mary", "Trinity College",
];

const LOOKUP_BY_LOWERCASE = new Map(TOP_UNIVERSITIES.map((name) => [name.toLowerCase(), name]));

// Short forms of the three canonical names a student is most likely to type
// without their campus suffix. Add College is a free-text input, so a name that
// resolves to nothing silently becomes a manual school with no catalogue record
// and no prompts - which is exactly how one workspace ended up holding a
// "University of Maryland" that read "No verified prompts on file" while the
// catalogue had all six of its questions under the full name.
//
// Written out rather than derived from the comma/"at" split in TOP_UNIVERSITIES:
// that rule yields only these same three entries once ambiguous prefixes are
// discarded, so the generator would be more code than the data it produces.
//
// "University of California" is deliberately absent: seven campuses claim it,
// so there is no single right answer and passing it through unchanged (a manual
// school the student can correct) beats silently picking Berkeley.
const ALIASES_BY_LOWERCASE = new Map([
  ["university of maryland", "University of Maryland, College Park"],
  ["university of north carolina", "University of North Carolina at Chapel Hill"],
  ["university of texas", "University of Texas at Austin"],
]);

// A typed name that case-insensitively matches a top-100 entry resolves to
// that entry's exact canonical spelling/casing, so "stanford university" and
// "Stanford  University" both dedupe to the same school record and both hit
// the curated retrieval dataset (which is keyed by the canonical name).
// Anything else (a school not on the list) passes through unchanged as a
// manual entry.
export function canonicalizeUniversityName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, " ");
  const key = cleaned.toLowerCase();
  return LOOKUP_BY_LOWERCASE.get(key) ?? ALIASES_BY_LOWERCASE.get(key) ?? cleaned;
}
