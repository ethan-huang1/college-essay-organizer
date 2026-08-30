import { ACTION_LABELS, type RecommendedAction } from "@/lib/matching";

import type { WorkloadSummary } from "@/lib/workload";
import type { WorkspaceSnapshot } from "@/lib/workspaces";

/**
 * Splits required work into the five states a student actually plans around:
 * finished, or needing a light / medium / heavy edit, or needing writing from
 * scratch.
 *
 * Nothing here computes new numbers. `summarizeWorkload` remains the only place
 * required work is counted, and the totals below are taken from it verbatim:
 * `completed` is its `requiredComplete`, and the four editing bands always sum
 * to its `requiredRemaining`. The only judgement made here is *which* band a
 * remaining essay falls into, and that reads the band the matcher already
 * assigned - `recommendedAction` - rather than re-deriving it.
 *
 * A prompt with no match at all is "write from scratch", which is the same
 * thing the reuse view says about it.
 */

export type BandKey = "completed" | "slight" | "moderate" | "major" | "scratch";

export type Band = {
  key: BandKey;
  /** Tile heading, as shown in the interface. */
  title: string;
  /** The one-word gloss under the number. */
  caption: string;
  count: number;
};

/** Ordered from least to most work, which is the order they are displayed in. */
export const BAND_ORDER: readonly BandKey[] = ["completed", "slight", "moderate", "major", "scratch"];

const BAND_COPY: Record<BandKey, { title: string; caption: string }> = {
  completed: { title: "Completed", caption: "Finished" },
  slight: { title: "Slight edits needed", caption: "Light revision" },
  moderate: { title: "Moderate edits needed", caption: "Medium revision" },
  major: { title: "Major edits needed", caption: "Heavy revision" },
  scratch: { title: "Write from scratch", caption: "New response" },
};

/**
 * The matcher's four bands, in the same order and meaning as
 * `ACTION_LABELS` - so "Slight edits needed" here and "Reusable with slight
 * edits" in the reuse view are the same judgement, worded for a different
 * question.
 */
const BAND_FOR_ACTION: Record<RecommendedAction, Exclude<BandKey, "completed">> = {
  "reusable-slight-edits": "slight",
  "reusable-edits": "moderate",
  "reusable-significant-edits": "major",
  "new-response": "scratch",
};

const RANK: Record<Exclude<BandKey, "completed">, number> = {
  slight: 0, moderate: 1, major: 2, scratch: 3,
};

type SnapshotPrompt = WorkspaceSnapshot["prompts"][number];

/** The best band any essay in the library can offer for this prompt. */
function bandForPrompt(prompt: SnapshotPrompt | undefined): Exclude<BandKey, "completed"> {
  if (!prompt) return "scratch";
  let best: Exclude<BandKey, "completed"> = "scratch";
  for (const match of prompt.suggestedMatches) {
    const band = BAND_FOR_ACTION[match.recommendedAction as RecommendedAction];
    if (band && RANK[band] < RANK[best]) best = band;
  }
  return best;
}

export function workloadBands(
  snapshot: WorkspaceSnapshot,
  summary: WorkloadSummary,
): Band[] {
  const byId = new Map(snapshot.prompts.map((prompt) => [prompt.id, prompt]));
  const counts: Record<BandKey, number> = {
    completed: summary.requiredComplete, slight: 0, moderate: 0, major: 0, scratch: 0,
  };

  // A standalone required prompt that is not done needs one essay.
  for (const single of summary.requiredSingles) {
    if (single.done) continue;
    counts[bandForPrompt(byId.get(single.id))] += 1;
  }

  // A choose-N group needs `remaining` more essays, whichever of its unanswered
  // prompts the student picks - so the easiest ones are assumed, which is what
  // the reuse view already recommends.
  for (const group of summary.groups) {
    if (group.remaining <= 0) continue;
    const open = group.prompts
      .filter((entry) => !entry.done)
      .map((entry) => bandForPrompt(byId.get(entry.id)))
      .sort((a, b) => RANK[a] - RANK[b]);
    // A group can require more essays than it has unanswered prompts left only
    // if the catalogue disagrees with itself; count the shortfall as new work
    // rather than losing it from the total.
    for (let index = 0; index < group.remaining; index += 1) {
      counts[open[index] ?? "scratch"] += 1;
    }
  }

  return BAND_ORDER.map((key) => ({ key, ...BAND_COPY[key], count: counts[key] }));
}

/** Sanity: the bands must account for every required essay and no more. */
export function bandsReconcile(bands: Band[], summary: WorkloadSummary): boolean {
  return bands.reduce((total, band) => total + band.count, 0) === summary.requiredTotal;
}

export { ACTION_LABELS };
