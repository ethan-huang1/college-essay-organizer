import Link from "next/link";

const families = [
  "Personal Statement / Core Story",
  "Identity & Background",
  "Community & Contribution",
  "Challenge, Setback & Growth",
  "Intellectual Curiosity",
  "Why Major / Academic Interests",
  "Why This School / Program",
  "Activities, Leadership & Impact",
  "Values, Perspective & Meaning",
  "Short Takes & Personality",
] as const;

export default function Home() {
  return (
    <div className="page-frame">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Your writing desk</p>
          <h1>One clear view of every essay.</h1>
          <p className="lede">
            Organize drafts, understand what each prompt asks, and find the stories
            worth adapting—without losing your voice.
          </p>
        </div>
        <aside className="margin-note">
          <span className="note-kicker">Getting started</span>
          Keep personal work separate from the fictional demo. You can choose either
          workspace without mixing their essays.
        </aside>
      </header>

      <section className="choice-grid" aria-label="Workspace choices">
        <article className="workspace-choice">
          <span className="status-label">Personal · empty</span>
          <h2>Begin with your schools</h2>
          <p>
            Start a clean private workspace, then add schools, prompts, and the essays
            you already have.
          </p>
          <Link className="text-link" href="/schools">Open personal workspace <span aria-hidden="true">→</span></Link>
        </article>

        <article className="workspace-choice demo">
          <span className="status-label">Fictional · demo preview</span>
          <h2>See how reuse works</h2>
          <p>
            Preview the organizer with clearly labeled synthetic material. Demo data
            loading arrives with the persistence foundation.
          </p>
          <Link className="text-link" href="/reuse">Preview the reuse map <span aria-hidden="true">→</span></Link>
        </article>
      </section>

      <section className="family-section">
        <div className="section-intro">
          <p className="eyebrow">Taxonomy</p>
          <h2>Ten useful families</h2>
          <p>
            Broad enough to reveal reuse opportunities, specific enough to explain why
            two prompts belong together.
          </p>
        </div>
        <div className="family-list">
          {families.map((family, index) => (
            <div className="family-item" key={family}>
              <span className="family-index">{String(index + 1).padStart(2, "0")}</span>
              <span>{family}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
