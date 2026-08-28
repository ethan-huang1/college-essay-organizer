# Reconciliation: manual review against the running system

Source of truth: [source-review.csv](source-review.csv), a byte copy of the
owner's `Essay_Prompt_Category_Review_Claude.csv`.

The owner's decisions applied on top of it - promoting eight prompts to
Activities & Impact and adding it as a secondary to nine others - are encoded in
`scripts/regenerate-category-review.mts`, so the differences reported below
against the raw CSV are expected and are listed as such.

## Every primary category in the review

| Review category | Current taxonomy slug | Reviewed prompts | Catalogue prompts now | Renamed / merged / dropped? |
|---|---|---|---|---|
| Other | `other` | 94 | 80 | no |
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
| Activities & Impact | `activities-impact` | family link | 24 | **no — secondary only** |
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

**32 differences**, all of which should be owner decisions from the
list above rather than losses. Anything here that is not one of those is a bug.

| School | Prompt | Field | Difference |
|---|---|---|---|
| Villanova University | Advancing equity and justice | secondaries | CSV [contribution,service] -> stored [activities-impact,contribution,service] |
| University of Richmond | Make a space more welcoming | secondaries | CSV [contribution] -> stored [activities-impact,contribution] |
| University of California, Berkeley | PIQ 1: Leadership experience | primary | CSV `other` -> stored `activities-impact` |
| University of California, Davis | PIQ 1: Leadership experience | primary | CSV `other` -> stored `activities-impact` |
| University of California, Irvine | PIQ 1: Leadership experience | primary | CSV `other` -> stored `activities-impact` |
| University of California, Los Angeles | PIQ 1: Leadership experience | primary | CSV `other` -> stored `activities-impact` |
| University of California, San Diego | PIQ 1: Leadership experience | primary | CSV `other` -> stored `activities-impact` |
| University of California, Santa Barbara | PIQ 1: Leadership experience | primary | CSV `other` -> stored `activities-impact` |
| University of California, Santa Cruz | PIQ 1: Leadership experience | primary | CSV `other` -> stored `activities-impact` |
| University of California, Berkeley | PIQ 7: Made your community a better place | secondaries | CSV [contribution] -> stored [activities-impact,contribution] |
| University of California, Davis | PIQ 7: Made your community a better place | secondaries | CSV [contribution] -> stored [activities-impact,contribution] |
| University of California, Irvine | PIQ 7: Made your community a better place | secondaries | CSV [contribution] -> stored [activities-impact,contribution] |
| University of California, Los Angeles | PIQ 7: Made your community a better place | secondaries | CSV [contribution] -> stored [activities-impact,contribution] |
| University of California, San Diego | PIQ 7: Made your community a better place | secondaries | CSV [contribution] -> stored [activities-impact,contribution] |
| University of California, Santa Barbara | PIQ 7: Made your community a better place | secondaries | CSV [contribution] -> stored [activities-impact,contribution] |
| University of California, Santa Cruz | PIQ 7: Made your community a better place | secondaries | CSV [contribution] -> stored [activities-impact,contribution] |
| University of Texas at Austin | Proudest activity | primary | CSV `other` -> stored `activities-impact` |
| University of Texas at Austin | Proudest activity | secondaries | CSV [activities-impact] -> stored [] |
| University of Notre Dame | Service to others | secondaries | CSV [contribution,service] -> stored [activities-impact,contribution,service] |
| Princeton University | Your Voice: service and civic engagement | secondaries | CSV [contribution,service,values & meaning] -> stored [activities-impact,contribution,service,values & meaning] |
| North Carolina State University | University Honors: curiosity in action | primary | CSV `other` -> stored `activities-impact` |
| North Carolina State University | University Honors: curiosity in action | secondaries | CSV [activities-impact,intellectual curiosity] -> stored [intellectual curiosity] |
| Harvard University | Activities, employment, travel, or family responsibilities | primary | CSV `other` -> stored `activities-impact` |
| Harvard University | Activities, employment, travel, or family responsibilities | secondaries | CSV [activities-impact] -> stored [] |
| Stanford University | An extracurricular, job, or responsibility | primary | CSV `other` -> stored `activities-impact` |
| Stanford University | An extracurricular, job, or responsibility | secondaries | CSV [activities-impact] -> stored [] |
| Washington and Lee University | Life outside school | primary | CSV `other` -> stored `activities-impact` |
| Washington and Lee University | Life outside school | secondaries | CSV [activities-impact,contribution] -> stored [contribution] |
| Georgetown University | Most significant activity | primary | CSV `other` -> stored `activities-impact` |
| Georgetown University | Most significant activity | secondaries | CSV [activities-impact] -> stored [] |
| University of Richmond | Turn ideas into actions | primary | CSV `other` -> stored `activities-impact` |
| University of Richmond | Turn ideas into actions | secondaries | CSV [activities-impact,challenge-growth,contribution] -> stored [challenge-growth,contribution] |

## The two categories in question

### Activities & Impact

- As a **primary** in the review: **0** prompts
- As a **secondary** in the review: **24** prompts
- Filed `Other` with Activities & Impact as its *first* secondary: **16** prompts

Those prompts, which are the ones a promotion would move:

- Proudest activity — University of Texas at Austin · secondaries [Activities & Impact]
- Activities, employment, travel, or family responsibilities — Harvard University · secondaries [Activities & Impact]
- An extracurricular, job, or responsibility — Stanford University · secondaries [Activities & Impact]
- Life outside school — Washington and Lee University · secondaries [Activities & Impact, Contribution]
- An engineering or science project — Tufts University · secondaries [Activities & Impact, Creativity]
- M&T: Something you built — University of Pennsylvania · secondaries [Activities & Impact, Creativity]
- Most significant activity — Georgetown University · secondaries [Activities & Impact]
- PIQ 3: Greatest talent or skill _(×7)_ — UC systemwide · secondaries [Activities & Impact]
- Scientific Drive: Making — California Institute of Technology · secondaries [Activities & Impact, Creativity]
- Turn ideas into actions — University of Richmond · secondaries [Activities & Impact, Contribution, Challenge & Growth]

### Creativity

- As a **primary** in the review: **0** prompts
- As a **secondary** in the review: **19** prompts
- Filed `Other` with Creativity as its *first* secondary: **9** prompts

Those prompts, which are the ones a promotion would move:

- BA+BFA: artistic influences — Oberlin College · secondaries [Creativity, Intellectual Curiosity]
- A specific portfolio piece — Tufts University · secondaries [Creativity]
- PIQ 2: Creative side _(×7)_ — UC systemwide · secondaries [Creativity]

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
| Activities & Impact | 1 | Three Years of Saturday Mornings |
| Identity & Background | 1 | The Kitchen Table Ledger |
| Roommate | 1 | What I Would Bring to a Hall |
| Why Us | 1 | Why Brown, and the Open Curriculum |
| _(all others)_ | 0 | — |

Total: 9 synthetic essays across 8 of 11 categories. 72.7% coverage.

