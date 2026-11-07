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

## Outcome (2026-11-07)

Both images are retaken, at the owner's request, from a local production build of `main` at
`8101ef7`: the four clients and the portal built with their `*_BASE` paths and served from one
origin by `serve-all` (port 8090), with Farm's sim from `npm run server`. Headless Chromium
(Playwright's, launched with `--use-angle=swiftshader --enable-unsafe-swiftshader`) at 1440×900
@2x, the debug overlay hidden.

**Farm.** Seed 0xc0ffee, two wheel steps in, Panels → Farmers, captured at 12:16 PM on the first
day. Houses stand on land, the bridges join banks, and the Farmers panel lists Cora, Atticus and
Hannah, as in the 2026-10-09 image. `farm-farmers-panel.webp` is the same crop of the same capture
(1440×1360 from x 1440). The framing differs from the old image because the world has changed
since then; the two wheel steps zoom ×1.1 each around Pip, not the pointer.

**Citadel.** `/citadel/?cozy`; the starter road extended from (102, 96) to (108, 96), houses at
(103, 97) and (106, 97), chapel (103, 94), market (106, 94), well (108, 98), which leaves Wood 14 as
in the old tile; 4x to Day 5 (summer), back to 1x, the event toasts left to fade, the road tool
picked, the pointer over the build bar. The terrain is the right way up: the river and the stone
outcrop sit where the minimap puts them, where the 2026-10-09 tile had them mirrored top to bottom.
The tile positions came from the dev server's `window.__citadel.tileToScreenCss`; the production
build boots to the same camera, and the gestures were replayed there.

**Hollow and MateQuest** were retaken too, the way their bullets say (seed 42 to year 18; the
first problem, 5 - 2), so all four tiles come from one build. `hollow-chronicle.webp` and
`mathquest-combat.gif` are untouched and keep their 2026-10-09 dates.

**`shots.md`.** The two rows are dated 2026-11-07. Changed recipe steps: the tiles come from the
local build rather than the deployed games; Farm's capture moment is given as a tick (12:25 PM is
tick 385); Citadel's layout is given in tiles. The header says which images were taken with
agent-browser and which with Playwright.

**Found, not changed:** the clock and the Farmers panel now number the first day "Day 0"; the
2026-10-09 capture read "Day 1" at the same point of the run (about 25 s in). The README's alt text
for `farm-farmers-panel.webp` still says "midday on day 1", which fits the old label; the README is
outside this brief's files.

Commits: 8d555bf
Checks run: Farm's houses on land and bridges joining banks, and Citadel's terrain against its minimap, checked by eye on the full captures; no personal data (the names are the games' own); the README's alt text for `four-games.webp` still describes the grid.
Checks skipped: typecheck, tests and gates, since no source changed.
Owner steps: none. The README images ship with the repo; no deploy.
