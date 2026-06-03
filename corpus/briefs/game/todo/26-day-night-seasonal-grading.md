# Game Task 26 — Day/Night + Seasonal Color Grading (3a)

## Context

The rendered world is visually flat: solid-color tiles, no atmosphere, no sense of time passing across 100 days (verified Playwright 2026-06-03, `fv-02-running.png`). The sim already tracks everything a color wash needs — `tick`, `day`, `ticksPerDay`, weather, and a derivable season (`seasonForDay`). This brief adds a **render-side day/night + seasonal color wash** over the whole frame.

Inspiration: *The Book of Shaders* Colors chapter (`mix()`/lerp between palettes, day-night brightness curves). **The book targets GPU GLSL/WebGL; this project is locked to Canvas2D** ([decisions.md](../../../wiki/decisions.md)), and the book's text/code is "all rights reserved" — so we reimplement the *math* (color interpolation, a sun curve) in JS, not its code.

## Goal

A full-frame color overlay, computed render-side from the sim clock, that lerps a per-season palette by a within-day sun curve — a gentle dawn → noon → dusk → night cycle, with season modulating both palette and day length (winter = shorter, darker daylight).

## Design decisions (locked via grilling 2026-06-03)

- **Tick-synced, not wall-clock.** The day/night phase is derived from `tick % ticksPerDay`; the seasonal palette from `seasonForDay(day)`. Fully deterministic, render-only, never feeds back into the sim or snapshots.
- **Season modulates the cycle**, not just the tint: winter has a shorter daylight fraction and a longer/darker night; each season has its own palette (spring fresh/green-warm, summer bright/gold, autumn amber, winter cold/blue).
- **Subtle amplitude.** Night is a soft blue dim, not a blackout. Interpolate using the render `alpha` between snapshots for smoothness.
- **Validated together with Brief 27 (long days).** At today's `ticksPerDay: 20` (1 day ≈ 1 real second) a tick-synced wash *strobes*. This brief ships the wash **mechanism**, correct at any `ticksPerDay`, but it only *looks* right once Brief 27 makes a day 5 minutes. **26 and 27 ship as a pair / shared milestone** even though they are separate briefs with separable code.

## Render seam (from impact analysis 2026-06-03)

- Insert the wash in [engine/src/render/canvas2d.ts](../../../../packages/engine/src/render/canvas2d.ts) `endFrame()`, **after** the sprite loop and **before** the `globalAlpha = 1` reset (~line 127).
- The live transform there is the camera world-space transform — **reset to identity** (`setTransform(1,0,0,1,0,0)`) before a screen-space `fillRect(0, 0, canvas.width, canvas.height)`.
- **Restore `globalCompositeOperation` to `"source-over"`** afterward — there is no per-frame save/restore, so composite state leaks into the next frame otherwise.
- Thread a `wash` parameter into `endFrame(wash?)` (or add a setter). The renderer receives no time data today.
- `ticksPerDay` is on `WorkerInitMsg`/`CONFIG`, **not** on `RenderSnapshot` — expose it to the renderer so the render-side phase can be computed. The sub-tick interpolation alpha is private on `sim-client.ts` — expose a getter if used for smoothing.

## Files in scope

- `packages/engine/src/render/canvas2d.ts` — the `endFrame` wash seam + identity-transform + composite restore.
- `packages/farm-valley/src/render/day-night.ts` — NEW: pure `washFor({ tick, ticksPerDay, season }) → { color, alpha }` (the sun curve + palette lerp). Reimplemented math, not copied from any source.
- `packages/farm-valley/src/main.ts` — compute the wash from `client.tick` / `client.day` / `seasonForDay(day)` and pass into `endFrame`.
- Expose `ticksPerDay` to the render path (snapshot field or client getter).
- `packages/farm-valley/src/render/day-night.test.ts` — NEW: curve is continuous, deterministic on `(tick, season)`, night darker than noon, winter daylight shorter than summer.

## Files you must NOT touch

- Any sim system, agent, protocol, or the ECS — this is purely cosmetic and must not change sim outcomes.

## Determinism guarantee

The wash is a pure function of `(tick, ticksPerDay, season)`. No `Date.now`/`Math.random`. It must not be written into any `RenderSnapshot` field consumed by sim logic. Two runs of the same seed must remain byte-identical in sim outcome (the wash changes only pixels).

## Acceptance

- Under Brief 27's long day, a watchable dawn→dusk arc is visible; season shifts the palette and daylight length.
- `npm test` / `npm run typecheck` green; the determinism harness (`CHECK_DETERMINISM`) still MATCHes.
