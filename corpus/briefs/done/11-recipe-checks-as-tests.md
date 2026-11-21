# Task 11: recipe checks as tests

**Origin:** the [sprite-gen research](../../todos/closed/2026-11-20-sprite-gen-research.md) of
2026-11-20. Its `pixel-draw` verb checks every drawing mechanically, and those checks are worth
having on every recipe in this repo, whoever draws it. The plan is
[frame-budget.md](../../wiki/frame-budget.md).

**Depends on:** brief 09: the cook knows every game's recipe set.

## Context

Coding agents write most of the recipes here. Of the 97 commits that touch recipe or template files,
48 carry a Claude co-author line. The palette guard already rejects a colour outside the game's
palette. Nothing checks the habits pixel artists rely on. sprite-gen (Apache-2.0) checks three of
them in `pixel-draw`:

- **G5:** no lone opaque pixel with no opaque neighbour among its eight.
- **G6:** the frames of one set stand on one floor row and stay within a pixel of one height.
- **G8:** sprites keep their corners transparent and stay inside a safe area.

Borrow the rules, not the code. They are a few lines each over a recipe's character grid.

## Files you OWN

- `tools/atlas-builder/` (a recipe-check module and its tests), or a test file in each recipe
  package that calls it
- An allowlist file per recipe package, listing frames that break a rule on purpose, each with a
  reason
- `corpus/` pages for this brief: the outcome, `log.md`, and [asset-pipeline.md](../../wiki/asset-pipeline.md)
  (a short "recipe checks" section)

## Files you must NOT touch

- Recipe pixels. This brief adds the checks and lists what they find. Fixing art is a later brief
  that can be judged by eye.
- Any `sim-core`, client or server code.

## What to do

1. **Lone pixels.** An opaque pixel with no opaque pixel among its eight neighbours fails, except
   in `tile/*` frames, which repeat and may sparkle.
2. **One floor row per set.** Frames that animate one subject, such as the frames of one farmer
   personality, Pip, an NPC or an animal, share the bottom row of their opaque pixels. Their opaque
   heights stay within one pixel, unless a frame is listed as a pose that crouches or jumps. Group
   frames by their name up to the last segment, and let the allowlist say where that grouping is
   wrong.
3. **Clear corners.** In every frame except tiles, the four corner pixels are transparent.
4. **Report.** On a failure, print the recipe, the frame, the rule and the pixel position. Run the
   checks inside `npm run test`.
5. **Allowlist what exists.** Run the checks over Farm's recipes. Every current failure goes on the
   allowlist with a one-line reason, or with "to review" when the reason isn't clear. List them all
   in the outcome, so a later brief can fix the art.

## Acceptance

- Unit tests show each rule passing and failing on small fixture grids.
- `npm run test` runs the checks over every recipe of every game the cook knows, and they pass with
  the allowlist.
- The outcome lists every allowlisted frame with its rule.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- None.

## Outcome (2026-11-21)

Done. [recipe-checks.ts](../../../tools/atlas-builder/src/recipe-checks.ts) holds the three rules over a recipe's
character grid (opaque = a swatch with alpha above 0): `lone-pixel` and `corners` per frame, tiles exempt, and
`floor-row` and `height` across the frames of a set. A set is the name up to the last segment, **compared within
one frame size**. Without that, Farm's 24 px walks and 16 px action poses fell in one set, and every farmer
failed for drawing at two scales, which says nothing about the art. The most common floor and height in a set
are the reference. A finding prints the frame, the rule, the pixel and what is wrong.

An `AtlasConfig` takes a `recipeCheckAllowlist` (entries: a frame or `set/*`, a rule, a reason). Farm's is
[recipe-check-allowlist.ts](../../../games/farm/atlas-recipes/src/recipe-check-allowlist.ts).
[recipe-checks.test.ts](../../../tools/atlas-builder/src/recipe-checks.test.ts) runs inside `npm run test`: fixture
grids pass and fail each rule, every registered game's recipes pass with their allowlist, and an entry that no
longer matches any finding fails the test, so the list can't go stale.

**What Farm's recipes trip:** 263 findings (25 lone pixels, 12 corners, 114 floor rows, 112 heights), all
covered by 38 allowlist entries. Every finding with its pixel is in
[farm-findings.md](../../verify/2026-11-21-recipe-checks/farm-findings.md). The entries, with the frames and
findings each covers:

