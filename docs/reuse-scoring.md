# Reuse scoring — authoritative design

**Status: specified, not implemented.** This document is the single source of
truth for how an essay is scored against a prompt. Where it disagrees with any
comment in `src/lib/matching.ts`, the code is the stale one until the stages
below are done.

Everything the previous design contributed — a 60-point primary bonus, an
80-point "ready to reuse" threshold, a corroboration gate, a size factor, a
confidence factor, a rank/badge split, and word-count *penalties* — is
**superseded and must not be reimplemented**. If an identifier from that list
survives anywhere in `src/`, this change is incomplete.

## Why it changed

The shipped formula was `baseline 20 + familyOverlap 60 + wordCountPenalty`. A
shared primary category was worth 60 points, and `20 + 60 = 80` was exactly the
threshold for "ready to reuse". So two prompts sharing a broad category were
called ready to submit unchanged, with nothing else checked — and 106 of 255
prompts were in one category. The score never read the essay.

## The four factors

| Factor | Weight | Scoring | Source |
|---|---|---|---|
| 1. Primary category | **25** | all-or-nothing | `category-review.ts` |
| 2. Semantic similarity | **35** | calibrated z-score (below) | local embedding model |
| 3. Secondary overlap | **20** | 7 per shared secondary or tag, cap 20 | `category-review.ts` |
| 4. Prompt-function fit | **20** | all-or-nothing | `category-review.ts` |

`contentFitScore = sum`, range 0–100. **Nothing is subtracted.** Word count and
school-specificity are editing cost, not content mismatch, and act only as band
ceilings.

Primary category is deliberately the *smallest* factor. A shared category alone
scores 25 → `new-response`; a shared category plus a perfect semantic score
reaches only 60.

### Factor 2 must be calibrated, never raw cosine

Raw cosine between general-purpose embeddings puts almost any essay/prompt pair
in a narrow 0.6–0.9 band — both are English prose about a person — and comparing
a long narrative to a short question compresses it further. Score each prompt
against that essay's own background distribution instead:

```
z       = (cos(essay, prompt) - mean(cos(essay, allPrompts))) / stdev(...)
factor2 = clamp(0, 35, round(35 * (z + 1) / 3))
```

This answers the question that matters — *is this prompt closer than the average
prompt?* — and is immune to the model's absolute band. Assert it: scaling every
cosine by a constant must leave all scores unchanged.

### Factor 2's provider

A **local** ONNX sentence-transformer (all-MiniLM class, ~23 MB quantized). No
network, no API key, no essay text leaving the system, which keeps
`MVP_SPEC.md §5` intact. Prompt vectors are static catalogue data: compute the
255 offline and commit them as JSON. Only essay vectors are computed at runtime,
once per save — not per match and not per page view.

**With no provider configured, factor 2 scores neutral and everything still
works.** That path is the rollback for the whole stage, so it is tested, not
theoretical.

## The `Other` weight vector

`Other` means *no meaningful reusable primary category exists*, so sharing that
label is weak evidence — two bespoke prompts are not the same essay because
neither fitted anywhere. `Other` therefore earns **no primary bonus**, and is
reweighted onto the signals that do carry information:

| Factor | Normal | `Other` |
|---|---|---|
| Primary | 25 | **0 — unavailable** |
| Semantic | 35 | **40** |
| Secondary | 20 | **20** |
| Function | 20 | **25** |
| **Maximum** | 100 | **85** |

Applies when **either side's primary is `Other`**. There is no categorical bar on
reaching the top band: an `Other` pair needs 70 out of the 85 available to it —
82% — so it is possible and demanding. That is the intent.

**Do not confuse two different situations.** `Other` is reweighted because no
category exists. A pair whose primaries merely *differ* (a Community essay
against a Why Major prompt) is **not** reweighted — it scores 0 on factor 1 and
keeps the normal vector. Conflating them would reward genuine category mismatch.

The 40/20/25 split is to be validated, not assumed. The principle is fixed.

## The four bands

"Ready to reuse" does not exist. Essentially every reused essay needs some
tailoring, so no label claims otherwise.

