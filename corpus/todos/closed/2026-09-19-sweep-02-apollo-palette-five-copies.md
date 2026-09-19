# sweep-02 — Apollo-46 is hand-maintained in five places, and `nearestApollo` is duplicated verbatim

status: todo
created: 2026-09-19
context: found by a read-only sweep on 2026-09-19. Same class as
[audit-60](2026-09-18-audit-60-tile-constant-fifteen-copies.md) (one `TILE`) and
[audit-61](2026-09-18-audit-61-noise-stack-duplicated-four-ways.md) (one noise core) — a value that must be
identical everywhere, kept identical by hand.

## The gap

Citadel and Hollow both use **Apollo-46** ([`CLAUDE.md`](../../../CLAUDE.md)). The 46 hex values exist in
**five** hand-maintained copies:

| # | file | what |
|---|---|---|
| 1 | [`games/citadel/client/src/render/citadel-palette.ts`](../../../games/citadel/client/src/render/citadel-palette.ts) | `APOLLO` — production |
| 2 | `games/citadel/client/src/render/citadel-palette.test.ts` | `CANONICAL_APOLLO` — pins #1 |
| 3 | [`games/hollow/client/src/render/hollow-palette.ts`](../../../games/hollow/client/src/render/hollow-palette.ts) | `APOLLO` — production |
| 4 | `games/hollow/client/src/render/hollow-palette.test.ts` | `CANONICAL_APOLLO` — pins #3 |
| 5 | [`engine/core/src/render/palette.test.ts`](../../../engine/core/src/render/palette.test.ts) | inline copy — the engine-side scan's membership set |

Verified byte-identical today (`diff` of the extracted literals). Each pair is self-consistent, and
the engine scan catches a *wrong* colour appearing in either game's source. So this is **debt, not a
live bug** — say that plainly rather than dressing it up.

**`nearestApollo` is worse: it is character-for-character identical** in #1 and #3 — same loop, same
squared-RGB distance, same `APOLLO[0]` seed — plus its `rgbOf` helper. That is duplicated *algorithm*,
not duplicated data, and nothing pins the two implementations to each other.

## Why it is worth fixing anyway

The five copies are held in sync by three separate pinning tests and a scan. Nothing asserts copy #1
equals copy #3 — each is pinned to its own literal. Update Citadel's pair and not Hollow's and every
test still passes, while the two games silently disagree about a palette `CLAUDE.md` says they share.
The failure mode is invisible and only shows up as an off-by-one-swatch render difference between two
games nobody diffs side by side.

## The constraint that shaped the current design — do not break it

[`CLAUDE.md`](../../../CLAUDE.md): *"The engine never imports a game, so each non-EDG swatch list is
inlined in the engine-side scan and pinned to its game's module by a colocated test there."* That
explains copy #5 and is **correct** — the engine's palette *test* cannot import Citadel.

But it does not require the *data* to live in the games. The engine already ships `EDG32` in
[`palette.ts`](../../../engine/core/src/render/palette.ts) as ordinary exported data; a palette is not a
game. **The engine exporting `APOLLO` and a generic nearest-swatch helper, which both games import, is
allowed by the layering rule and collapses five copies to one.**

## What to do

1. Move the 46-swatch list to `@engine/core/render` as `APOLLO` (name it for the palette, not for a
   game). Citadel and Hollow import it; their `CANONICAL_APOLLO` pins become redundant and go.
2. Promote the nearest-swatch search as a **generic** `nearestSwatch(hex, swatches)` — it is not
   Apollo-specific. Each game keeps a thin `nearestApollo` alias if the call sites read better.
   Move `rgbOf` with it.
3. `palette.test.ts`'s inline copy should then import the exported list rather than restate it — the
   engine test *can* import the engine.
4. **Keep each game's role map where it is.** `CITADEL_PAL` and `HOLLOW_PAL` are genuinely per-game
   (Hollow adds skin/hair roles) and must not be merged. This brief is about the swatch *list* and the
   *search*, not the role mapping.
5. While there: the same pattern is worth a look for **Resurrect-64** (2 copies — `mate-palette.ts`
   and the engine scan). Lower value; only do it if step 1 makes it nearly free.

## Secondary, lower priority — `screenToWorld`

[`games/farm/client/src/main/screen-to-tile.ts`](../../../games/farm/client/src/main/screen-to-tile.ts)
and [`games/citadel/client/src/render/transform.ts`](../../../games/citadel/client/src/render/transform.ts)
implement the **same inverse-camera formula** (`screen * worldUnits/canvasSize + (center - worldUnits/2)`)
with different signatures — Farm takes a canvas element and CSS px, Citadel takes explicit dimensions
and device px. `@engine/core/render` already owns `Camera2D` but exposes no inverse.

**Judgement: probably not worth promoting on its own.** It is eight lines of arithmetic that rarely
changes, the two signatures genuinely differ, and Citadel's continues into iso-specific `isoToTile`.
Recorded here so the next person does not re-derive the analysis. If `Camera2D` ever grows a
screen→world method for another reason, fold these into it then.

## Files you OWN
- `engine/core/src/render/palette.ts` and its test
- both games' palette modules and their colocated tests

## Files you must NOT touch
- `CITADEL_PAL` / `HOLLOW_PAL` role *values* — this is a move, not a re-mapping. No rendered pixel may
  change.

## Acceptance
- `grep -c '"#172038"'` across the repo drops from 5 files to 1 (plus any test that deliberately
  restates one swatch).
- **Prove no pixel moved**: Citadel and Hollow render byte-identically before and after. A headless
  export diff is not enough here — this is render-layer data, so compare an actual rendered frame.
- The guard still bites: temporarily change one swatch in the engine list and confirm both games'
  colocated tests fail.
- `npm run test -w @engine/core` + both clients green.
