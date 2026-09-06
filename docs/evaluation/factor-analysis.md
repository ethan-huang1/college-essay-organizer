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
| **describe** | 0.223 | 0.227 | 0.211 | 0.216 | 0.206 | 0.228 | 0.195 | 0.208 |
| **reflect** | 0.227 | 0.265 | 0.253 | 0.244 | 0.224 | 0.272 | 0.231 | 0.224 |
| **explain-impact** | 0.211 | 0.253 | 0.273 | 0.244 | 0.207 | 0.253 | 0.213 | 0.200 |
| **demonstrate-growth** | 0.216 | 0.244 | 0.244 | 0.262 | 0.195 | 0.241 | 0.190 | 0.198 |
| **explain-motivation** | 0.206 | 0.224 | 0.207 | 0.195 | 0.295 | 0.249 | 0.258 | 0.251 |
| **discuss-future-contribution** | 0.228 | 0.272 | 0.253 | 0.241 | 0.249 | 0.303 | 0.267 | 0.249 |
| **connect-to-school** | 0.195 | 0.231 | 0.213 | 0.190 | 0.258 | 0.267 | 0.266 | 0.229 |
| **state-a-future-goal** | 0.208 | 0.224 | 0.200 | 0.198 | 0.251 | 0.249 | 0.229 | 0.327 |

Mean across distinct function pairs: **0.242** within the same group,
**0.218** across groups — a ratio of 1.11×.

Every distinct pair ranked by similarity, so adjacency is read off the corpus
rather than asserted:

| Function A | Function B | Mean similarity | Same group today? |
|---|---|---|---|
| discuss-future-contribution | reflect | 0.272 | no |
| connect-to-school | discuss-future-contribution | 0.267 | yes |
| connect-to-school | explain-motivation | 0.258 | yes |
| discuss-future-contribution | explain-impact | 0.253 | no |
| explain-impact | reflect | 0.253 | yes |
| explain-motivation | state-a-future-goal | 0.251 | yes |
| discuss-future-contribution | state-a-future-goal | 0.249 | yes |
| discuss-future-contribution | explain-motivation | 0.249 | yes |
| demonstrate-growth | explain-impact | 0.244 | yes |
| demonstrate-growth | reflect | 0.244 | yes |
| demonstrate-growth | discuss-future-contribution | 0.241 | no |
| connect-to-school | reflect | 0.231 | no |
| connect-to-school | state-a-future-goal | 0.229 | yes |
| describe | discuss-future-contribution | 0.228 | no |
| describe | reflect | 0.227 | yes |
| explain-motivation | reflect | 0.224 | no |
| reflect | state-a-future-goal | 0.224 | no |
| demonstrate-growth | describe | 0.216 | yes |
| connect-to-school | explain-impact | 0.213 | no |
| describe | explain-impact | 0.211 | yes |
| describe | state-a-future-goal | 0.208 | no |
| explain-impact | explain-motivation | 0.207 | no |
| describe | explain-motivation | 0.206 | no |
| explain-impact | state-a-future-goal | 0.200 | no |
| demonstrate-growth | state-a-future-goal | 0.198 | no |
| demonstrate-growth | explain-motivation | 0.195 | no |
| connect-to-school | describe | 0.195 | no |
| connect-to-school | demonstrate-growth | 0.190 | no |

## 3. Would grading function beat all-or-nothing?

A graded scheme needs an adjacency judgement. The one tested here is derived
from the matrix above: a pair counts as adjacent if its mean similarity is above
the median of all distinct pairs, and it earns half credit.

Median pair similarity is 0.228; 13 of 28 pairs are above it.

Each row rescores every distinct catalogue pair. `Out of` shows the maximum a
pair could reach, which is the reason a weight cannot simply be lowered.

| Function rule | Weight | Redistributed to | Out of | ≥50 | ≥60 | ≥70 | Cross-category ≥50 |
|---|---|---|---|---|---|---|---|
| all-or-nothing (today) | 20 | — (max falls) | 105 | 6.3% | 2.6% | 1.2% | 4878 |
| graded, half credit for adjacent | 20 | — (max falls) | 105 | 7.1% | 3.0% | 1.4% | 5760 |
| all-or-nothing | 15 | — (max falls) | 100 | 4.4% | 2.1% | 0.9% | 1802 |
| graded | 15 | — (max falls) | 100 | 4.8% | 2.4% | 1.0% | 2177 |
| graded, 5 points to semantic | 15 | semantic | 105 | 7.5% | 3.0% | 1.4% | 6794 |
| graded, 5 points to primary | 15 | primary | 105 | 5.6% | 3.2% | 1.6% | 2177 |