| Score | Internal state | Student-facing label |
|---|---|---|
| 70–100 | `reusable-slight-edits` | Reusable with slight edits |
| 60–69 | `reusable-edits` | Reusable with edits |
| 50–59 | `reusable-significant-edits` | Reusable with significant edits |
| < 50 | `new-response` | New response recommended |

**The 60–69 / 50–59 split is load-bearing and must not be collapsed.** 68 means
"a reasonably strong foundation"; 52 means "substantial material is salvageable
but expect major rewriting". Those are different pieces of advice.

## Band ceilings

Three conditions cap the band irrespective of score. They compose:

```
band = min(bandFromScore, ...ceilings)
```

| Condition | Ceiling |
|---|---|
| School-specificity risk **high** | `reusable-significant-edits` |
| School-specificity risk **medium** | `reusable-edits` |
| Known **major** function mismatch | `reusable-edits` |
| Word count: retention < 0.20 | `reusable-significant-edits` |
| Word count: retention 0.20–0.45 | `reusable-edits` |
| Under-length below a stated minimum | `reusable-edits` |
| No stated minimum, fill < 0.60 | `reusable-edits` |
| No stated minimum, fill < 0.25 | `new-response` |

### Word count is editing cost

`retention = promptMaxWords / essayWordCount`. Cutting and tightening are
ordinary reuse work, so a 500-word essay against a 300-word prompt (retention
0.60) carries **no ceiling at all** and can reach the top band on merit. Only
fundamental compression caps it.

| Example | Retention | Ceiling |
|---|---|---|
| 500 → 400 | 0.80 | none |
| 500 → 300 | 0.60 | none |
| 500 → 250 | 0.50 | none |
| 500 → 150 | 0.30 | `reusable-edits` |
| 500 → 50 | 0.10 | `reusable-significant-edits` |

**The 0.20 and 0.45 boundaries are provisional and must be located by
evaluation**; the owner marked 500→250 "likely" unrestricted and 500→150
"potentially" capped, so the real boundary is somewhere between 0.30 and 0.50.
What is fixed is the principle: *reasonable shortening is normal editing;
fundamental compression is substantial rewriting.*

**Under-length stays more restrictive**, because you cannot condense your way up
to a length you have not written. The `fill < 0.25 → new-response` row preserves
a defect the codebase already fixed once (`matching.ts:74-79`): a 15-word note
scored 80 against a 650-word prompt and was recommended as ready to reuse. Such
an essay is not shortened, it is not yet written. **Removing the word-count
penalty without this ceiling reintroduces that bug.**

### Function mismatch

A known **major** function mismatch prevents the top band. The specification is
the owner's example: a reflective Community essay must not be labelled *Reusable
with slight edits* for a Community prompt asking what the student will contribute
in future, however strongly topic and themes overlap.

Needed because `25 + 35 + 20 = 80` reaches the top band with no function fit.

Two words are doing work:

- **"Known"** — an essay whose function is unknown is *neutral, never
  mismatched*. No cap, no penalty. Otherwise every essay predating onboarding is
  permanently locked out of the top band.
- **"Major"** — `describe → reflect` is a small step; `reflect → discuss-future-
  contribution` is a large one. Build a **mismatch-severity matrix** over the
  eight functions in `category-review.ts`; only major distance caps the band,
  minor distance merely forfeits the 20 points. **Fallback if the matrix cannot
  be justified by evaluation: any mismatch caps.**

An essay's function comes from `origin_prompt_id` (the nullable FK in the
onboarding work). If a student says which prompt an essay was written for, its
function is known exactly.

## Where the essay's own signal comes from

`src/lib/essays.ts` hardcodes `source: "manual"` for every essay family link and
no code path auto-classifies an essay. So essay-side categories are whatever the
student chose, and **"reset to the automatic suggestion" cannot work for essays
until `classifyText` is wired into essay create/update.** That wiring is part of
this work, not a pre-existing capability.

## Evaluation — gates implementation

### Part 1: structural (65,025-pair catalogue cross-product)

Retained, and **explicitly not sufficient**: both sides are catalogue prompts, so
it proves the formula is well-behaved and nothing about whether the advice is
useful. Report:

