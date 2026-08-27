# Qualitative review of recommendation behaviour

Case data: [recommendation-cases.md](recommendation-cases.md), 2,040 pairs — 8 demo
essays against 255 catalogue prompts, scored through the functions the app uses.
Judgements below are mine, from reading the cases rather than the aggregates.

Every case in that file sets `essayFunction: null`, which models **a newly
written essay**. The live path supplies a function for essays already assigned to
a prompt, so an established portfolio scores higher. Both cases are real; the
unassigned one is what a student meets first.

## Verdict on the cases

**Same primary category — correct.** All six of the highest-scoring pairs are
right: the roommate note tops Harvard's roommate prompt (cos 0.471, z 4.24), the
Brown essay tops Brown's own Open Curriculum prompt (cos 0.639, z 3.99), and
"Why I Study Systems" tops Caltech's two Scientific Drive prompts. None of these
is reachable from the category alone — Roommate holds two prompts at very
different lengths, and Why Major holds 61 — so the semantic factor is doing the
ordering, which is what its 35 points are for.

**Ceilings that bind — correct, and legible.** The roommate note against
Stanford's version scores 70 but is held at `reusable-edits` because Stanford
states a 250-word minimum the 120-word note misses. That is the right advice: the
content fits, the length does not. "Fixing the Free Library" against W&L's
800-word Johnson prompt is held down for the same reason at a harsher grade.

**Word count — correct.** No case shows word count moving a score, only a band.
The 500-to-250 style gaps carry no ceiling; only the extremes do.

**`Other` — questionable, and the cause is not the scoring.** `Other` prompts
appear with the reweighted vector (semantic 40, function 25) as designed, and the
best of them reach 53 — `reusable-significant-edits`. But the *pairings* are
weak: "The Kitchen Table Ledger" (a family-remittance identity essay) against
Tufts' "A favorite school assignment", or "A Question About Rivers" against
Brown's "Why PLME?". Those are not reusable pairs, and they surface only because
`Other` gives away no primary points and so leans almost entirely on semantic
similarity. See [other-audit.md](other-audit.md).

**High semantic, low composite — mostly correct, two questionable.** The formula
overruling the model is usually right: a roommate note is not an answer to "what
have you been excited about", whatever the cosine says. Two cases give me pause,
both cross-category:

- "Why Brown, and the Open Curriculum" vs Brown's *own* "Growing up and
  contributing to Brown" — cos 0.467, the highest similarity in the omissions
  list, same school, and scored **45 / new-response**.
- "Why I Study Systems" vs Caltech's "Scholarly Character: Process" — a
  bus-schedule investigation against a prompt about persisting through
  uncertainty in STEM. Also 45.

Both are plausibly reusable and both are declined. That is the pattern below.

## The recurring pattern, and it is structural

Every case in the file shows `Sec 0` and `F 10`. That is the normal state, not an
artefact: secondary overlap is zero on 82% of pairs, and function is a constant
10 for any essay not yet assigned. What is left is

```
25 × [same category]  +  semantic  +  10
```

which collapses four factors into two outcomes:

| Situation | Range | Ceiling in practice |
|---|---|---|
| Same category | 35–70 | exactly **70** |
| Different category | 10–45 | **45 — below the 50 floor** |

**A cross-category pair cannot be recommended at all**, however similar, and
every same-category recommendation piles up on exactly 70: of the 6 pairs whose
score reaches the top band, all 6 sit on its boundary. One point of a noisy
factor decides the label for nearly every best recommendation.

So in practice the system has quietly reverted to deciding on primary category —
not because primary is weighted heavily (it is the smallest factor at 25) but
because the other two discriminating factors are inert. The 44 pairs scoring
exactly 45 are all of the form "semantic says yes, category says no, nothing else
has an opinion".

## The smallest change that would fix it

Supply the essay's function. It is already planned — `origin_prompt_id` captured
at onboarding — and it needs no weight change, no taxonomy change and no scoring
change. Rescoring all 2,040 pairs at each possible value of that one factor:

| Essay function | ≥50 | ≥60 | ≥70 | Cross-category pairs ≥50 |
|---|---|---|---|---|
| unknown (today) | 6.8% | 1.6% | 0.3% | 63 |
| **known, matches prompt** | **21.4%** | **8.2%** | **1.6%** | **293** |
| known, differs | 1.3% | 0.3% | 0.0% | 0 |

Three times the recommendations at the floor, five times at ≥60, and 4.6× as many
cross-category recommendations — while *removing* them entirely where the
function genuinely differs. That last column is the important one: the change
does not inflate scores, it separates the cases. It also unpins the 70 pile-up,
since a same-category pair with a matching function reaches 80.

Nothing else measured here comes close to that effect for that little work.
