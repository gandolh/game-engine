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
