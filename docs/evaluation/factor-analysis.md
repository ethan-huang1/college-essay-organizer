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
| **describe** | 0.184 | 0.196 | 0.181 | 0.198 | 0.192 | 0.202 | 0.183 | 0.199 |
| **reflect** | 0.196 | 0.250 | 0.251 | 0.257 | 0.212 | 0.269 | 0.217 | 0.211 |
| **explain-impact** | 0.181 | 0.251 | 0.288 | 0.261 | 0.208 | 0.282 | 0.216 | 0.209 |
| **demonstrate-growth** | 0.198 | 0.257 | 0.261 | 0.294 | 0.209 | 0.257 | 0.205 | 0.211 |
| **explain-motivation** | 0.192 | 0.212 | 0.208 | 0.209 | 0.283 | 0.248 | 0.275 | 0.262 |
| **discuss-future-contribution** | 0.202 | 0.269 | 0.282 | 0.257 | 0.248 | 0.331 | 0.275 | 0.249 |
| **connect-to-school** | 0.183 | 0.217 | 0.216 | 0.205 | 0.275 | 0.275 | 0.295 | 0.248 |
| **state-a-future-goal** | 0.199 | 0.211 | 0.209 | 0.211 | 0.262 | 0.249 | 0.248 | 0.317 |

Mean across distinct function pairs: **0.242** within the same group,
**0.218** across groups — a ratio of 1.11×.

Every distinct pair ranked by similarity, so adjacency is read off the corpus
rather than asserted:

| Function A | Function B | Mean similarity | Same group today? |
|---|---|---|---|
| discuss-future-contribution | explain-impact | 0.282 | no |
| connect-to-school | explain-motivation | 0.275 | yes |
| connect-to-school | discuss-future-contribution | 0.275 | yes |
| discuss-future-contribution | reflect | 0.269 | no |
| explain-motivation | state-a-future-goal | 0.262 | yes |
| demonstrate-growth | explain-impact | 0.261 | yes |
| demonstrate-growth | discuss-future-contribution | 0.257 | no |
| demonstrate-growth | reflect | 0.257 | yes |
| explain-impact | reflect | 0.251 | yes |
| discuss-future-contribution | state-a-future-goal | 0.249 | yes |
| connect-to-school | state-a-future-goal | 0.248 | yes |
| discuss-future-contribution | explain-motivation | 0.248 | yes |
| connect-to-school | reflect | 0.217 | no |
| connect-to-school | explain-impact | 0.216 | no |
| explain-motivation | reflect | 0.212 | no |
| reflect | state-a-future-goal | 0.211 | no |
| demonstrate-growth | state-a-future-goal | 0.211 | no |
| demonstrate-growth | explain-motivation | 0.209 | no |
| explain-impact | state-a-future-goal | 0.209 | no |
| explain-impact | explain-motivation | 0.208 | no |
| connect-to-school | demonstrate-growth | 0.205 | no |
| describe | discuss-future-contribution | 0.202 | no |
| describe | state-a-future-goal | 0.199 | no |
| demonstrate-growth | describe | 0.198 | yes |
| describe | reflect | 0.196 | yes |
| describe | explain-motivation | 0.192 | no |
| connect-to-school | describe | 0.183 | no |
| describe | explain-impact | 0.181 | yes |

