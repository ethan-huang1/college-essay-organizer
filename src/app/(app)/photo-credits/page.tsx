import type { Metadata } from "next";

import { SCHOOL_LOGOS, logosEnabled } from "@/lib/school-logos";
import { SCHOOL_PHOTOS } from "@/lib/school-photos";

export const metadata: Metadata = { title: "Image credits" };

/**
 * Credit in one place rather than as a caption on every card.
 *
 * A permanent caption across a grid of college cards is visual noise that
 * damages the thing it sits on, so each photograph carries an unobtrusive
 * credit affordance that leads here, where the full attribution has room to be
 * complete: creator, source page, exact licence with a link, and any
 * modifications made.
 */
export default function PhotoCreditsPage() {
  // Only credit logos that are actually being served.
  const logos = logosEnabled() ? SCHOOL_LOGOS : [];

  return (
    <div className="page-frame">
      <header className="section-heading">
        <div>
          <h1>Image credits</h1>
          <p className="lede">
            Every campus photograph and college logo this app uses, with where it came from.
          </p>
        </div>
      </header>

      {SCHOOL_PHOTOS.length === 0 ? (
        <div className="card credit-empty">
          <p>
            No campus photographs are in use. Every college shows a generated mark built from its
            initials — that is a deliberate finished state, not a missing image.
          </p>
          <p className="muted">
            A photograph is only added once a person has confirmed what it shows, where it came
            from, and that its licence permits this use. An image whose subject or licence is
            uncertain loses to the mark.
          </p>
        </div>
      ) : (
        <ul className="credit-list">
          {SCHOOL_PHOTOS.map((photo) => (
            <li className="card credit-entry" key={photo.file}>
              <div className="card-head">
                <div className="card-head-text">
                  <h2>{photo.school}</h2>
                  <p className="card-meta">{photo.attribution}</p>
                </div>
              </div>
              <dl className="credit-detail">
                <dt>Creator</dt>
                <dd>{photo.creator}</dd>
                <dt>Licence</dt>
                <dd>
                  <a className="text-link" href={photo.licenseUrl} target="_blank" rel="noreferrer">
                    {photo.license}
                  </a>
                </dd>
                <dt>Source</dt>
                <dd>
                  <a className="text-link" href={photo.sourcePage} target="_blank" rel="noreferrer">
                    Original page
                  </a>
                </dd>
                <dt>Changes</dt>
                <dd>{photo.modifications}</dd>
                <dt>Retrieved</dt>
                <dd>{photo.retrievedAt}</dd>
              </dl>
            </li>
          ))}
        </ul>
      )}

      {logos.length > 0 ? (
        <section className="credit-section" aria-labelledby="logo-credits">
          <h2 id="logo-credits">College logos</h2>
          <p className="credit-note">
            Each logo below is the trademark of the institution it identifies, and was taken from
            the icon that institution&apos;s own website declares. They appear here only to identify
            each college — not as endorsement, affiliation or sponsorship. To have a logo removed,
            ask and it will be removed.
          </p>
          <ul className="credit-list">
            {logos.map((logo) => (
              <li className="card credit-entry" key={logo.file}>
                <div className="card-head">
                  <div className="card-head-text">
                    <h3>{logo.school}</h3>
                    <p className="card-meta">
                      Trademark of {logo.school}, used for identification only
                    </p>
                  </div>
                </div>
                <dl className="credit-detail">
                  <dt>Declared on</dt>
                  <dd>
                    <a className="text-link" href={logo.declaredOn} target="_blank" rel="noreferrer">
                      {logo.domain}
                    </a>
                  </dd>
                  <dt>Retrieved</dt>
                  <dd>{logo.retrievedAt}</dd>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="credit-disclaimer">
        This is an independent tool. It is not affiliated with, endorsed by, or sponsored by any of
        the colleges or universities named in it. College names and logos are used only to identify
        the institutions whose published essay prompts appear here, and each logo remains the
        trademark of its institution.
      </p>
    </div>
  );
}
