"use client";

import Link from "next/link";

/**
 * The app's error boundary.
 *
 * Without one, any thrown server action rendered Next's bare "A server error
 * occurred" page - which is what a student saw if they tried to edit the
 * read-only example workspace, the single most likely way to hit an error
 * here. Production redacts the message to a digest, so this cannot echo the
 * cause; it names the likeliest one instead and always offers a way out.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page-frame">
      <div className="card confirm-panel" role="alert">
        <h1>That didn&apos;t go through</h1>
        <p className="confirm-lede">
          Nothing was changed. If you were editing the <strong>Example workspace</strong>, that one is read-only —
          switch to your own workspace from the account menu and try again there.
        </p>
        <p className="detail-note">
          Your own essays are unaffected. If this keeps happening on your own workspace, the reference below helps
          track it down.
          {error.digest ? <> Reference: <code>{error.digest}</code>.</> : null}
        </p>
        <div className="confirm-actions">
          <button className="btn" type="button" onClick={reset}>Try again</button>
          <Link className="btn" href="/">Back to Overview</Link>
        </div>
      </div>
    </div>
  );
}
