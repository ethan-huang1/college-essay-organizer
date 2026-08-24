import { getActiveWorkspaceSnapshot } from "@/lib/workspace-session";

import { loadDemoWorkspace, openPersonalWorkspace } from "./workspace-actions";

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

export const dynamic = "force-dynamic";

export default async function Home() {
  const activeWorkspace = await getActiveWorkspaceSnapshot();
  const demoIsActive = activeWorkspace.workspace.kind === "demo";

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
        <article className={`workspace-choice${demoIsActive ? "" : " active"}`}>
          <span className="status-label">
            Personal{demoIsActive ? " · empty" : " · active"}
          </span>
          <h2>Begin with your schools</h2>
          <p>
            Start a clean private workspace, then add schools, prompts, and the essays
            you already have.
          </p>
          <form action={openPersonalWorkspace}>
            <button className="text-link action-link" type="submit">
              {demoIsActive ? "Switch to personal workspace" : "Open personal workspace"}
              <span aria-hidden="true">→</span>
            </button>
          </form>
        </article>

        <article className={`workspace-choice demo${demoIsActive ? " active" : ""}`}>
          <span className="status-label">
            Fictional demo{demoIsActive ? " · active" : " · not loaded"}
          </span>
          <h2>See how reuse works</h2>
          <p>
            Load clearly labeled synthetic schools, prompts, essays, versions, and
            reuse examples. Reloading resets demo records only.
          </p>
          <form action={loadDemoWorkspace}>
            <button className="text-link action-link" type="submit">
              {demoIsActive ? "Reset fictional demo" : "Load fictional demo"}
              <span aria-hidden="true">→</span>
            </button>
          </form>
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
