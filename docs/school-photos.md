# Campus photographs

The same content as the in-app **Photo credits** page, for readers of the
repository.

## Current state

**No campus photographs are in use.** Every college renders a generated mark:
its initials on one of twelve curated colours, chosen deterministically from
the name (`src/app/school-mark.tsx`). That is a deliberate finished state, not
a placeholder — the interface is designed to look complete without
photography, which is why the mark was built first.

The surrounding machinery is complete and tested. Adding a photograph is one
entry in `SCHOOL_PHOTOS` (`src/lib/school-photos.ts`); the school card then
renders it, the credit appears on the Photo credits page, and the tests check
the file and its metadata.

## Why the registry is empty

Two things have to be true before a photograph is added, and neither can be
checked by a program:

1. **The image shows the campus it claims to.** A card that labels a photograph
   "Brown University" when it is some other quadrangle states a falsehood to a
   student.
2. **The licence permits this use, and is reported accurately.**

The rule in the redesign plan is that if an image's identity, source, licence
or suitability is uncertain, the generated mark is used instead. A mark is a
perfectly good outcome; a mis-credited photograph is not.

## Sourcing rules

- Prefer clear, commercial-use-friendly licences: **CC0 / public domain,
  Unsplash, Pexels, or straightforward CC BY**.
- Avoid **CC BY-SA** and other licences with propagating or complex conditions
  unless the conditions are genuinely handled. The test suite fails a
  share-alike licence outright.
- **Never** use Google Images results, social-media images, editorial-only
  images, or images from university websites without explicit permission.

## What the tests establish, and what they do not

`src/lib/school-photos.test.ts` verifies that:

- every required provenance field is present and non-empty;
- `sourcePage` and `licenseUrl` are `https://` URLs, and `sourcePage` is a page
  rather than a direct image file;
- the declared file exists, is a readable WebP, and its intrinsic width and
  height match the registry;
- the aspect ratio is 16:9, so the reserved box never reflows;
- no two entries share a school or a file;
- the school name is one the catalogue knows;
- the licence is not share-alike.

**These tests cannot prove legal usability.** They check completeness and
internal consistency — not permission, not licence accuracy, and not that the
photograph depicts what it says it does. Those remain human judgements made
before an entry is added. There is deliberately no automated approval or
legal-review system in this repository.

## Type

`SchoolPhoto` has no optional provenance fields, so an entry without a creator,
source page, exact licence, licence URL, attribution line, modification note
and retrieval date does not compile.

## Independence

This is an independent tool. It is not affiliated with, endorsed by, or
sponsored by any college or university named in it. College names are used only
to identify the institutions whose published essay prompts appear here.
