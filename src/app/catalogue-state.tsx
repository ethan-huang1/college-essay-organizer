import type { WorkspaceSnapshot } from "@/lib/workspaces";

type SchoolWithState = WorkspaceSnapshot["schools"][number];

/**
 * One line per state, each of which means something different to a student
 * deciding what to work on. "No supplemental essay" is finished work; "wording
 * not published" is a reason to check back; "needs review" is a reason to look
 * now. Collapsing them into one blank cell was the original bug.
 *
 * These used to be duplicated in the sidebar as bare glyphs - a hourglass, a
 * "?", a "'25" - which nobody could read without a tooltip. The sidebar is
 * gone and the worded version is now the only one.
 */
export const CATALOGUE_STATE_COPY: Record<SchoolWithState["catalogueState"], { badge: string; note: string } | null> = {
  current: null,
  "no-supplement": {
    badge: "No supplemental essay",
    note: "This college asks for no supplemental essay this cycle. Nothing to write here — that is the finished state, not a gap.",
  },
  "not-published": {
    badge: "Wording not published",
    note: "This college has not published its 2026–27 wording yet. Its prompts will import once they are official; add any you already know by hand.",
  },
  "needs-review": {
    badge: "Needs review",
    note: "At least one prompt changed since it was imported. Check the wording before relying on the word limits.",
  },
  "previous-cycle-only": {
    badge: "2025–26 only",
    note: "Only last cycle's prompts are on file. They are useful for planning, but none of them count toward this cycle's work.",
  },
  manual: {
    badge: "Not yet verified",
    note: "No verified prompts on file for this college yet. Add prompts by hand, or check back once the catalogue covers it.",
  },
};

export function CatalogueStateBadge({ school }: { school: SchoolWithState }) {
  const copy = CATALOGUE_STATE_COPY[school.catalogueState];
  return copy ? <span className={`pill ${school.catalogueState}`}>{copy.badge}</span> : null;
}

export function CatalogueStateNote({ school }: { school: SchoolWithState }) {
  const copy = CATALOGUE_STATE_COPY[school.catalogueState];
  return <p className="empty-note">{copy?.note ?? "No prompts on file for this college yet."}</p>;
}
