# College Essay Organizer — MVP Product Spec

This file is the full product specification for the College Essay Organizer
MVP. [OVERNIGHT_TASK.md](OVERNIGHT_TASK.md) points here for the Objective;
this document is *what* to build. OVERNIGHT_TASK.md and
[CLAUDE.md](CLAUDE.md) hold *how* to operate (rules, bounded-effort policy,
safety, handoff discipline) — this document doesn't repeat those.

A local, single-user application that helps students organize, match,
reuse, and responsibly revise college essays. The goal is a verified
MVP — not perfect implementation of every possible feature. Work through
the priorities in order (Section 10). If an item becomes blocked, document
it (per OVERNIGHT_TASK.md's bounded-effort rule) and continue with
independent work instead of repeatedly attempting the same failure.

Do not deliberately wait, pad the project, or introduce unnecessary
complexity to consume time.

## 1. Product mission

Build a polished first version that helps a student answer:

1. What essays and versions have I written?
2. What broad prompt family does each school prompt belong to?
3. Which existing essays could be reused or adapted for other prompts?
4. What requirements are missing from a proposed reuse?
5. How can an essay be improved without replacing the student's voice or
   inventing information?

The primary product differentiator is the connection among schools,
prompts, essay families, essay versions, and reuse opportunities. Do not
allow the application to become merely a generic text editor or CRUD
database.

Use the seven prompt categories in section 2, optional secondary tags, and
many-to-many relationships. Prompts and essays may belong to multiple
families, with one optional primary family for organization.

## 2. Prompt-family taxonomy

Seed these seven editable categories:

1. **Community & Contribution** — Belonging, service, collaboration,
   community impact, and intended contribution.
2. **Short Answers** — Roommate notes, lists, favourites, and other
   short-form or character-limited responses.
3. **Identity & Background** — Culture, family, upbringing, identity, lived
   experience, and formative environment.
4. **Why Major** — Academic interests, intended field of study, and reasons
   for pursuing it.
5. **Why Us** — Institutional fit: specific programs, resources, culture,
   location, and intended contribution. Treat this category as highly
   school-specific and warn against careless reuse.
6. **Personal Statement** — Open-ended personal narrative: a defining
   experience, growth, or the central story only you can tell.
7. **Other** — Prompts that do not fit the six above.

**`Other` is a real category, not a queue.** It is where a prompt belongs
when none of the six fit, and it sorts last. Whether a classification needs
a human look is a *separate* question, answered by
`prompts.classificationConfidence`. No view may present `Other` as
"needs categorising".

### Why seven and not ten

This section previously specified ten categories, including Challenge/Setback
& Growth, Intellectual Curiosity, Activities/Leadership & Impact, and Values/
Perspective & Meaning. Those four described **themes a reader might notice in
an essay**, not **the way a student files their own work**: nobody sits down
to write "my values essay", and a prompt about overcoming a setback is a
personal statement that happens to be about a setback. Ten categories made
every classification a judgement call between overlapping options, on both
the app's side and the student's.

The four are retired as user-facing categories but preserved as **internal
matching tags** (`RETIRED_FAMILY_TAGS` in `src/lib/db/taxonomy.ts`), written
by the import path into `prompt_tag_links` / `essay_tag_links` and read by
`matching.ts` as a weak secondary signal. No UI exposes them, and the
category control offers exactly seven options.

Existing workspaces are migrated by `migrateWorkspaceTaxonomy`, which
repoints every link row rather than deleting any, so a student who classified
prompts by hand keeps every one of those classifications.

Seed optional secondary tags including: family, culture, service,
leadership, creativity, research, entrepreneurship, career goals, future
impact, disagreement, change of mind, achievement, responsibility,
interdisciplinary, roommate, gratitude, joy, books/media, unusual format,
school-specific, very short response.

Automatic classifications are suggestions. Users must always be able to
override them.

## 3. Core data model

Design and document a clean data model containing at least: schools,
application cycles, prompts, prompt families, prompt tags, essays, essay
versions, prompt-family relationships, essay-family relationships,
essay-prompt matches, assigned essay responses.

Each **prompt** should support: school; title; full prompt text; minimum
and maximum word count; required or optional status; deadline; application
status; primary family; secondary families and tags; classification
confidence; notes.

Each **essay** should support: title; current content; target word count;
calculated word count; primary family; secondary families and tags;
status (idea, outline, draft, revising, ready, or submitted); linked
prompts and schools; immutable version history; notes; school-specific
phrases or references; last-edited timestamp; canonical essay or
school-specific adaptation designation.

Model prompts and essays with many-to-many relationships. Never assume an
essay belongs to only one family or can answer only one prompt.

Design optional Story Bank entities only after the MVP foundation works
(see Section 10, P1 Phase 6).

## 4. MVP user experience

### Dashboard
Overview showing: schools and application progress; total prompts;
completed, in-progress, and unassigned prompts; prompts without a strong
essay match; reusable essays; approaching deadlines; prompt-family
coverage; recent essays or revisions. Prioritize useful information over
decorative charts.

### Schools and Prompts
Allow the user to: add, edit, and remove schools locally; add and edit
prompts manually; view every prompt and its status; assign an essay or
essay version to a prompt; see word-count compatibility; identify prompts
without an essay; receive a warning if an assigned essay contains another
school's name. Do not implement live prompt scraping — manual entry and
structured import are sufficient.

### Prompt Family Explorer
Support: grouping prompts by the seven categories; primary and secondary
classifications; filtering by school, status, family, word count, and
deadline; manual reclassification; a transparent explanation of
deterministic classifications; viewing related prompts across schools.

### Essay Library
Provide: searchable and filterable essays; family, tag, and status
filters; linked-school and linked-prompt counts; visible word counts;
version history; canonical versus school-specific adaptation labels;
warnings for obviously duplicated or highly similar essays when feasible.

### Reuse Map (core MVP feature)
Show relationships among essays, prompts, and schools. For each
essay–prompt candidate, provide: deterministic match score from 0–100;
matched themes or requirements; important prompt requirements not
addressed; word-count difference; school-specificity risk; recommended
action (ready to reuse / minor adaptation / major adaptation / write a new
response); a short, understandable explanation.

Do not calculate compatibility using category equality alone. Consider:
prompt intent; required subquestions; thematic and tag overlap;
word-count compatibility; format compatibility; missing required content;
school-specific language. A "Why Stanford?"-style response may share a
structure with another "Why Us?" response, but institution-specific
details must sharply reduce direct-reuse compatibility.

### Essay Editor
Build a focused editor with: reliable save or autosave behavior; live word
count and target; associated prompt displayed nearby; prompt-fit
checklist; version history; save-as-new-version behavior; basic comparison
between versions; restore an earlier version without destroying history;
linked prompts and match scores; school-name and institution-specific
phrase warnings.

Implement a small deterministic editing-suggestion workflow for at least:
prompt fit; clarity; concision; word-limit reduction. Suggestions must:
explain the reason for the change; show an understandable before-and-after
difference; be individually accepted or rejected; never silently overwrite
the essay; create a new version when accepted; leave the essay unchanged
when rejected; never invent experiences, facts, emotions, achievements, or
school research; preserve the student as the author.

## 5. Deterministic matching and suggestion architecture

Do not require a paid API key. Create a small provider interface for:
classifying prompts; classifying essays; scoring essay–prompt matches;
producing editing suggestions. Implement a deterministic local/demo
provider so every required workflow can run and be tested without
external services.

Clearly label deterministic demo suggestions. Do not imply that they came
from a real language model.

Keep the architecture adaptable to a future server-side OpenAI or
Anthropic provider, but: do not request or add API keys; do not expose
secrets to the browser; do not invoke the user's Claude or Codex
subscription from the application; do not make paid calls; do not create a
public AI endpoint.

Matching logic must be transparent and testable.

## 6. Empty and demonstration workspaces

The user currently has no real essays available for testing. Provide two
clearly separated states:

1. **Empty personal workspace** with useful onboarding.
2. **Synthetic demo workspace** with fictional schools, prompts, students,
   and essays.

Demo data must be clearly labeled and removable. Never imply that
synthetic essays belong to the user.

The demo workspace should contain: at least three fictional schools;
prompts representing every category that the catalogue can reach (see
section 2 on why Other is excluded from that requirement); at least six
synthetic essays;
multiple versions of at least two essays; examples of strong reuse;
examples requiring substantial adaptation; an example of dangerous
institution-specific reuse.

Support: pasting an essay; loading or resetting demo data; exporting all
workspace data as JSON; importing a compatible JSON backup. Demo and
personal data must never mix silently.

## 7. Technical direction

If an application stack does not already exist, use: Next.js with the
stable App Router; TypeScript in strict mode; Tailwind CSS; local SQLite
with a lightweight typed ORM; a persistence abstraction that can later be
adapted to Postgres; a testing stack appropriate to the chosen framework;
Playwright for at least the critical browser workflow. Do not require
Docker.

Follow existing repository conventions when they exist. Use the existing
package manager. Pin stable dependencies and do not upgrade unrelated
packages without a concrete reason.

Prefer small modules with clear interfaces. Avoid: unnecessary
microservices; agent frameworks; vector databases; elaborate
infrastructure; premature authentication; premature deployment
architecture.

This version is local and single-user. Do not implement public
authentication or deploy it. Keep the data model adaptable to future user
ownership without building that system tonight.

## 8. Visual direction

The application should feel like a serious writing workspace rather than a
generic AI dashboard. Use: calm editorial typography; warm neutral
surfaces; clear information hierarchy; comfortable essay-reading widths;
subtle prompt-family colors; accessible contrast; useful empty states;
polished desktop and mobile layouts; restrained motion that respects
reduced-motion preferences.

Avoid: excessive gradients; glowing AI imagery; cluttered dashboards; tiny
text; cards nested repeatedly inside other cards; distracting decorative
animations; celebration or confetti effects.

## 9. Priority and implementation phases

Complete phases in order. Do not begin a later phase when its foundation
is broken.

After every meaningful verified phase: run the relevant tests and checks;
review the exact diff; update AGENT_HANDOFF.md; commit the verified
checkpoint with a descriptive message; continue without waiting for the
user.

### P0 Phase 1: Foundation
Application setup; database schema and migrations; seeded prompt-family
taxonomy; demo-data system; base design system; navigation; documented
setup instructions (including a `run_tests.sh` at repo root — the overnight
pipeline uses it as the canonical test command, per OVERNIGHT_TASK.md's
test-runner rule).

### P0 Phase 2: Core Organization
School CRUD; prompt CRUD; essay CRUD; primary and secondary
classifications; manual classification override; filtering and search;
empty and demo workspaces.

### P0 Phase 3: Matching and Reuse
Many-to-many relationships; deterministic match scoring; transparent
explanations; missing-requirement detection; recommended reuse action;
Reuse Map; institution-specific reuse warnings; basic prompt-coverage
dashboard.

### P0 Phase 4: Editing and Versions
Essay editor; reliable saving; word count; immutable versions; version
comparison; version restoration; prompt-fit checklist; deterministic
editing suggestions; individual accept and reject behavior.

### P0 Phase 5: Portability and Verification
JSON export; JSON re-import; relationship preservation; unit and
integration tests for core logic; at least one complete Playwright
workflow; production build; desktop and mobile verification; README and
architecture documentation.

Reaching the P0 Definition of Done (Section 11) constitutes a successful
overnight MVP. Do not allow optional features to jeopardize it.

### P1 Phase 6: Story Bank
Only after P0 is verified, add a basic Story Bank supporting: experience
or anecdote; people involved; values demonstrated; skills or traits;
outcomes; sensory details; possible essay families; possible prompts;
overuse indicator; essay-to-story relationships.

### P1 Phase 7: Additional Quality
If time and usage remain after a verified P0: Markdown export; richer
version diff visualization; deadline calendar; prompt comparison; coverage
matrix; duplicate-story warnings; improved keyboard accessibility; loading
and error states; additional Playwright coverage; automated accessibility
checks; performance review; screenshots and extended user documentation.

Do not begin unrelated features merely to extend runtime.

## 10. Required verification

At minimum, verify that: a prompt can have one primary and multiple
secondary families; an essay can relate to prompts at multiple schools;
users can override automatic classifications; "Why Us?" reuse triggers
institution-specific warnings; match scores are deterministic; missing
prompt requirements reduce compatibility; incompatible word counts reduce
compatibility; accepting an editing suggestion creates a version; rejecting
a suggestion leaves the essay unchanged; restoring a version preserves
historical versions; demo data does not mix silently with personal data;
JSON export and re-import preserve core relationships; empty-state
onboarding works; one primary browser workflow works end to end; the
production build completes; primary desktop and mobile layouts have no
horizontal overflow; primary pages have no known console errors.

Never weaken, delete, or bypass a legitimate test merely to make the suite
pass (see OVERNIGHT_TASK.md rule 4).

## 11. P0 Definition of Done

The overnight MVP is successful when: the application can be installed and
started from documented instructions; a user can choose an empty workspace
or clearly labeled demo workspace; schools, prompts, and essays can be
created, viewed, edited, and removed; the seven-category taxonomy supports
primary and secondary relationships; users can override deterministic
classifications; essays can match prompts across multiple schools; the
Reuse Map displays scores, explanations, missing requirements, and
recommendations; school-specific reuse risks are visible; essays can be
edited without destroying version history; the deterministic suggestion
workflow supports accept and reject behavior; JSON backup export and
import preserve core data relationships; required core tests pass; at
least one critical browser workflow passes; the production build succeeds;
primary desktop and mobile layouts are usable; setup, architecture,
limitations, and future AI integration are documented; AGENT_HANDOFF.md
accurately records the final state; the working tree is clean, or every
remaining change is explicitly documented.

P1 and stretch work are optional and must not cause a verified P0 MVP to
become unstable.
