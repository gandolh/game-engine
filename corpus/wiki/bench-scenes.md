---
summary: The fixed ?bench scene in each game (brief 06): what each scene does, how to run one by hand, framed in the portal or headless with npm run bench, which fields to compare on SwiftShader, and two runs that agree.
updated: 2026-11-21
---

# Bench scenes

A frame-time number compares with another only when both were taken the same way. `?bench` on a game's URL
runs that game's fixed scene: a fixed seed, the menus skipped, a 3 s warm-up, then the profile is reset and
30 s are sampled. It works in production builds and implies `?profile`. When the run ends,
`window.__benchResult` holds the `game-engine-profile/1` export plus `scene` (the scene's name), and a
**Save bench result** button (top right) downloads it, which is how to keep one from a phone.

## The four scenes

| Game | `scene` | What it does |
|---|---|---|
| Farm | `farm-pan-default-wide-return` | Seed `0xc0ffee`, home screen skipped, the six collapsible panels open (an in-memory layout: a player's saved one is untouched), nobody followed. One sweep east and west at the default zoom (3), one diagonal sweep at the widest (0.5), then back to the centre at 3. Starts when the loading screen goes. |
| Citadel | `citadel-cozy-town-close-wide` | A cozy run on the default map, picker skipped. Once the opening frame centres the town: a circle at the boot zoom (the opening frame's 6, which is also the closest), a zoom out to the whole map (1), a wider circle there, a zoom back in. |
| Hollow | `hollow-town-orbit` | Seed 42, founding form skipped, 1x speed, the chronicle open (the left rail always shows it). The camera orbits the town once. |
| MateQuest | `mathquest-map-combat-loot-loop` | Seed 1, an empty mastery store (nothing saved) and the default locale. Plays through the game's own commands: the map, combat turns answered right from the prompt, level-up and loot, round again. One move every 30 display ticks, so each screen gets the same frames at any frame rate, and the run ends on a whole screen (up to 30 ticks past 30 s). Its result adds `sceneReport` (ticks per screen and moves). |

## Running one

**By hand:** open the game with `?bench&profile`, leave it alone for about 35 s, then press **Save bench
result** (or read `window.__benchResult` in the console). The portal passes `bench` and `profile` from its
play page into the game's frame, so `/games/hollow/?bench&profile` runs Hollow's scene framed; the result is
on the frame's `window`.

**Headless:** `npm run bench -- <folder> [farm|citadel|hollow|mathquest …]` ([scripts/bench.ts](../../scripts/bench.ts))
starts each game's dev server (and Farm's sim server) unless one is up, opens `?bench&profile` in headless
Chromium through `agent-browser` at 1280×800, waits for `__benchResult` and writes `<folder>/<game>.json`.
About 40 s a game. When the renderer string names SwiftShader it replaces every frame-time field
(`frames.interval` and `frames.drawn` times and fps, the `gpu` times) with `"gpu-not-real"`, keeping the
counts, and adds `bench: { frameTimes: "gpu-not-real", renderer }`.

## What to compare

In a sandbox: the counters (draw groups, GL draw calls, instances, UI
quads, texture bytes) and the named steps' CPU milliseconds. Two runs of each scene (2026-11-21,
[corpus/verify/2026-11-21-bench-scenes/](../verify/2026-11-21-bench-scenes/)), means per frame:

| Scene | Draw groups | UI quads | GL draw calls | Texture bytes a frame |
|---|---:|---:|---:|---:|
| Farm, run 1 / run 2 | 48.11 / 47.85 | 1819.38 / 1819.36 | 183.67 / 183.39 | 4,096,000 / 4,096,000 |
| Citadel | 1 / 1 | 760 / 760 | 97.58 / 97.64 | 0 / 0 |
| Hollow (3D: no groups or quads) | n/a | n/a | 35.80 / 35.80 | 0 / 0 |
| MateQuest | 0 / 0 | 3887.99 / 3887.99 | 23.45 / 23.45 | 0 / 0 |

Farm's `draw.sprites`, `draw.atlases` and `draw.ghostGroups` entries under `timers` are counts per frame (its
render loop records them through the same timer object), not milliseconds.

The export itself, field by field, is described on
[performance-measurements.md](performance-measurements.md), and the bar the scenes are read against is on
[frame-budget.md](frame-budget.md). The brief that built them is
[briefs/done/06](../briefs/done/06-a-bench-scene-in-every-game.md).
