# Factor analysis: secondary credit and function adjacency

## 1. What the secondary factor awards today

The implementation pools secondary families and tags, intersects the two sides,
and awards 7 points per shared signal capped at 20. It has never required
matching sets, and no single tag can earn the full 20.

```
shared = (essay secondaries ∪ essay tags) ∩ (prompt secondaries ∪ prompt tags)
       + essay primary, if it appears among the prompt's secondaries
       + prompt primary, if it appears among the essay's secondaries
       − anything equal to "other", which is never a shared theme

points = min(20, 7 × |shared|)
```

| Essay secondaries | Prompt secondaries | Shared | Points |
|---|---|---|---|
| [leadership] | [service] | 0 (none) | **0** |
| [leadership, community, diversity] | [community, service] | 1 (community) | **7** |
| [leadership, community, diversity] | [community, leadership] | 2 (leadership, community) | **14** |
| [leadership, community, diversity] | [community, leadership, diversity] | 3 (leadership, community, diversity) | **20** |
| [leadership, community, diversity, creativity] | [community, leadership, diversity, creativity] | 4 (leadership, community, diversity, creativity) | **20** |
| [contribution] | [contribution] | 1 (contribution) | **7** |
| [—] | [community, service] | 0 (none) | **0** |

And the one case that is not pure tag arithmetic: an essay whose *primary*
subject is one of the prompt's stated sub-themes counts as sharing it, even with
no tags in common. A Community essay against a prompt whose secondaries include
Community is genuinely relevant, and the previous formula recognised this too.

| essay primary `community`, no tags | [community, service] | 1 (via primary) | **7** |
|---|---|---|---|

The owner's example is row 2: an essay tagged leadership/community/identity
against a prompt tagged community/service earns 7 for the shared `community`,
with no penalty for the tags that differ.

## 2. What the function factor does today

All-or-nothing on the points, plus a band ceiling on a cross-group mismatch:

```
both known and equal        → 20 points
either unknown              → 10 points (neutral), no ceiling
known, same group           → 0 points,  no ceiling      ("minor")
known, different group      → 0 points,  ceiling reusable-edits   ("major")
```

Groups are retrospective (describe, reflect, explain-impact,
demonstrate-growth) and forward (explain-motivation,
discuss-future-contribution, connect-to-school, state-a-future-goal).

### Is that two-group split what the prompts actually look like?

Mean similarity between prompts of each function pair. If the two groups are
real, within-group cells should be systematically higher than across-group ones.

| | describe | reflect | explain-i | demonstra | explain-m | discuss-f | connect-t | state-a-f |
|---|---|---|---|---|---|---|---|---|
| **describe** | 0.214 | 0.221 | 0.227 | 0.223 | 0.220 | 0.234 | 0.183 | 0.236 |
| **reflect** | 0.221 | 0.253 | 0.270 | 0.253 | 0.243 | 0.294 | 0.224 | 0.257 |
| **explain-impact** | 0.227 | 0.270 | 0.403 | 0.334 | 0.208 | 0.242 | 0.187 | 0.235 |
| **demonstrate-growth** | 0.223 | 0.253 | 0.334 | 0.275 | 0.222 | 0.248 | 0.189 | 0.245 |
| **explain-motivation** | 0.220 | 0.243 | 0.208 | 0.222 | 0.370 | 0.275 | 0.284 | 0.307 |
| **discuss-future-contribution** | 0.234 | 0.294 | 0.242 | 0.248 | 0.275 | 0.373 | 0.280 | 0.288 |
| **connect-to-school** | 0.183 | 0.224 | 0.187 | 0.189 | 0.284 | 0.280 | 0.260 | 0.244 |
| **state-a-future-goal** | 0.236 | 0.257 | 0.235 | 0.245 | 0.307 | 0.288 | 0.244 | 0.386 |

Mean across distinct function pairs: **0.267** within the same group,
**0.229** across groups — a ratio of 1.17×.

Every distinct pair ranked by similarity, so adjacency is read off the corpus
rather than asserted:

| Function A | Function B | Mean similarity | Same group today? |
|---|---|---|---|
| demonstrate-growth | explain-impact | 0.334 | yes |
| explain-motivation | state-a-future-goal | 0.307 | yes |
| discuss-future-contribution | reflect | 0.294 | no |
| discuss-future-contribution | state-a-future-goal | 0.288 | yes |
| connect-to-school | explain-motivation | 0.284 | yes |
| connect-to-school | discuss-future-contribution | 0.280 | yes |
| discuss-future-contribution | explain-motivation | 0.275 | yes |
| explain-impact | reflect | 0.270 | yes |
| reflect | state-a-future-goal | 0.257 | no |
| demonstrate-growth | reflect | 0.253 | yes |
| demonstrate-growth | discuss-future-contribution | 0.248 | no |
| demonstrate-growth | state-a-future-goal | 0.245 | no |
| connect-to-school | state-a-future-goal | 0.244 | yes |
| explain-motivation | reflect | 0.243 | no |
| discuss-future-contribution | explain-impact | 0.242 | no |
| describe | state-a-future-goal | 0.236 | no |
| explain-impact | state-a-future-goal | 0.235 | no |
| describe | discuss-future-contribution | 0.234 | no |
| describe | explain-impact | 0.227 | yes |
| connect-to-school | reflect | 0.224 | no |
| demonstrate-growth | describe | 0.223 | yes |
| demonstrate-growth | explain-motivation | 0.222 | no |
| describe | reflect | 0.221 | yes |
| describe | explain-motivation | 0.220 | no |
| explain-impact | explain-motivation | 0.208 | no |
| connect-to-school | demonstrate-growth | 0.189 | no |
| connect-to-school | explain-impact | 0.187 | no |
| connect-to-school | describe | 0.183 | no |

## 3. Would grading function beat all-or-nothing?

A graded scheme needs an adjacency judgement. The one tested here is derived
from the matrix above: a pair counts as adjacent if its mean similarity is above
the median of all distinct pairs, and it earns half credit.

Median pair similarity is 0.243; 13 of 28 pairs are above it.

Each row rescores every distinct catalogue pair. `Out of` shows the maximum a
pair could reach, which is the reason a weight cannot simply be lowered.

| Function rule | Weight | Redistributed to | Out of | ≥50 | ≥60 | ≥70 | Cross-category ≥50 |
|---|---|---|---|---|---|---|---|
| all-or-nothing (today) | 20 | — (max falls) | 100 | 5.9% | 2.9% | 1.3% | 503 |
| graded, half credit for adjacent | 20 | — (max falls) | 100 | 6.8% | 3.5% | 1.6% | 560 |
| all-or-nothing | 15 | — (max falls) | 95 | 4.9% | 2.3% | 1.0% | 219 |
| graded | 15 | — (max falls) | 95 | 5.5% | 2.8% | 1.2% | 255 |
| graded, 5 points to semantic | 15 | semantic | 100 | 6.8% | 3.5% | 1.7% | 539 |
| graded, 5 points to primary | 15 | primary | 100 | 6.7% | 3.8% | 1.9% | 255 |

