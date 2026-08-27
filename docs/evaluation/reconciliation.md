# Reconciliation: manual review against the running system

Source of truth: [source-review.tsv](source-review.tsv), the transcription of
the owner's `Essay_Prompt_Category_Review_Claude.csv`.

## Every primary category in the review

| Review category | Current taxonomy slug | Reviewed prompts | Catalogue prompts now | Renamed / merged / dropped? |
|---|---|---|---|---|
| Other | `other` | 94 | 94 | no |
| Why Major | `why-major` | 61 | 61 | no |
| Background & Identity | `diversity` | 30 | 30 | renamed to `Identity & Background` |
| Challenge & Growth | `challenge-growth` | 23 | 23 | no |
| Why Us | `why-us` | 22 | 22 | no |
| Short Answer | `shorts` | 13 | 13 | no |
| Community | `community` | 7 | 7 | no |
| Roommate | `roommate` | 2 | 2 | no |
| Personal Statement | `personal-statement` | 2 | 2 | no |
| Reading List | `reading-list` | 1 | 1 | no |

## Every secondary category in the review

| Review secondary | Stored as | Kind | Reviewed assignments | Also a primary in the review? |
|---|---|---|---|---|
| Contribution | `contribution` | prompt tag | 62 | **no — secondary only** |
| Intellectual Curiosity | `intellectual curiosity` | prompt tag | 52 | **no — secondary only** |
| Values | `values & meaning` | prompt tag | 37 | **no — secondary only** |
| Activities & Impact | `activities & impact` | prompt tag | 24 | **no — secondary only** |
| Why Us | `why-us` | family link | 24 | yes |
| Goals & Future | `goals & future` | prompt tag | 19 | **no — secondary only** |
| Creativity | `creativity` | prompt tag | 19 | **no — secondary only** |
| Disagreement | `disagreement` | prompt tag | 13 | **no — secondary only** |
| Academic Context | `academic context` | prompt tag | 10 | **no — secondary only** |
| Challenge & Growth | `challenge-growth` | family link | 8 | yes |
| Leadership | `leadership` | prompt tag | 8 | **no — secondary only** |
| Background & Identity | `diversity` | family link | 7 | yes |
| Why Major | `why-major` | family link | 6 | yes |
| Course | `course` | prompt tag | 5 | **no — secondary only** |
| Service | `service` | prompt tag | 5 | **no — secondary only** |
| Community | `community` | family link | 3 | yes |
| Collaboration | `collaboration` | prompt tag | 3 | **no — secondary only** |

## Did anything get lost between the review and the catalogue?

**No.** All 255 reviewed prompts carry exactly the primary and secondary
assignments the review gives them. Nothing was renamed away, merged, dropped, or
left in `Other` against the review's instruction.

## The two categories in question

### Activities & Impact

- As a **primary** in the review: **0** prompts
- As a **secondary** in the review: **24** prompts
- Filed `Other` with Activities & Impact as its *first* secondary: **16** prompts

Those prompts, which are the ones a promotion would move:

- Proudest activity — University of Texas at Austin · secondaries [Activities & Impact] · function REFL
- Activities, employment, travel, or family responsibilities — Harvard University · secondaries [Activities & Impact] · function DESC
- An extracurricular, job, or responsibility — Stanford University · secondaries [Activities & Impact] · function DESC
- Life outside school — Washington and Lee University · secondaries [Activities & Impact, Contribution] · function GROWTH
- An engineering or science project — Tufts University · secondaries [Activities & Impact, Creativity] · function DESC
- M&T: Something you built — University of Pennsylvania · secondaries [Activities & Impact, Creativity] · function DESC
- Most significant activity — Georgetown University · secondaries [Activities & Impact] · function REFL
- PIQ 3: Greatest talent or skill _(×7)_ — UC systemwide · secondaries [Activities & Impact] · function IMPACT
- Scientific Drive: Making — California Institute of Technology · secondaries [Activities & Impact, Creativity] · function DESC
- Turn ideas into actions — University of Richmond · secondaries [Activities & Impact, Contribution, Challenge & Growth] · function GROWTH

### Creativity

- As a **primary** in the review: **0** prompts
- As a **secondary** in the review: **19** prompts
- Filed `Other` with Creativity as its *first* secondary: **9** prompts

Those prompts, which are the ones a promotion would move:

- BA+BFA: artistic influences — Oberlin College · secondaries [Creativity, Intellectual Curiosity] · function DESC
- A specific portfolio piece — Tufts University · secondaries [Creativity] · function DESC
- PIQ 2: Creative side _(×7)_ — UC systemwide · secondaries [Creativity] · function DESC

## Essays

**There are no real student essays in this repository.** The only essay-shaped
data is the eight synthetic samples in `DEMO_ESSAYS`, written for the example
workspace and explicitly labelled as not the user's writing. Every earlier
measurement that needed an essay side used either those eight or catalogue
prompts standing in as ideal answers.

Prompts-as-essays are **not** essay counts and must not be read as any. A
per-category count of real essays cannot be produced from this repository at
all; it would need a production database, which this pass does not touch.

For completeness, the eight demo essays by primary category:

| Category | Demo essays | Titles |
|---|---|---|
| Other | 2 | The Argument I Lost; A Question About Rivers |
| Personal Statement | 1 | The Metronome |
| Why Major | 1 | Why I Study Systems |
| Community | 1 | Fixing the Free Library |
| Identity & Background | 1 | The Kitchen Table Ledger |
| Roommate | 1 | What I Would Bring to a Hall |
| Why Us | 1 | Why Brown, and the Open Curriculum |
| _(all others)_ | 0 | — |

Total: 8 synthetic essays across 7 of 10 categories. 70.0% coverage.