| Entry | Rule | Frames | Findings | Reason |
|---|---|---:|---:|---|
| `structure/big-tree-bare` | lone-pixel | 1 | 19 | snowflakes around the winter tree |
| `structure/big-tree-autumn` | lone-pixel | 1 | 4 | falling leaves under the autumn canopy |
| `decoration/duck-b` | lone-pixel | 1 | 1 | the last dash of the ripple under the swimming duck |
| `structure/weather-beacon-b` | lone-pixel | 1 | 1 | the beacon's blink frame is its lamp alone, drawn over the beacon |
| `indicator/hpbar-bg` | corners | 1 | 4 | the health bar's background fills its frame |
| `structure/dock` | corners | 1 | 4 | to review: a dock piece drawn edge to edge, like a tile |
| `structure/cargo-ship` | corners | 1 | 4 | to review: the ship fills its frame to the corners |
| `structure/*` | floor-row | 52 | 52 | a catalogue of different buildings and objects |
| `structure/*` | height | 51 | 51 | a catalogue of different buildings and objects |
| `decoration/*` | floor-row | 35 | 35 | a catalogue of different decorations |
| `decoration/*` | height | 36 | 36 | a catalogue of different decorations |
| `indicator/*` | floor-row | 4 | 4 | different icons and bars, each placed on its own |
| `indicator/*` | height | 2 | 2 | different icons and bars, each placed on its own |
| `tool/*` | floor-row | 3 | 3 | different tools, drawn as hotbar icons |
| `tool/*` | height | 2 | 2 | different tools, drawn as hotbar icons |
| `fish/*` | floor-row | 2 | 2 | different fish species |
| `fish/*` | height | 2 | 2 | different fish species |
| `product/*` | floor-row | 2 | 2 | different products |
| `product/*` | height | 1 | 1 | different products |
| `fruit/*` | floor-row | 1 | 1 | different fruits |
| `fruit/*` | height | 1 | 1 | different fruits |
| `farmer/opportunist` | height | 1 | 1 | the five farmers' base frames are different people; the opportunist's hat is taller |
| `crop/carrot/*` | floor-row | 2 | 2 | growth stages, from seed to ripe |
| `crop/carrot/*` | height | 2 | 2 | growth stages, from seed to ripe |
| `crop/corn/*` | floor-row | 2 | 2 | growth stages, from seed to ripe |
| `crop/corn/*` | height | 2 | 2 | growth stages, from seed to ripe |
| `crop/grape/*` | floor-row | 2 | 2 | growth stages, from seed to ripe |
| `crop/grape/*` | height | 2 | 2 | growth stages, from seed to ripe |
| `crop/pumpkin/*` | floor-row | 1 | 1 | growth stages, from seed to ripe |
| `crop/pumpkin/*` | height | 2 | 2 | growth stages, from seed to ripe |
| `crop/radish/*` | floor-row | 2 | 2 | growth stages, from seed to ripe |
| `crop/radish/*` | height | 2 | 2 | growth stages, from seed to ripe |
| `crop/tomato/*` | floor-row | 2 | 2 | growth stages, from seed to ripe |
| `crop/tomato/*` | height | 2 | 2 | growth stages, from seed to ripe |
| `crop/wheat/*` | floor-row | 2 | 2 | growth stages, from seed to ripe |
| `crop/wheat/*` | height | 2 | 2 | growth stages, from seed to ripe |
| `crop/winter-squash/*` | floor-row | 2 | 2 | growth stages, from seed to ripe |
| `crop/winter-squash/*` | height | 2 | 2 | growth stages, from seed to ripe |

Two are **to review** (`structure/dock` and `structure/cargo-ship`, opaque corners), for the later brief that
judges art by eye. The set-level entries say the name grouping is wrong for catalogues (`structure/`,
`decoration/` and the item sets hold different objects, not one subject's frames) and for crop growth stages.
No pixel changed.

**Acceptance.** The fixture tests pass and fail each rule. `npm run test` runs the checks over every recipe of
every game the cook knows (Farm, until brief 12 adds MateQuest), and they pass with the allowlist. The table
above lists every entry, and the findings file lists every frame. `npm run check` exits 0, and `bash
corpus/lint.sh` passes.

