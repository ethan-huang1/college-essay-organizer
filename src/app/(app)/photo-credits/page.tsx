import type { Metadata } from "next";

import { SCHOOL_PHOTOS } from "@/lib/school-photos";

export const metadata: Metadata = { title: "Photo credits" };

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
  return (
    <div className="page-frame">
      <header className="section-heading">
        <div>
          <h1>Photo credits</h1>
          <p className="lede">
            Every campus photograph used in this app, with its creator, source and licence.
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

      <p className="credit-disclaimer">
        This is an independent tool. It is not affiliated with, endorsed by, or sponsored by any of
        the colleges or universities named in it. College names are used only to identify the
        institutions whose published essay prompts appear here.
      </p>
    </div>
  );
}
