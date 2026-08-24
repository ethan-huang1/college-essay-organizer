import type { Metadata } from "next";

import { safeNextPath } from "@/lib/auth";
import { signInAction } from "../auth-actions";

export const metadata: Metadata = { title: "Sign in" };

// Renders under the minimal root layout, so it never touches the database and
// stays reachable even if Postgres is unavailable.
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  invalid: "That username and password combination isn't right.",
  unconfigured: "This deployment is missing its sign-in configuration, so nobody can sign in yet.",
  expired: "Your session expired. Please sign in again.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const destination = safeNextPath(next);
  const message = error ? MESSAGES[error] : undefined;

  return (
    <main className="sign-in-frame">
      <div className="sign-in-card">
        <span className="brand-mark" aria-hidden="true">E</span>
        <h1>College Essay Organizer</h1>
        <p className="sign-in-lede">
          A private workspace for your college essays. Sign in to reach your schools, prompts, and drafts.
        </p>

        {message ? <p className="sign-in-error" role="alert">{message}</p> : null}

        <form action={signInAction} className="sign-in-form">
          <input type="hidden" name="next" value={destination} />
          <label>
            Username
            <input name="username" autoComplete="username" required autoFocus spellCheck={false} />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">Sign in</button>
        </form>

        <p className="sign-in-note">
          One shared account guards this deployment. Everything you write stays in your own database.
        </p>
      </div>
    </main>
  );
}
