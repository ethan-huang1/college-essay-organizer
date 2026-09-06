"use client";

import { useEffect, useRef, useState } from "react";

import { wordLimitNotes, type WordLimits } from "../../../essay-guidance";
import { autosaveEssayDraftAction, saveEssayVersionAction } from "../../../essay-actions";
import {
  autosaveReducer,
  initialAutosaveState,
  isDirty,
  type AutosaveEvent,
  type AutosaveState,
  type SaveRequest,
} from "./autosave";
import { useLiveContent } from "./live-content-context";

/**
 * The writing surface.
 *
 * This is a plain form whose textarea is the form's `content` field, and the
 * client code only adds behaviour on top of it: a live count, live length
 * guidance, and an idle autosave. With JavaScript off the page is still an
 * ordinary form that posts what was typed to saveEssayVersionAction - there is
 * no hidden mirror of client state to go missing.
 *
 * Autosave writes the draft in place and creates no version. Versions stay
 * something the student asks for, so history remains a short list of meaningful
 * snapshots rather than a transcript of typing.
 */

const IDLE_MS = 1200;

function countWords(text: string) {
  // Deliberately the same rule as wordCount in src/lib/essays.ts, so the live
  // number and the saved number can never disagree.
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

const STATUS_TEXT: Record<AutosaveState["status"], string> = {
  saved: "Saved",
  dirty: "Unsaved changes",
  saving: "Saving…",
  error: "Could not save — retrying",
  stale: "Autosave stopped",
};

export function DocumentSurface({
  essayId,
  initialContent,
  initialSavedAt,
  limits,
}: {
  essayId: string;
  initialContent: string;
  initialSavedAt: number;
  limits: WordLimits;
}) {
  const [text, setText] = useState(initialContent);
  const [state, setState] = useState<AutosaveState>(() => initialAutosaveState(initialContent, initialSavedAt));
  const [savedTime, setSavedTime] = useState<string | null>(null);
  const stateRef = useRef<AutosaveState>(state);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<unknown> | null>(null);
  const { setLive } = useLiveContent();

  // Mirrors the exact text on screen and the same lastEditedAt token autosave
  // uses as its conflict guard, so Shorten can snapshot "what the student
  // currently sees" and later verify nothing changed before accepting it.
  useEffect(() => {
    setLive({ text, expectedLastEditedAt: state.savedAt });
  }, [text, state.savedAt, setLive]);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  // Declarations, so the two can call each other: a settled write is fed back
  // through the same reducer that decided to make it.
  function dispatch(event: AutosaveEvent) {
    const next = autosaveReducer(stateRef.current, event);
    stateRef.current = next.state;
    setState(next.state);
    if (next.request) send(next.request);
  }

  function send(request: SaveRequest) {
    const attempt = autosaveEssayDraftAction(essayId, request.text, request.expectedLastEditedAt)
      .catch(() => ({ status: "error" }) as const)
      .then((result) => {
        if (result.status === "saved") {
          setSavedTime(new Date(result.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
        }
        dispatch({ type: "settled", revision: request.revision, result });
      });
    inFlight.current = attempt;
  }

  const onChange = (value: string) => {
    setText(value);
    dispatch({ type: "edit", text: value });
    clearTimer();
    timer.current = setTimeout(() => dispatch({ type: "flush" }), IDLE_MS);
  };

  // Leaving the editor - the back link, another tab, a reload - must not lose
  // the last thing typed. In-app navigation unmounts this component, so the
  // pending write is fired then; a real unload can only be warned about.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (isDirty(stateRef.current)) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (timer.current) clearTimeout(timer.current);
      const pending = stateRef.current;
      // Fire-and-forget: the request outlives the component, which is the point.
      if (pending.status !== "stale" && pending.pendingText !== null && !pending.inFlight) {
        void autosaveEssayDraftAction(essayId, pending.pendingText, pending.savedAt);
      }
    };
  }, [essayId]);

  // A version save or a restore re-renders this page with new content and a new
  // timestamp. Adopting it while nothing local is pending is what keeps the
  // editor showing the version that actually exists; while something *is*
  // pending, the server's conflict guard turns it into a visible stale state
  // rather than a silent overwrite.
  useEffect(() => {
    if (initialSavedAt === stateRef.current.savedAt || isDirty(stateRef.current)) return;
    stateRef.current = initialAutosaveState(initialContent, initialSavedAt);
    setState(stateRef.current);
    setText(initialContent);
  }, [initialContent, initialSavedAt]);

  // Saving a version must never cut the version from stale text: an autosave in
  // flight is awaited first, so its (older) write cannot land after the version
  // and leave the draft behind the history.
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    clearTimer();
    if (!stateRef.current.inFlight) return;
    event.preventDefault();
    const form = event.currentTarget;
    void (inFlight.current ?? Promise.resolve()).then(() => form.requestSubmit());
  };

  const words = countWords(text);
  const notes = wordLimitNotes(words, limits);
  const limit = limits.target ?? limits.promptMax ?? null;

  return (
    <form action={saveEssayVersionAction} className="document-form" onSubmit={onSubmit}>
      <input name="essayId" type="hidden" value={essayId} />

      <div className="document-bar">
        <p className={`document-count${limit && words > limit ? " over" : ""}`}>
          <strong>{words}</strong>{limit ? ` / ${limit}` : ""} {words === 1 ? "word" : "words"}
        </p>
        <p className={`save-status ${state.status}`} role="status" aria-live="polite">
          {state.status === "saved" && savedTime ? `Saved ${savedTime}` : STATUS_TEXT[state.status]}
        </p>
      </div>

      {state.note ? <p className="document-alert" role="alert">{state.note}</p> : null}
      {notes.length > 0 ? <p className="document-guidance">{notes.join(" · ")}</p> : null}
      {/* Reuse copies an essay in full, so landing here over the limit is
          normal and expected rather than an error. Says where the work of
          adapting it happens - derived from the same count as the line above,
          so the two can never disagree, and not gated on "was reused" because
          an over-limit draft deserves the same pointer however it got here. */}
      {limit && words > limit ? (
        <p className="notice-caution">
          Use the AI Coaches to help adapt this essay to fit this prompt and its requirements.
        </p>
      ) : null}

      <div className="document-field">
        <textarea
          aria-label="Essay text"
          name="content"
          maxLength={20000}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Start writing. Your draft saves itself; “Save version” keeps a snapshot you can come back to."
          autoFocus={initialContent === ""}
        />
      </div>

      <div className="document-actions">
        <label className="document-reason">
          <span>Reason for this version <span className="muted">optional</span></span>
          <input name="reason" maxLength={200} placeholder="Tightened the opening paragraph" />
        </label>
        <button type="submit">Save version</button>
      </div>
    </form>
  );
}