1. Percentage of pairs in each of the four bands.
2. Band distribution for `Other` specifically, against the non-`Other` baseline.
3. Examples of `Other` pairs reaching 70+, with factor breakdowns — if they do
   not read as genuinely reusable, the `Other` vector is too generous.
4. Boundary examples at 50, 60 and 70, several either side. A 61 and a 59 must be
   visibly different situations or the band split is not real.
5. **False-positive top-band matches** — pairs scoring 70+ a reader would judge
   unreusable. The primary failure mode; hunt it deliberately.
6. Known function-mismatch cases, and confirmation that unknown never caps.
7. Ordinary vs extreme word-count change, and where the retention boundary
   actually falls.
8. Whether strong normal-category matches remain highly ranked.
9. How many pairs cross the raised `new-response` floor (30 → 50).
10. Ceiling attribution: how many pairs are limited by each ceiling, and whether
    any ceiling is doing so much work the score barely matters.

### Part 2: product validation

- **Real essay → prompt matching**, judged by reading the output.
- **Portfolio coverage:** can a diverse portfolio of ~6 essays provide legitimate
  reusable material for a substantial majority of a student's supplemental
  prompts? Run per-school on a realistic 8–12 college list. This is the question
  the product exists to answer, and no aggregate statistic reveals it. A formula
  that scores beautifully and leaves a six-essay portfolio covering 20% of
  prompts has failed.

**Neither part can be replaced by unit tests passing.**

## Acceptance criteria

1. A shared primary alone scores 25 → `new-response`; with a perfect semantic
   score it reaches only 60.
2. A function mismatch keeps the Duke-reflect vs Penn-contribute pair out of the
   top band, asserted by score (64) *and* independently by the ceiling.
3. An `Other` pair earns 0 on factor 1, tops out at 85, and reaches 70 only with
   near-maximal semantic, secondary and function evidence.
4. **No score decreases from word count.** `contentFitScore` is identical for a
   500-word essay against 300-word and 500-word prompts of the same content;
   only the ceiling differs.
5. A 15-word essay against a 650-word no-minimum prompt resolves to
   `new-response`.
6. With no provider configured, every pair still scores and ranks.
7. Committed prompt vectors are byte-stable; a model change is a reviewed commit.
8. Scaling every cosine by a constant leaves all scores unchanged.
9. No `ready-to-reuse`, `minor-adaptation`, `major-adaptation`, `sizeFactor` or
   `confidenceFactor` identifier survives in `src/` — a grep assertion, so the
   superseded design cannot half-survive.
10. Every prompt is reachable: no prompt scores below the floor against *every*
    essay in a reasonable portfolio. This is the regression that would have
    shipped the `Other` problem.

## Renaming `RecommendedAction` touches

- `src/lib/matching.ts` — the type, `recommendAction`, `explain`'s label map
- `src/lib/reuse.ts`, `src/lib/progress.ts` — `inUse` / `withEdits` / `possible`
- `src/app/(app)/[section]/page.tsx` — all reuse copy
- `essay_prompt_matches.recommended_action` — plain `text`, no CHECK constraint,
  so **no migration**; stored values go stale until the reimport recomputes them
- `docs/adaptation-workflow.md` — documents three user-facing states, must become
  four. It is the contract the adaptation feature builds on, so leaving it stale
  propagates the old model forward.

## Taxonomy migration

Primaries 7 → 10: add `challenge-growth`, `reading-list`, `roommate`. Rename
display names `Community & Contribution` → `Community` and `Short Answers` →
`Short Answer`. **Do not rename slugs** — they are join keys referenced by
`LEGACY_FAMILY_SLUG_MAP`.

Secondary tags: five new (`academic context`, `collaboration`, `contribution`,
`course`, `goals & future`); seven of the review's twelve tag secondaries already
exist in `SECONDARY_TAGS`.

Migration `0002` collapsed ten categories into seven and recorded the retired
concept in `prompt_tag_links`, which holds **0 rows** owing to the ordering
defect fixed in `e08247c`. So re-expansion recovers nothing from data — it
re-imports from `category-review.ts`, which is authoritative anyway. Manual links
must survive it: reuse the `manualFamilies` guard in
`src/lib/db/taxonomy-migration.ts`.
