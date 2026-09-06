"use client";

import { useState } from "react";

import { LengthenCoachControl } from "./lengthen-coach-control";
import { PromptFitCoachControl } from "./prompt-fit-coach-control";
import { ReviewCoachControl } from "./review-coach-control";
import { ShortenCoachControl } from "./shorten-coach-control";

/**
 * The AI Coaches panel: one shell, one tab bar, every coach's own control.
 *
 * The shell owns exactly two things - which tab is selected, and the tab
 * labels. It owns no coach state: each coach's hook keeps its own request,
 * results, and staleness, so switching tabs cannot reset another coach's
 * findings.
 *
 * That is also why every registered coach stays mounted and hidden rather
 * than being conditionally rendered: unmounting would throw away a student's
 * results the moment they looked at a different coach, and comparing coaches
 * is the whole point of putting them side by side.
 *
 * The tab bar renders only when there is more than one coach - a one-item
 * switcher is noise.
 */
export function CoachTabs({
  essayId,
  defaultTargetWordCount,
}: {
  essayId: string;
  defaultTargetWordCount: number | null;
}) {
  const coaches = [
    {
      id: "shorten",
      label: "Shorten",
      render: () => <ShortenCoachControl essayId={essayId} defaultTargetWordCount={defaultTargetWordCount} />,
    },
    {
      id: "lengthen",
      label: "Lengthen",
      render: () => <LengthenCoachControl essayId={essayId} defaultTargetWordCount={defaultTargetWordCount} />,
    },
    {
      id: "prompt-fit",
      label: "Prompt fit",
      render: () => <PromptFitCoachControl essayId={essayId} />,
    },
    {
      id: "review",
      label: "Review",
      render: () => <ReviewCoachControl essayId={essayId} />,
    },
  ];
  const [activeId, setActiveId] = useState(coaches[0].id);

  return (
    <div className="coach-panel">
      {coaches.length > 1 ? (
        <div className="coach-tabs" role="tablist" aria-label="AI coaches">
          {coaches.map((coach) => (
            <button
              key={coach.id}
              className="coach-tab"
              type="button"
              role="tab"
              id={`coach-tab-${coach.id}`}
              aria-selected={coach.id === activeId}
              aria-controls={`coach-panel-${coach.id}`}
              onClick={() => setActiveId(coach.id)}
            >
              {coach.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Hidden, not unmounted - see the note above. */}
      {coaches.map((coach) => (
        <div
          key={coach.id}
          id={`coach-panel-${coach.id}`}
          role="tabpanel"
          aria-labelledby={`coach-tab-${coach.id}`}
          hidden={coach.id !== activeId}
        >
          {coach.render()}
        </div>
      ))}
    </div>
  );
}
