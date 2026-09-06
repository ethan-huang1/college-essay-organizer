/**
 * The autosave state machine, kept pure and out of the component.
 *
 * Three things have to be true and none of them is obvious in a useEffect:
 *
 * 1. at most one request is in flight, so a burst of typing cannot start five
 *    overlapping writes whose arrival order decides what the document says;
 * 2. an out-of-order response never reports "Saved" over text newer than the
 *    text it saved;
 * 3. a conflict or a deleted document stops autosaving instead of retrying
 *    forever - the student's text stays on screen, and the editor says why.
 *
 * The reducer returns the next state and, when it is time, the exact request to
 * make. The component owns the timer and the network; this owns the decisions,
 * which is the part worth testing.
 */

export type SaveResult =
  | { status: "saved"; savedAt: number }
  | { status: "conflict"; savedAt: number }
  | { status: "missing" }
  | { status: "error" };

export type AutosaveStatus = "saved" | "dirty" | "saving" | "error" | "stale";

export type AutosaveState = {
  status: AutosaveStatus;
  /** The text the server has confirmed. */
  savedText: string;
  /** Newer text waiting for a free slot, or null when nothing is waiting. */
  pendingText: string | null;
  inFlight: { text: string; revision: number } | null;
  revision: number;
  /** The lastEditedAt we believe the row carries; sent as the conflict guard. */
  savedAt: number | null;
  note: string | null;
};

export type SaveRequest = { text: string; revision: number; expectedLastEditedAt: number | null };

export type AutosaveEvent =
  | { type: "edit"; text: string }
  /** The debounce elapsed, or something asked for an immediate flush. */
  | { type: "flush" }
  | { type: "settled"; revision: number; result: SaveResult };

export function initialAutosaveState(text: string, savedAt: number | null): AutosaveState {
  return { status: "saved", savedText: text, pendingText: null, inFlight: null, revision: 0, savedAt, note: null };
}

export function isDirty(state: AutosaveState) {
  return state.pendingText !== null || state.inFlight !== null;
}

/** A stale editor must stop writing: the row it is holding no longer matches. */
export function isStale(state: AutosaveState) {
  return state.status === "stale";
}

function start(state: AutosaveState, text: string): { state: AutosaveState; request: SaveRequest } {
  const revision = state.revision + 1;
  return {
    state: { ...state, status: "saving", pendingText: null, inFlight: { text, revision }, revision, note: null },
    request: { text, revision, expectedLastEditedAt: state.savedAt },
  };
}

export function autosaveReducer(
  state: AutosaveState,
  event: AutosaveEvent,
): { state: AutosaveState; request?: SaveRequest } {
  switch (event.type) {
    case "edit": {
      if (state.status === "stale") return { state };
      // Typing back to the saved text is not a change to save.
      if (event.text === state.savedText && state.inFlight === null) {
        return { state: { ...state, status: "saved", pendingText: null } };
      }
      return { state: { ...state, status: state.inFlight ? "saving" : "dirty", pendingText: event.text } };
    }

    case "flush": {
      if (state.status === "stale") return { state };
      // One request at a time. Whatever is waiting goes when this one settles,
      // and only the newest waiting text goes - the intermediate keystrokes are
      // not worth a round trip each.
      if (state.inFlight || state.pendingText === null) return { state };
      return start(state, state.pendingText);
    }

    case "settled": {
      // A response from a request that is no longer the one in flight cannot be
      // allowed to describe the document.
      if (!state.inFlight || state.inFlight.revision !== event.revision) return { state };
      const sent = state.inFlight.text;

      if (event.result.status === "saved") {
        const settled: AutosaveState = {
          ...state,
          savedText: sent,
          savedAt: event.result.savedAt,
          inFlight: null,
          status: state.pendingText === null ? "saved" : "dirty",
          note: null,
        };
        // Newer text arrived while this was in flight: send it now rather than
        // waiting for the next keystroke to restart the debounce.
        return state.pendingText === null ? { state: settled } : start(settled, state.pendingText);
      }

      if (event.result.status === "conflict" || event.result.status === "missing") {
        return {
          state: {
            ...state,
            inFlight: null,
            status: "stale",
            note: event.result.status === "missing"
              ? "This document was deleted. Your text is still on screen — copy anything you need."
              : "This document changed elsewhere — reload to see the current version.",
          },
        };
      }

      // A failed write leaves the text dirty and retryable, never "saved".
      return {
        state: {
          ...state,
          inFlight: null,
          pendingText: state.pendingText ?? sent,
          status: "error",
          note: "Could not save — retrying.",
        },
      };
    }
  }
}
