"use client";

import { useSyncExternalStore } from "react";

/**
 * A timestamp in the reader's own timezone.
 *
 * Version history is labelled by when it was saved rather than by a number, and
 * a time is only useful if it is the reader's. The server renders in UTC on
 * Vercel, so the server-rendered text is a neutral, explicitly-UTC fallback and
 * the browser formats it locally once hydrated. `dateTime` carries the exact
 * instant either way, so the markup is correct before hydration too.
 */

// Subscribing to nothing: the value only ever differs between the server
// snapshot and the client one, which is exactly the question being asked.
const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

export function LocalTime({ iso, withDate }: { iso: string; withDate?: boolean }) {
  const hydrated = useSyncExternalStore(subscribe, onClient, onServer);
  const date = new Date(iso);

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {hydrated ? localLabel(date, withDate) : utcLabel(date, withDate)}
    </time>
  );
}

function localLabel(date: Date, withDate?: boolean) {
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  // Today needs no date; anything older is ambiguous without one.
  const sameDay = new Date().toDateString() === date.toDateString();
  return sameDay || !withDate
    ? time
    : `${date.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

function utcLabel(date: Date, withDate?: boolean) {
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return withDate
    ? `${date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}, ${time} UTC`
    : `${time} UTC`;
}
