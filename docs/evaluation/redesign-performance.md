# UI/UX redesign — measured cost

Both sides are **production builds** (`next build` + `next start`) served from
localhost against the same local Postgres holding the same 20-school example
workspace, measured in Chrome at 1440×900 with no CPU or network throttling.

- **before:** `059f7f1` (the last pre-redesign commit), built in a git worktree
- **after:** `76013d4`

## Core Web Vitals

Measured on a **warm** server. The first load of each build is dominated by
Next's own first-request compilation — the initial cold reading was 923 ms for
before and 325 ms for after, which is a measurement of server warm-up, not of
the redesign. Those numbers are discarded; the warm figures are the real ones,
and they run the other way.

| Overview (`/`) | before | after | change |
|---|---|---|---|
| LCP | 311 ms | 368 ms | **+57 ms** |
| CLS | 0.00 | 0.00 | unchanged |
| Requests | 9 | 12 | +3 |

CLS is zero on both, which matters most here: it is what the reserved
aspect ratios and the intrinsic-size rules exist to protect, and it stays zero
with the fonts added because `next/font` self-hosts them with a fallback metric
and `display: swap`.

## Transferred bytes

Gzipped, for the assets the Overview page actually requests on a cold cache.

| | before | after | change |
|---|---|---|---|
| CSS | 8,373 | 9,688 | +1,315 (+16%) |
| JS | 136,087 | 140,940 | +4,853 (+3.6%) |
| Fonts | 0 | 85,424 | **+85,424** |
| **First-load total** | **144,460** | **236,052** | **+91,592 (+63%)** |

**The fonts are the entire story.** Plus Jakarta Sans and Newsreader cost
85 KB, replacing Arial and Georgia, which cost nothing because they were
already on the machine. That was the single largest contributor to the
interface reading as utilitarian, so this is the price of the fix rather than an
accident — but it is a real 63% increase in first-load bytes and should be
stated as one, not buried.

Mitigations already in place: the files are `immutable`-cached, so this is a
once-per-visitor cost; `display: swap` means text paints immediately in a
fallback rather than waiting; and although the build emits 165 KB of `woff2`
across subsets, only the two subsets actually needed are requested at runtime.

If the byte cost ever matters more than the typography, the lever is dropping
Newsreader and setting prose in the sans — that alone is most of the 85 KB.

### Document size

| | before | after |
|---|---|---|
| Overview, decoded | 69,867 | 67,259 |
| Your Prompts, decoded | 1,796,896 | 1,791,712 |
| Your Prompts, transferred | 113,767 | 114,223 |

Essentially unchanged. `/schools` is dominated by Next's RSC payload for ~117
prompts, not by markup, so restyling it moves nothing. The redesign neither
helped nor hurt here.

## CSS, as source

| | before | after |
|---|---|---|
| Files | 1 | 16 |
| Lines | 2,311 | 2,486 |
| Built, raw | 39,560 | 48,389 |
| Built, gzipped | 8,373 | 9,688 |

The plan expected total CSS to **fall** as table-row styling gave way to cards.
It rose about 7.5% in source and 16% gzipped. The reason is that the redesign
added surfaces rather than only replacing them: a 260-line top navigation bar
where the sidebar was ~170, a shared primitives layer that did not exist, and
the reuse ribbon, empty-state illustration, photo-credits page and plans reader
which had no styling before. The prediction was simply wrong; 1.3 KB gzipped is
not worth undoing the organisation to recover.

## Static assets and the serverless function

`public/` is uploaded as static CDN assets and is **not** traced into the
serverless function, so photographs would cost nothing against the 250 MB
function budget that the embedding work pushed to ~227 MB.

- `public/school-photos`: **0 bytes** — no photographs are registered. See
  [../school-photos.md](../school-photos.md).
- Function size: **not re-measured.** `vercel inspect` reports a deployment,
  and this work has not been deployed. Nothing in the redesign adds a server
  dependency — `git diff --stat src/lib/` shows only the additive
  `school-photos.ts` — so the function size is expected to be unchanged, but
  that is a prediction and not a measurement.

## What was not measured

- No throttled (Slow 4G / 4× CPU) run. On a throttled connection the +85 KB of
  fonts would cost noticeably more than +57 ms, and `display: swap` matters
  much more there. Worth doing before treating these numbers as
  representative of a real student's laptop on campus wifi.
- No field data; CrUX has nothing for this origin.
- Interaction latency (INP) was not measured. Nothing in the redesign adds
  client-side work — the app still ships one client component — so there was no
  hypothesis to test.
