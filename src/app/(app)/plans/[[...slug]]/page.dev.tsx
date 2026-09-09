import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

// Plans are written by Claude Code to the user's home directory, not into the
// repository, so this reader is a local developer surface. On a deployed
// server the directory simply does not exist and the page shows its empty
// state rather than erroring.
const PLANS_DIR = join(homedir(), ".claude", "plans");

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

type PlanSummary = { slug: string; title: string; updated: Date };

/** First markdown H1, which is the plan's real title. */
function titleOf(text: string, slug: string): string {
  const heading = text.split("\n").find((line) => line.startsWith("# "));
  return heading ? heading.slice(2).trim() : slug.replace(/-/g, " ");
}

async function listPlans(): Promise<PlanSummary[]> {
  let names: string[];
  try {
    names = await readdir(PLANS_DIR);
  } catch {
    return [];
  }

  const plans = await Promise.all(
    names
      .filter((name) => name.endsWith(".md"))
      .map(async (name) => {
        const path = join(PLANS_DIR, name);
        const [text, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
        const slug = name.slice(0, -".md".length);
        return { slug, title: titleOf(text, slug), updated: info.mtime };
      }),
  );

  // Most recently edited first: the plan being worked on is the one wanted.
  return plans.sort((a, b) => b.updated.getTime() - a.updated.getTime());
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!slug?.length) return { title: "Plans" };
  const plan = (await listPlans()).find((candidate) => candidate.slug === slug[0]);
  return { title: `${plan?.title ?? "Plan"} · Plans` };
}

export default async function PlansPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const plans = await listPlans();

  if (slug?.length) {
    // The slug is only ever accepted because it matched a name already in the
    // directory listing, which is what keeps a crafted path from reading an
    // arbitrary file.
    const plan = slug.length === 1 ? plans.find((candidate) => candidate.slug === slug[0]) : undefined;
    if (!plan) notFound();
    const source = await readFile(join(PLANS_DIR, `${plan.slug}.md`), "utf8");

    return (
      <div className="page-frame">
        <header className="section-heading">
          <div>
            <h1>{plan.title}</h1>
            <p className="lede">
              Updated {DATE.format(plan.updated)} · <code>~/.claude/plans/{plan.slug}.md</code>
            </p>
          </div>
          <Link className="text-link" href="/plans">
            All plans
          </Link>
        </header>
        <pre className="plan-source">{source}</pre>
      </div>
    );
  }

  return (
    <div className="page-frame">
      <header className="section-heading">
        <div>
          <h1>Plans</h1>
          <p className="lede">
            {plans.length > 0
              ? `${plans.length} plan${plans.length === 1 ? "" : "s"} from ~/.claude/plans, most recently edited first.`
              : "Plans live in ~/.claude/plans on your own machine."}
          </p>
        </div>
      </header>

      {plans.length > 0 ? (
        <ul className="plans-list">
          {plans.map((plan) => (
            <li key={plan.slug}>
              <Link className="plans-item" href={`/plans/${plan.slug}`}>
                <span>
                  <strong>{plan.title}</strong>
                  <code>{plan.slug}.md</code>
                </span>
                <span>{DATE.format(plan.updated)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">
          No plans found. This reader looks in <code>~/.claude/plans</code>, which exists on the machine
          where Claude Code wrote the plans — not on a deployed server.
        </p>
      )}
    </div>
  );
}
