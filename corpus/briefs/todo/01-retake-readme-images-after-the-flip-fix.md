# Task 01 — Retake the README's Farm and Citadel images after the upside-down fix

## Context

The [patched static layer](../../todos/closed/2026-10-28-engine-patched-static-layer.md)
found that every baked static layer had been drawn upside down. Canvas uploads
now set `UNPACK_FLIP_Y_WEBGL` ([decisions.md](../../wiki/decisions.md) →
Renderer).

`docs/images/four-games.webp` and `docs/images/farm-farmers-panel.webp`, taken
2026-10-09, still show Farm's terrain upside down under its sprites: houses in
open water, bridges that reach nothing. Citadel's tile in `four-games.webp`
has the same flip inside its render window. Promoted from the todo
`2026-11-03-retake-readme-images-after-the-flip-fix` (2026-11-03).

## Files you OWN

- `docs/images/four-games.webp`
- `docs/images/farm-farmers-panel.webp`
- `docs/images/shots.md` (the "Taken" dates of those rows, and a recipe step
  if one changed)

## Files you must NOT touch

- The other images in `docs/images/`.
- Any engine or game source. If a capture still shows a flip, stop and write
  a todo.

## What to do

1. Build the games locally from current `main`, which has the fix. The
   deploy is the owner's step; the images come from the local build.
2. Retake each image the way
   [docs/images/shots.md](../../../docs/images/shots.md) says: the same
   viewport, seed and crop. `four-games.webp` is four single-game captures
   scaled and stacked as its row describes.
3. Check that Farm's terrain sits right under its sprites, that Citadel's
   render window is the right way up, and that no personal data shows.
4. Update the "Taken" dates in `shots.md`.

## Acceptance

Both images retaken from a build with the fix, Farm's houses on land and its
bridges joining banks, Citadel's tile the right way up, no personal data in
either, and their "Taken" dates in `shots.md` updated.
