# Task 06: a bench scene in every game

**Origin:** the owner, 2026-11-20: hold at least 60 fps. The plan is
[frame-budget.md](../../wiki/frame-budget.md).

**Depends on:** brief 05: the shared profiler and the `game-engine-profile/1` export.

## Context

A frame-time number only means something when it is taken the same way every time: the same seed,
the same camera path, the same open panels and the same length. Studios keep fixed benchmark scenes
for this reason. Today the repo's readings were taken by hand, each a little differently, so two of
them can't be compared.

This brief adds a `?bench` mode to each game, plus a headless runner that collects the counters that
mean something on SwiftShader. Brief 07 runs the same scenes on real hardware.

## Files you OWN

- A bench module in each game client, for example `src/main/bench.ts`, and the line in each boot
  path that starts it under `?bench`
- `scripts/bench.ts` (new) and a root `npm run bench` script
- `portal/src/main.ts`: only passing `bench` and `profile` from the play page's URL into the game's
  frame
- `corpus/` pages for this brief: the outcome, `log.md`, the "Measuring" section of
  [performance-measurements.md](../../wiki/performance-measurements.md), and [frame-budget.md](../../wiki/frame-budget.md)
  if a scene changes what the bar measures

## Files you must NOT touch

- Any `sim-core` package. A bench scene drives the client only: the camera, the panels and the
  existing start and seed controls.
- `engine/` beyond what a camera path needs from the public API.

## What to do

1. **One scene per game,** with a fixed seed, the menus skipped and a 30 s run:
   - **Farm:** start a run and open the panels players keep open. Pan the camera across the map
     at the default zoom, then at the widest zoom, then return.
   - **Citadel:** start a cozy run on the default 192×192 map. Pan and zoom over the town at the
     boot zoom and at the closest zoom.
   - **Hollow:** start a town and let it run at the default speed with the chronicle open. Orbit
     the camera once.
   - **MateQuest:** cycle the map screen, a combat turn with an answer and the loot screen in a
     loop.

   Start sampling after a 3 s warm-up. Use the camera's own API and the game's own seed path, and
   don't add sim entry points.

   `?bench` works in production builds. Don't gate it on `import.meta.env.DEV` as `?card` is,
   because brief 07 runs it on the deployed games, from a phone.
2. **The portal passes it on.** The portal's play page opens a game in an iframe with
   `src: game.path` and drops its own query string. Pass `bench` and `profile` through, so Hollow can
   be read framed. The portal still imports no game.
3. **The result.** When the run ends, the bench sets `window.__benchResult` to the brief-05 export
   plus the scene name. It also offers the result as a download, so the owner can save it on a phone.
4. **The headless runner.** `npm run bench` starts each game's dev server, opens `?bench&profile` in
   headless Chromium through `agent-browser`, as `portal/scripts/cards.ts` does, and waits for
   `__benchResult`. It writes one JSON per game to a folder you pass in. The runner stamps the
   frame-time fields `"gpu-not-real"` when the renderer string names SwiftShader. Only the counters
   are compared: draw groups, GL calls, UI quads, texture bytes and the CPU milliseconds of named
   steps.
5. **Write it down.** Explain in [performance-measurements.md](../../wiki/performance-measurements.md)
   how to run a scene by hand (`?bench&profile`) and headless (`npm run bench`), and which fields
   mean something on SwiftShader.

## Acceptance

- `npm run bench -- <folder>` writes four JSON files in this sandbox, each with the scene name, the
  seed, the counters and the `"gpu-not-real"` stamp.
- Two runs of one game give the same draw-group and UI-quad means within 5%. Put both runs'
  numbers in the outcome.
- A production build of one game (`npm run build`, served) runs its scene at `?bench&profile`, and
  the portal's play page at `?bench&profile` runs Hollow's scene inside the frame.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- None to close this brief. Brief 07 uses the scenes on real hardware.
