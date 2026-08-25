# School-specific adaptation — specification for the next feature

**Status: not implemented.** This repository contains no AI provider, no model
call, and no adaptation code — verified by grep across `src/` and by the
dependency list (`@electric-sql/pglite`, `drizzle-orm`, `next`, `pg`, `react`,
`react-dom`; no AI SDK). No UI control for adaptation exists, and none should be
added until this is built, so that nothing in the product implies a capability it
does not have.

What *is* implemented is the matching and warning semantics this feature would
build on: the app now separates **content fit** from **adaptation required**, and
tells the student which institution-specific material stands between an essay and
submission. It does not change a single word of their writing.

## Why the split matters

A school-specific reference must never disqualify an otherwise relevant essay.
Two independent questions:

1. **Content fit** — does the essay's underlying story answer this prompt?
2. **Adaptation required** — what institution-specific language or fact must
   change before it can be submitted somewhere else?

A strong Stanford "Why Us" essay may be an excellent starting point for Duke and
still be unsubmittable unchanged. The three user-facing states:

| State | Meaning | Internal action |
|---|---|---|
| Ready to reuse | Strong content fit, nothing school-specific to change | `ready-to-reuse` |
| Reusable with edits | Content fits; institution-specific material must be adapted | `minor-adaptation`, `major-adaptation` |
| New response recommended | The content does not answer this prompt | `new-response` |

Content fit alone decides whether an essay is a recommendation. School detection
only decides *which* recommending state. It can never produce
"new response recommended" — that was the defect this replaced.

## The three kinds of school-specific material

Detection must distinguish these, because they carry very different risk. Only
the first is safely suggestible.

### 1. Literal naming
`Stanford` → `Duke`. A substitution may be *suggested* automatically, but must be
highlighted for review, never applied silently.

### 2. Institution-specific facts
Programmes, courses, professors, laboratories, clubs, traditions, events, campus
locations, institutional nicknames.

These require **two independent forms of confidence**, and the second cannot be
supplied by software:

- **Factual verification** — the replacement genuinely exists at the target
  school, is current, and is actually accessible to this student.
- **Student confirmation** — the student is genuinely interested in that specific
  opportunity.

The second is a fact about a person. A model cannot determine it and must not
assume it. Never transform "I'm excited about Stanford's TreeHacks" into a Duke
hackathon because both concern technology. Present verified candidates and ask
which, if any, genuinely interests them — accepting "none of these" as a
complete answer.

### 3. Personal and experiential claims
"I attended…", "When I visited…", "I spoke with Professor…", "I participated
in…".

**Never fabricate or auto-replace these.** They are claims about the student's
life; inventing one would put a false statement in an application. Flag them and
require the student's own words.

## Requirements on any generated adaptation

- Write a **new essay version**; never overwrite the original. The existing
  `saveEssayVersion` already gives immutable version history — use it.
- **Highlight every school-specific change** rather than returning altered prose.
- **Identify claims still needing verification**, distinctly from changes made.
- **Never present an unverified suggestion as a fact.**
- **Ask for confirmation before finalising** any substantive replacement.
- Respect the existing constraint that the deterministic path stays available:
  classification and matching must not come to depend on a provider.

## Suggested build order

1. Classify detected school-specific material into the three kinds above
   (deterministic, no model needed — extends `src/lib/school-mentions.ts`).
2. Surface that classification in the reuse panel, so a student sees *what* needs
   adapting before any generation exists.
3. Only then consider generation, behind explicit per-change confirmation, with
   the verification requirements above.

Steps 1 and 2 need no provider and deliver most of the value: the student learns
exactly what to change. Step 3 is the only part requiring a model, and it is the
part that must never run unattended.

## Related

`prompt_tag_links` / `essay_tag_links` are currently written but read by nothing
(verified by grep). When the matching layer starts consuming them, regenerate
them from prompt text with the deterministic classifier rather than attempting to
recover historical values — see the note in `DEPLOYMENT.md`.
