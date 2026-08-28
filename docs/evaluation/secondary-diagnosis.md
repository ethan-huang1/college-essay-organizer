# Diagnosis: the secondary-category factor

It averages 1.4 of 20 across the catalogue cross-product and sits at its floor
on 82% of pairs. This asks whether that is a fault or the expected value of
measuring something genuinely uncommon.

## Supply: are there enough tags to match on?

| | Prompts | Essays (demo) |
|---|---|---|
| Count | 255 | 9 |
| With at least one secondary | 202 (79.2%) | 7 (77.8%) |
| Mean secondaries each | 1.21 | 1.22 |
| Vocabulary size | 17 (review) | 7 distinct emitted |

Distribution of secondaries per prompt:

| Secondaries | Prompts |
|---|---|
| 0 | 53 (20.8%) |
| 1 | 108 (42.4%) |
| 2 | 82 (32.2%) |
| 3 | 11 (4.3%) |
| 4 | 1 (0.4%) |

## Are individual tags too broad or too narrow?

A tag on almost every prompt cannot discriminate; a tag on one or two prompts
can almost never be shared.

| Secondary | Prompts | Share | Essays using it |
|---|---|---|---|
| contribution | 62 | 24.3% | 1 |
| intellectual curiosity | 52 | 20.4% | 0 |
| values & meaning | 37 | 14.5% | 0 |
| activities-impact | 28 | 11.0% | 0 |
| why-us | 24 | 9.4% | 0 |
| goals & future | 19 | 7.5% | 0 |
| creativity | 19 | 7.5% | 2 |
| disagreement | 13 | 5.1% | 4 |
| academic context | 10 | 3.9% | 0 |
| challenge-growth | 8 | 3.1% | 0 |
| leadership | 8 | 3.1% | 0 |
| diversity | 7 | 2.7% | 0 |
| why-major | 6 | 2.4% | 0 |
| course | 5 | 2.0% | 1 |
| service | 5 | 2.0% | 1 |
| collaboration | 3 | 1.2% | 0 |
| community | 3 | 1.2% | 1 |

Seeded tag names never used by the review: 19 of 30 — family, culture, research, entrepreneurship, career goals, future impact, change of mind, achievement, responsibility, interdisciplinary, roommate, gratitude, joy, books/media, unusual format, school-specific, very short response, challenge & growth, activities & impact.

## Do the two sides share a vocabulary in practice?

- Secondaries the review assigns to prompts: 17
- Secondaries the classifier derives from the demo essays: 7
- Assigned to prompts but never derived from an essay: **11** — intellectual curiosity, values & meaning, challenge-growth, why-us, why-major, goals & future, academic context, activities-impact, leadership, collaboration, diversity
- Derived from essays but never assigned to a prompt: 1 — personal-statement

## Expected overlap if the tags were assigned independently

The baseline that decides whether 82%-at-floor is surprising. If two prompts
draw their secondaries independently from the observed distribution, the chance
they share at least one is:

- 309 tag assignments over 255 prompts
- P(share at least one) ≈ **15.2%**
- Measured across all 65,025 pairs: see below

Measured: **15.3%** of pairs share at least one secondary.

## Does it catch anything the semantic factor misses?

This is the question that decides whether the factor earns 20 points. For each
prompt pair sharing a secondary, how similar are they semantically? A pair that
shares a theme *and* is semantically distant is a relationship only this factor
can see - which is the whole argument for having it.

- Mean similarity, pairs sharing a secondary: **0.286** (9,488 pairs)
- Mean similarity, pairs sharing none: **0.232** (54,944 pairs)

**1,236** pairs share a secondary while being semantically distant (cosine < 0.15).
These are the ones the factor exists for:

| Similarity | Shared | Prompt A | Prompt B |
|---|---|---|---|
| -0.151 | contribution | Using your Harvard education | Your unique mark on a Spider community |
| -0.151 | contribution | Your unique mark on a Spider community | Using your Harvard education |
| -0.092 | values & meaning | Faith and decisions | Painting The Rock |
| -0.092 | values & meaning | Painting The Rock | Faith and decisions |
| -0.084 | contribution | Using your Harvard education | Make a space more welcoming |
| -0.084 | contribution | Make a space more welcoming | Using your Harvard education |
| -0.027 | activities-impact | Academic interest (B.S.E. degree) | Advancing equity and justice |
| -0.027 | activities-impact | Advancing equity and justice | Academic interest (B.S.E. degree) |
| -0.011 | intellectual curiosity | Something you are excited about | School-specific: Wharton |
| -0.011 | intellectual curiosity | School-specific: Wharton | Something you are excited about |

And the failure mode, where a shared tag links prompts that are not alike:

| Similarity | Shared | Prompt A | Prompt B |
|---|---|---|---|
| -0.151 | contribution | Using your Harvard education | Your unique mark on a Spider community |
| -0.011 | intellectual curiosity | Something you are excited about | School-specific: Wharton |
| -0.005 | contribution | Your unique mark on a Spider community | Technology and the common good |
| -0.001 | intellectual curiosity | Historical moment you wish you'd witnessed | School-specific: College of Arts and Sciences |
| 0.006 | intellectual curiosity | Historical moment you wish you'd witnessed | PIQ 6: An academic subject that inspires you |

## Obviously related pairs that share no secondary

Same primary category and semantically close, yet no shared secondary - the
factor contributing nothing where a person would expect it to.

**444** such pairs. A sample:

| Similarity | Category | Prompt A (secondaries) | Prompt B (secondaries) |
|---|---|---|---|
| 0.810 | why-major | First-choice major: related experience (activities-impact) | First-choice major (none) |
| 0.810 | why-major | First-choice major (none) | First-choice major: related experience (activities-impact) |
| 0.793 | why-major | Why your chosen major (none) | Why this major? (none) |
| 0.793 | why-major | Why this major? (none) | Why your chosen major (none) |
| 0.762 | why-major | First-choice major (none) | Why this major? (none) |
| 0.762 | why-major | Why this major? (none) | First-choice major (none) |
| 0.760 | why-major | Second-choice major interest (goals & future) | Academic interest (intellectual curiosity) |
| 0.760 | why-major | Academic interest (intellectual curiosity) | Second-choice major interest (goals & future) |
| 0.745 | why-major | First-choice major: goals after Illinois (goals & future) | First-choice major (none) |
| 0.745 | why-major | First-choice major (none) | First-choice major: goals after Illinois (goals & future) |

