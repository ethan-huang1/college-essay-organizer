// The one admissions cycle this app currently tracks as "current." Bump
// this (and re-verify every officially-verified/previous-cycle source
// record's cycleLabel) when the app moves on to the next cycle.
export const CURRENT_CYCLE_LABEL = "2026–27";

// The cycle a prompt is re-filed under when the catalogue drops it but a
// student has already worked on it: it stays visible and usable for planning
// while counting toward nothing in the current cycle (see progress.ts and
// pruneStalePrompts in college-import.ts).
export const PREVIOUS_CYCLE_LABEL = "2025–26";
