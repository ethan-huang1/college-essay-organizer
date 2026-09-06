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
| **describe** | 0.183 | 0.188 | 0.175 | 0.191 | 0.188 | 0.197 | 0.179 | 0.203 |
| **reflect** | 0.188 | 0.250 | 0.251 | 0.257 | 0.211 | 0.269 | 0.217 | 0.213 |
| **explain-impact** | 0.175 | 0.251 | 0.288 | 0.261 | 0.207 | 0.282 | 0.216 | 0.209 |
| **demonstrate-growth** | 0.191 | 0.257 | 0.261 | 0.294 | 0.208 | 0.257 | 0.205 | 0.212 |
| **explain-motivation** | 0.188 | 0.211 | 0.207 | 0.208 | 0.279 | 0.246 | 0.273 | 0.261 |
| **discuss-future-contribution** | 0.197 | 0.269 | 0.282 | 0.257 | 0.246 | 0.331 | 0.275 | 0.249 |
| **connect-to-school** | 0.179 | 0.217 | 0.216 | 0.205 | 0.273 | 0.275 | 0.295 | 0.248 |
| **state-a-future-goal** | 0.203 | 0.213 | 0.209 | 0.212 | 0.261 | 0.249 | 0.248 | 0.318 |

Mean across distinct function pairs: **0.240** within the same group,
**0.217** across groups — a ratio of 1.10×.

Every distinct pair ranked by similarity, so adjacency is read off the corpus
rather than asserted:

| Function A | Function B | Mean similarity | Same group today? |
|---|---|---|---|
| discuss-future-contribution | explain-impact | 0.282 | no |
| connect-to-school | discuss-future-contribution | 0.275 | yes |
| connect-to-school | explain-motivation | 0.273 | yes |
| discuss-future-contribution | reflect | 0.269 | no |
| demonstrate-growth | explain-impact | 0.261 | yes |
| explain-motivation | state-a-future-goal | 0.261 | yes |
| demonstrate-growth | discuss-future-contribution | 0.257 | no |
| demonstrate-growth | reflect | 0.257 | yes |
| explain-impact | reflect | 0.251 | yes |
| discuss-future-contribution | state-a-future-goal | 0.249 | yes |
| connect-to-school | state-a-future-goal | 0.248 | yes |
| discuss-future-contribution | explain-motivation | 0.246 | yes |
| connect-to-school | reflect | 0.217 | no |
| connect-to-school | explain-impact | 0.216 | no |
| reflect | state-a-future-goal | 0.213 | no |
| demonstrate-growth | state-a-future-goal | 0.212 | no |
| explain-motivation | reflect | 0.211 | no |
| explain-impact | state-a-future-goal | 0.209 | no |
| demonstrate-growth | explain-motivation | 0.208 | no |
| explain-impact | explain-motivation | 0.207 | no |
| connect-to-school | demonstrate-growth | 0.205 | no |
| describe | state-a-future-goal | 0.203 | no |
| describe | discuss-future-contribution | 0.197 | no |
| demonstrate-growth | describe | 0.191 | yes |
| describe | explain-motivation | 0.188 | no |
| describe | reflect | 0.188 | yes |
| connect-to-school | describe | 0.179 | no |
| describe | explain-impact | 0.175 | yes |

