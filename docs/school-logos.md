# College logos

## The short version

Logos are **off by default** and no logo files are in this repository. Turning
them on is a deliberate act with a trademark question attached, and this
document is here so that decision is made with the facts rather than by
accident.

## Why this is not the same problem as photographs

[docs/school-photos.md](school-photos.md) is about copyright: the hard parts
were finding a freely-licensed image and proving it depicted the campus it
claimed to.

Logos invert both halves.

**Identity becomes free.** The fetcher derives each college's domain from the
official admissions URL this repo already cites as the source of that school's
prompts, loads that homepage, and takes the icon the page itself declares. An
icon declared by `brown.edu` is Brown's mark by construction. There is no
misattribution risk, which is what made the photograph problem unsolvable
without a human in the loop.

**Licensing becomes harder.** There is no such thing as a freely-licensed
university logo. A logo is a trademark, not merely a copyrighted image, so
there is no CC0 equivalent to look for. Wikipedia's university logos are
uploaded under *non-free* fair-use rationales that do not extend to a product
like this one.

So the question is not "which licence covers this?" — none does — but "does this
use need permission at all?" Using a mark purely to *identify* an institution,
at identification size, without implying endorsement, is the nominative-use
argument that college-search products generally rely on.

**This is not legal advice and nothing in this repository establishes that the
use is permitted.** Two facts worth knowing before enabling it: most
universities' brand guidelines prohibit third-party use outright, and
admissions-adjacent products are the category they police most actively.

## The three gates

Any one of these alone keeps logos off a deployment:

1. **`SHOW_SCHOOL_LOGOS` is unset.** `logosEnabled()` requires the exact string
   `"1"`; `"true"`, `"yes"` and `" 1"` are all still off, so no truthy-looking
   config value can switch trademarks on by accident.
2. **`SCHOOL_LOGOS` is empty in the committed source.** `npm run logos:fetch`
   rewrites that array locally, so it shows up as an uncommitted change — a
   visible decision rather than a silent one.
3. **`public/school-logos/` is gitignored.** The image files are never
   committed, so they never reach a build even if the flag were set. Committing
   the registry without the files fails
   `src/lib/school-logos.test.ts` rather than shipping broken images.

## Enabling it

```bash
npm run logos:fetch                 # writes public/school-logos/, rewrites the registry
SHOW_SCHOOL_LOGOS=1 npm run dev     # preview locally
```

To ship them you must additionally commit the registry *and* arrange for the
files to exist in the build — either by committing them (which publishes them)
or by running the fetch during `prebuild`. Both are deliberate steps. Neither
has been taken.

## Removal requests

Add the school's exact name to `DECLINED_SCHOOLS` in
`src/lib/school-logos.ts`. That is enforced in two places: the fetcher skips
it, and `logoForSchool` refuses it even if a stale registry entry survives — a
removal must not depend on remembering to re-run a script. Then delete the file
from `public/school-logos/`.

## Coverage

**51 of 100** researched colleges resolve a usable logo. The rest fall back to
their generated mark, which was built to be a finished state rather than a
placeholder, so a mixed grid reads as deliberate.

Why the other 49 miss:

| Reason | Count |
|---|---|
| Largest icon the site publishes is under 64px | 27 |
| Blocked the request (403 / 405) | 8 |
| Connection failed | 6 |
| Icon URL 404s | 6 |
| No icon declared anywhere | 2 |

The 64px floor is deliberate. Of the 27 too-small cases, 18 publish nothing
larger than 16px, which is unusable at 44px. Seven sit at 48–57px and *could*
be admitted by lowering the floor — but they would render visibly softer than
the crisp 180px ones, and inconsistency *within* the logo set looks worse than
the honest logo-or-mark mix. 51 crisp logos beat 58 with seven blurry ones.

## What the tests do and do not establish

`src/lib/school-logos.test.ts` verifies that the gates hold, that only `"1"`
enables the feature, that a declined school is refused even when registered,
that provenance fields are present and well-formed, that each recorded file
exists at its recorded dimensions, and that the icon was declared on the
university's own domain.

**None of that establishes that the use is legally permitted.** The tests check
mechanism, not permission.

## Implementation notes

- Dimensions are read from each file's own header, so a wrong number cannot be
  recorded. `.ico` stores its size in the directory entry, where a zero byte
  means 256 — Penn genuinely ships a 229×256 icon.
- `mask-icon` is skipped. It is a Safari pinned-tab asset and monochrome by
  definition, so it renders as a solid silhouette; Brown resolved to one before
  that guard existed.
- Candidates are gathered from the HTML's `<link rel="icon">`, then the web app
  manifest (where many sites keep their 192px and 512px versions), then the
  conventional `/apple-touch-icon.png` paths as a last resort. Each is tried in
  order of promised size and the first that is genuinely large enough wins,
  because a declared `sizes` attribute is a claim rather than a measurement.
- The icon may be served from a CDN. The identity guarantee comes from the page
  that declared it being on the institution's own domain.

## Independence

This is an independent tool. It is not affiliated with, endorsed by, or
sponsored by any college or university named in it. Any logo shown is the
trademark of its institution and is used, if at all, only to identify that
institution.
