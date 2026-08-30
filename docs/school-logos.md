# College logos

## The short version

**Logos are live.** All 100 researched colleges ship a real mark, the asset
files are committed under `public/school-logos/`, and the app renders them
whenever the registry is populated.

This is a deliberate change from how the feature was first built. It originally
had three independent gates — an environment flag, an empty committed registry,
and gitignored asset files — so that trademarked marks could not reach a
deployment by accident. The owner has since opened all three on purpose:
coverage and recognisability were the priority, and licensing analysis was
explicitly deprioritised for that pass.

What remains:

- **`SHOW_SCHOOL_LOGOS=0` turns every logo off**, everywhere, with no code
  change and no asset redeploy. That is the switch to reach for if a takedown
  request arrives.
- **`DECLINED_SCHOOLS`** removes one school's mark and is enforced at read time,
  so it works even against a stale registry entry.
- An empty registry renders generated initials, which are a finished state
  rather than a placeholder.
- Every mark is credited on the in-app **Image credits** page, with the
  institution named as the trademark holder and the independence disclaimer.

**The trademark position has not changed and is not resolved by any of this.**
See below.

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

## Turning them off

`SHOW_SCHOOL_LOGOS=0` in the deployment environment renders initials for every
school immediately, with no code change and no asset redeploy. It is checked
before anything else.

For a single school, add its exact name to `DECLINED_SCHOOLS` in
`src/lib/school-logos.ts`. That is enforced twice: the fetcher skips it, and
`logoForSchool` refuses it even if a stale registry entry survives, so honouring
a request never depends on remembering to re-run a script.

## Refreshing them

```bash
npm run logos:fetch          # re-resolves every school; merges, does not wipe
npm run logos:fetch -- brown # just one, leaving the other 99 alone
npm run logos:sheet          # contact sheets, for looking at all 100 at once
```

The fetcher rewrites both `public/school-logos/` and the registry, so a refresh
shows up as a normal reviewable diff.

## Removal requests

Add the school's exact name to `DECLINED_SCHOOLS` in
`src/lib/school-logos.ts`. That is enforced in two places: the fetcher skips
it, and `logoForSchool` refuses it even if a stale registry entry survives — a
removal must not depend on remembering to re-run a script. Then delete the file
from `public/school-logos/`.

## Coverage

**97 of 100** researched colleges have a real mark: **64 from the institution's
own website**, **33 from a secondary source**. Three show generated initials.

### How each asset was found

| Strategy | Count |
|---|---|
| Icon declared by `<link rel="icon">` | 41 |
| Wikidata claim or Wikipedia infobox (secondary) | 33 |
| Web app manifest icon | 9 |
| Official brand / identity page | 6 |
| Conventional `/apple-touch-icon.png` | 4 |
| Header logo on the homepage | 4 |

### The three on initials

- **Boston College** — its site publishes only a 2.6:1 horizontal lockup, and
  the only square alternative is a 74-colour engraved seal that is an
  unreadable smudge at 44px.
- **Villanova University** — same shape of problem; its seal measures 97
  distinct colours.
- **University of California, Santa Barbara** — recorded in `NO_USABLE_LOGO`
  by hand. Its own site publishes only 14:1 and 20:1 wordmarks, its favicon is
  unreadable, and the only square candidate is the UC *system* seal, which
  belongs to seven campuses. Its brand page offers an external-link arrow that
  passes every automated test.

## Normalisation

Sources are wildly inconsistent — 180×180 opaque app icons, transparent
wordmark SVGs, a 229×256 favicon, seals carrying 20% built-in whitespace.
Handing those to one CSS box is what made Penn look zoomed and cropped: a
229×256 image under `object-fit: cover` loses its sides.

So every asset is normalised once, at fetch time, into a **512×512 PNG whose
content occupies a known fraction of the frame**. Rendering then has nothing
left to decide. Two classes are treated differently, because treating them
alike is what looks wrong:

- **Full-bleed app icons** (21 of 97) — opaque, with a colour field running to
  the edge. Designed to fill a rounded square, so they keep their field and are
  only *padded* to square, never cropped. Yale's blue Y is one.
- **Free-standing marks** (76 of 97) — transparent or on white. Trimmed to
  their real content and re-inset to a fixed fraction, so a seal shipping
  generous whitespace and one shipping none end up the same perceived size.

A mark wider than 2.5:1 is rejected: in a 44px disc it would be about 17px
tall. Anything below 64px of real content is rejected as too small to upscale.

### Rendering overrides

Three schools publish a white mark drawn for a dark header, which is invisible
on a white disc. Each gets a dark plate in the school's own vetted palette
colour — the same colour its initials would have used:

| School | Override |
|---|---|
| George Washington University | `background: #7a322d` |
| Middlebury College | `background: #7a322d` |
| Reed College | `background: #2b5578` |

These are detected automatically (mean luminance above 225 with low variance),
not hand-listed. `render.scale` exists for a mark that needs resizing; nothing
currently needs it.

## What automated checks cannot do

Everything in this list was caught by looking at the rendered discs, not by a
test:

- Notre Dame resolved to a **photograph**, Bowdoin to a **grid of partner brand
  icons**, Carnegie Mellon to a **collage**. Colour counting now rejects these
  (a real mark uses 8–31 distinct colours at 64×64; those used 78–130), but the
  defect was invisible in the metadata.
- New York University resolved to a **"brand toolkit" promotional tile** that
  contained the logo rather than being it — correctly NYU, and still wrong.
- Washington and Lee resolved to a **fundraising campaign banner**, and UCLA to
  an **Instagram glyph** whose filename read as `instagram--brand.svg`.
- Santa Barbara's brand page offers an **external-link arrow** that passes every
  automated test — colour count, aspect ratio, ink coverage all sit in the
  normal range for a monogram.
- Five UC campuses initially shared the **UC system logo**, because their prompt
  records cite `universityofcalifornia.edu` rather than each campus's own
  domain.

`npm run logos:sheet` renders every mark as a 44px disc, with the same plate or
full-bleed treatment the app applies, onto four contact sheets. Run it and look
at them before trusting a change.

### Marks that are legible but faint

These are genuine institutional seals, drawn as fine engraved lines that ink
under 10% of their frame. They read as a light grey smudge at 44px. They are
correct, and they are the school's real mark, but a person may prefer initials:
Scripps College (3.5%), University of Miami (3.6%), Carleton College (6.7%),
Vanderbilt University (9.1%), Carnegie Mellon (9.1%), Case Western (9.3%),
George Washington (10.1%), Williams College (10.6%). New York University's seal
belongs in the same group.

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
