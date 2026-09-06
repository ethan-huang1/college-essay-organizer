"use client";

import { createContext, useContext, useMemo, useState } from "react";

/**
 * The text currently on screen, shared between DocumentSurface and
 * ShortenControl without lifting the server-rendered editor layout into a
 * client component.
 *
 * `expectedLastEditedAt` is exactly the token DocumentSurface's autosave
 * reducer already tracks as `AutosaveState.savedAt` - "the lastEditedAt we
 * believe the row carries" - mirrored here so Shorten can snapshot it
 * alongside the text it sends, and so Accept can be refused if the essay
 * moved on before the student came back to it.
 */
export type LiveContent = { text: string; expectedLastEditedAt: number | null };

const LiveContentContext = createContext<{ live: LiveContent; setLive: (next: LiveContent) => void } | null>(null);

export function LiveContentProvider({
  children,
  initialContent,
  initialSavedAt,
}: {
  children: React.ReactNode;
  initialContent: string;
  initialSavedAt: number;
}) {
  const [live, setLive] = useState<LiveContent>({ text: initialContent, expectedLastEditedAt: initialSavedAt });
  const value = useMemo(() => ({ live, setLive }), [live]);
  return <LiveContentContext.Provider value={value}>{children}</LiveContentContext.Provider>;
}

export function useLiveContent() {
  const ctx = useContext(LiveContentContext);
  if (!ctx) throw new Error("useLiveContent must be used inside a LiveContentProvider.");
  return ctx;
}
