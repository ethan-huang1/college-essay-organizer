import Link from "next/link";

import { MIN_PASSWORD_LENGTH, safeNextPath } from "@/lib/auth";
import { PendingButton } from "./pending-button";
import { signInAction, signUpAction } from "./auth-actions";

// One card for both pages: the only differences are the copy, the action, and
// the password autocomplete hint.
export function AuthCard({
  mode,
  searchParams,
}: {
  mode: "sign-in" | "sign-up";
  searchParams: { next?: string; error?: string; email?: string };
}) {
  const signingUp = mode === "sign-up";
  const destination = safeNextPath(searchParams.next);
  const error = searchParams.error === "unconfigured"
    ? "This deployment is missing its AUTH_SECRET, so nobody can sign in yet."
    : searchParams.error === "expired"
      ? "Your session expired. Please sign in again."
      : searchParams.error === "account-deleted"
        // Not a failure, but this is the one notice slot the page has, and
        // saying nothing after deleting an account reads as though it failed.
        ? "Your account and all of its essays have been deleted."
        : searchParams.error;

  return (
    <main className="sign-in-frame">
      <div className="sign-in-card">
        <span className="auth-mark" aria-hidden="true">E</span>
        <h1>{signingUp ? "Create your workspace" : "College Essay Organizer"}</h1>
        <p className="sign-in-lede">
          {signingUp
            ? "Track every supplemental prompt on your college list, and see where one essay can answer several."
            : "A private workspace for your college essays. Sign in to reach your schools, prompts, and drafts."}
        </p>

        {error ? <p className="sign-in-error" role="alert">{error}</p> : null}

        <form action={signingUp ? signUpAction : signInAction} className="sign-in-form">
          <input type="hidden" name="next" value={destination} />
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              spellCheck={false}
              defaultValue={searchParams.email ?? ""}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={signingUp ? "new-password" : "current-password"}
              required
              minLength={signingUp ? MIN_PASSWORD_LENGTH : undefined}
            />
            {signingUp ? <span className="field-hint">At least {MIN_PASSWORD_LENGTH} characters.</span> : null}
          </label>
          <PendingButton pendingLabel={signingUp ? "Creating account…" : "Signing in…"}>
            {signingUp ? "Create account" : "Sign in"}
          </PendingButton>
        </form>

        <p className="sign-in-note">
          {signingUp ? (
            <>
              Already have an account? <Link className="text-link" href={`/sign-in?next=${encodeURIComponent(destination)}`}>Sign in</Link>.
              <br />
              Your essays are private to your account.
            </>
          ) : (
            <>
              New here? <Link className="text-link" href={`/sign-up?next=${encodeURIComponent(destination)}`}>Create an account</Link>.
              <br />
              Your essays are private to your account.
            </>
          )}
        </p>
      </div>
    </main>
  );
}
