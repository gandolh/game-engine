# playtest-08 — Three drawn strings used glyphs the font never baked, and the substitution was silent

> **CLOSED 2026-09-20 — found and built in the same visual-testing pass.** Written up after the fact
> because the fix touched three places and was referenced from code comments; the sequence was
> discovery → fix → this record, not spec → build.

status: CLOSED 2026-09-20
created: 2026-09-20
found: visual playtest —checking whether my own playtest-05 claim about the map was even true

## How it surfaced

playtest-05 said of MateQuest's map: *"Nothing on screen indicates either that there is more map or
that arrows pan it."* **That was wrong.** `map-screen.ts` has always had `drawScrollHints()`, which
draws an edge arrow whenever the camera can move that way — a deliberate affordance, conditional and
correct.

It had simply never been visible. The hints were drawn with `‹` and `›` (U+2039/U+203A), and the
vendored UNSCII **does not carry those code points at all**, so `glyphRows` substituted the fallback
and the arrows rendered as nothing. Cropping the original playtest screenshot at the exact draw
position confirmed it: bare terrain, no glyph.

A scan for other non-ASCII characters in drawn strings then found two more, in Citadel's road/wall
drag readout ([build-controls.ts](../../../games/citadel/client/src/main/build-controls.ts)):

```ts
const blocked = placementState.lastRouteBlocked ? " · blocked" : "";
return ` — ${n} tile${n === 1 ? "" : "s"}${blocked}`;
```

`—` (U+2014) and `·` (U+00B7) — both of which UNSCII **does** have and the font had simply not baked,
so the live Status line read `Mode: Road (drag) ? 10 tiles`.

And Farm knew. [right-column.ts](../../../games/farm/client/src/ui/canvas/right-column.ts) carries
the comment *"ASCII markers only — the `@engine/ui` fonts cover printable ASCII, so `▸/▾` would
render as `?`"*. So the constraint was understood by whoever wrote that line, recorded nowhere else,
and broken twice since.

## What was done

1. **Baked the glyphs UNSCII has and the repo draws**: `·` (U+00B7), `—` (U+2014), `…` (U+2026),
   added to `EXTRA_CODEPOINTS` and regenerated. `→` (U+2192) had already been added earlier the same
   day for the same reason.
2. **Replaced the glyphs UNSCII does not have.** MateQuest's scroll hints now use `←`/`→` instead of
   `‹`/`›`. There is no way to bake a glyph the font file does not contain, so the call site had to
   change.
3. **Made the failure audible.** `glyphRows` is the one choke point every drawn character passes
   through, so it now **reports an uncovered code point once per glyph**, naming it and how to fix
   it. A source scan cannot do this job: the same literals appear in comments, DOM text and test
   names, where any code point is fine, so a scanner is all false positives. The choke point fires
   exactly when a glyph is really drawn.
4. **Pinned the reverse direction too.** A new test walks `allChars()` through both fonts and fails
   if a code point the covered set *claims* is absent from the baked tables — which is the `‹`
   mistake from the other side.

## Verified

- MateQuest's right-edge scroll arrow renders, cropped and confirmed at scale 2 (gold `→`).
- Citadel's Status line reads `Mode: Road (drag) — 10 tiles` with a real em dash, cropped and
  confirmed.
- The `·` (blocked-route) branch was **not** observed live — the router found a legal path both
  times — so that one rests on the same baked-glyph mechanism plus the coverage test, not on a
  screenshot. Stated because it is the one claim here that is inferred.
- `npm run test -w @engine/ui`: 213 → 216 passing.

## Correction owed to playtest-05

Its item 3 is now wrong in its reasoning and right in its conclusion: players got no pan indication,
but not because nobody built one. A note has been added at the top of that closed spec rather than
editing its body.
