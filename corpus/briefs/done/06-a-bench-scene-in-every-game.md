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

## Outcome (2026-11-21)

Done. Each game client has a bench module and `?bench` in its boot path, in production builds too, and
`?bench` implies `?profile`:

- [games/farm/client/src/main/bench.ts](../../../games/farm/client/src/main/bench.ts): seed `0xc0ffee`, home
  screen skipped, the six collapsible panels built open from an in-memory layout
  (`panelPrefsConfig(true)` in [panels.ts](../../../games/farm/client/src/main/panels.ts), so a player's saved
  layout is never written), nobody followed; one sweep east and west at zoom 3, a diagonal sweep at 0.5,
  back to the centre at 3. It starts when the loading screen goes.
- [games/citadel/client/src/main/bench.ts](../../../games/citadel/client/src/main/bench.ts): a cozy run, picker
  skipped; once the opening frame centres the town, a circle at zoom 6, a zoom out to 1 (the whole map),
  a wider circle, a zoom back in. The boot zoom and the closest zoom are the same in Citadel: the opening
  frame sets `MAX_ZOOM`. So the second zoom the scene covers is the whole-map one, the camera's own before
  the opening frame.
- [games/hollow/client/src/bench.ts](../../../games/hollow/client/src/bench.ts): seed 42 (the card's), founding
  form skipped, 1x, chronicle open (the left rail always shows it), one orbit of the camera's yaw. The
  app gained an `onSceneReady(camera, profile)` option for it.
- [games/mathquest/client/src/bench.ts](../../../games/mathquest/client/src/bench.ts): seed 1, empty mastery
  and the default locale (nothing read or saved), played through the game's own commands, answering from
  the prompt. A test drives the real sim through the loop.

The harness is the same 80 lines in all four (no engine change, as the brief asked): a 3 s warm-up, a
`profile.reset()`, 30 s sampled, then `window.__benchResult = { ...exportProfile(), scene }` and a **Save
bench result** button. [scripts/bench.ts](../../../scripts/bench.ts) runs under Node's own type stripping
(`npm run bench -- <folder> [game…]`); the portal passes `bench` and `profile` into its frame.

**One scene needed a change to be repeatable.** MateQuest's first two runs differed by 6.4% in UI quads
(2267.66 against 2413.31). Its moves are paced in display ticks, so the screens came in the same order,
but the 30 s cut fell four ticks apart. Those last ticks were on the map screen, which flushes about
20,000 quads a frame against about 2,000 on the others. The run now ends on a whole screen, up to 30
ticks past 30 s (`mayEndAt` on the scene), and the two runs below match exactly.

**Acceptance.**

- `npm run bench -- corpus/verify/2026-11-21-bench-scenes/run-1` (and `run-2`), with no dev server up
  beforehand, started each server, wrote four JSON files each with `scene`, `seed`, the counters and
  `"gpu-not-real"` in every frame-time field, and stopped the servers again.
- Two runs, means per frame ([run-1](../../verify/2026-11-21-bench-scenes/run-1/),
  [run-2](../../verify/2026-11-21-bench-scenes/run-2/)):

  | Scene | Draw groups | UI quads |
  |---|---:|---:|
  | Farm | 48.11 / 47.85 (0.5%) | 1819.38 / 1819.36 |
  | Citadel | 1 / 1 | 760 / 760 |
  | MateQuest | 0 / 0 | 3887.99 / 3887.99 |
  | Hollow (3D, GL draw calls instead) | 35.80 / 35.80 | n/a |

- A production build of Hollow (`HOLLOW_BASE=/hollow/`), served with the portal by
  `portal/scripts/serve-all.mjs`, ran its scene at `/hollow/?bench&profile` (`build: "production"`), and
  the portal's `/games/hollow/?bench&profile` framed `/hollow/?bench&profile` and ran it there; the result
  was read off the frame's `window`.
- `npm run check` exits 0 (lint warnings unchanged at 3573), and `bash corpus/lint.sh` passes.

**Found on the way:** Farm records `draw.sprites`, `draw.atlases` and `draw.ghostGroups` through its timer
object, so the export lists sprite counts under `timers` as if they were milliseconds. Noted on
[performance-measurements.md](../../wiki/performance-measurements.md); not changed here.

