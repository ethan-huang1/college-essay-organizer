import { workState } from "@/lib/progress";
import type { WorkspaceSnapshot } from "@/lib/workspaces";

/**
 * The filter predicates, lifted out of the view so they can be tested.
 *
 * The redesign moved the filter controls from a bare form into a toolbar with
 * removable chips, which is exactly the kind of change that can quietly alter a
 * result set. The predicates themselves are unchanged - same fields, same
 * precedence, same case-insensitive substring search over the same haystack -
 * and `filtering.test.ts` pins that down so "only presentation moved" is a
 * verified claim rather than an assurance.
 */
export type Filters = {
  school: string;
  family: string;
  status: string;
  q: string;
  edit: string;
  remove: string;
};

type SnapshotPrompt = WorkspaceSnapshot["prompts"][number];
type SnapshotEssay = WorkspaceSnapshot["essays"][number];

/** An empty filter value means "no constraint", not "match the empty string". */
export function promptMatchesFilters(
  prompt: SnapshotPrompt,
  filters: Filters,
  schoolNames: Map<string, string>,
): boolean {
  if (filters.school && prompt.schoolId !== filters.school) return false;
  if (
    filters.family
    && prompt.primaryFamily?.id !== filters.family
    && !prompt.secondaryFamilies.some((family) => family.id === filters.family)
  ) {
    return false;
  }
  if (filters.status && workState(prompt) !== filters.status) return false;
  const query = filters.q.trim().toLowerCase();
  if (query) {
    // Title, full prompt text, and the school's name - so searching "Brown"
    // finds that campus's prompts even though the prompt never says "Brown".
    const haystack = `${prompt.title} ${prompt.promptText} ${schoolNames.get(prompt.schoolId) ?? ""}`.toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}

export function essayMatchesFilters(essay: SnapshotEssay, filters: Filters): boolean {
  if (filters.status && essay.status !== filters.status) return false;
  if (
    filters.family
    && essay.primaryFamily?.id !== filters.family
    && !essay.secondaryFamilies.some((family) => family.id === filters.family)
  ) {
    return false;
  }
  const query = filters.q.trim().toLowerCase();
  if (
    query
    && !essay.title.toLowerCase().includes(query)
    && !essay.currentContent.toLowerCase().includes(query)
  ) {
    return false;
  }
  return true;
}
