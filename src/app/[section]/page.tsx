import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

const sections = {
  schools: {
    title: "Schools & prompts",
    eyebrow: "Build the application list",
    description: "School and prompt management is the next organization layer after the local data foundation.",
  },
  essays: {
    title: "Essay library",
    eyebrow: "Keep every draft findable",
    description: "Essay records, family labels, and immutable versions will live here.",
  },
  families: {
    title: "Prompt families",
    eyebrow: "See the shape of the work",
    description: "Explore primary and secondary classifications across schools and prompts.",
  },
  reuse: {
    title: "Reuse map",
    eyebrow: "Connect essays to opportunities",
    description: "Transparent match scores and institution-specific warnings will make reuse decisions understandable.",
  },
} as const;

type SectionName = keyof typeof sections;

export function generateStaticParams() {
  return Object.keys(sections).map((section) => ({ section }));
}

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  return section in sections ? { title: sections[section as SectionName].title } : {};
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!(section in sections)) notFound();

  const content = sections[section as SectionName];
  return (
    <div className="placeholder page-frame">
      <div className="placeholder-copy">
        <p className="eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p className="lede">{content.description}</p>
        <aside className="margin-note">
          <span className="note-kicker">Foundation checkpoint</span>
          This section is intentionally marked as forthcoming while its local data workflow is built and tested.
        </aside>
        <Link className="text-link" href="/">← Return to the writing desk</Link>
      </div>
    </div>
  );
}
