"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that disables itself and says what it is doing while its form
 * is in flight.
 *
 * This is the second client component in an otherwise entirely server-rendered
 * app, and the break is deliberate. Adding a college takes about ten seconds
 * against a network database, switching workspaces about the same, and until now
 * the button stayed enabled and nothing on the page changed - so the only
 * feedback a student got was that clicking appeared to do nothing. Several of
 * them would click again.
 *
 * useFormStatus is the whole reason for the "use client" boundary: it reads the
 * pending state of the enclosing <form>, which a server component cannot see.
 * Kept deliberately trivial - no state, no effects, no data fetching - so the
 * client bundle stays a rounding error and there is nothing here to go wrong.
 * Disabling while pending also prevents double submission by construction
 * rather than by de-duplicating on the server.
 */
export function PendingButton({
  children,
  pendingLabel,
  className,
  ariaCurrent,
}: {
  children: React.ReactNode;
  /** Shown in place of the label while the form is submitting. */
  pendingLabel: string;
  className?: string;
  ariaCurrent?: "true";
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending} aria-busy={pending} aria-current={ariaCurrent}>
      {pending ? pendingLabel : children}
    </button>
  );
}
