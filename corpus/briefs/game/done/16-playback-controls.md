# Game Task 16 — Playback Controls (Pause / Speed / Step)

## Context

Farm Valley is a watch-only game, but the viewer has no control over time. The sim runs at a fixed 20 Hz from Start to day 100 with no way to pause on a tense auction, slow down a juicy trade, or skip a dull stretch. The clock is already fixed-step and the sim is fully deterministic ([decisions.md](../../../wiki/decisions.md)), so layering playback controls on top is a pure presentation change — it does NOT alter sim determinism, because we gate *whether* `onTick` runs, not *what* a tick computes.

This is the single highest experience-per-effort gap for a spectator game.

## Goal

1. **Pause / resume**: a toggle (button + spacebar) that freezes the sim. While paused, `onRender` keeps running (so pan/zoom/focus still work) but `scheduler.tick` does not advance.
2. **Speed control**: 1× / 2× / 4× (and optionally 0.5×). Implemented as a tick multiplier — at 2× run two `scheduler.tick` calls per animation frame; at 0.5× run one tick every other frame. Render interpolation `alpha` must stay correct (the existing `prevX/prevY` copy already supports this).
3. **Step**: while paused, a "step one tick" button (and a key, e.g. `.`) advances exactly one tick then re-pauses. Useful for inspecting a single deliberation.

## Files in scope

- `packages/farm-valley/src/main.ts` — module-level playback state (`paused: boolean`, `speed: number`); modify the `GameLoop` `onTick`/render wiring so the loop respects pause + speed + step. Wire keyboard (space = pause, `.` = step, `1`/`2`/`4` = speed) and pass callbacks to the new UI panel.
- `packages/farm-valley/src/ui/playback-controls.ts` — NEW DOM panel: pause/resume button, speed buttons (1×/2×/4×), step button. Follows the same construction pattern as `ui/leaderboard.ts` / `ui/slate-billboard.ts` (constructor takes `app: HTMLElement`, exposes `setOnPause(cb)` / `setOnSpeed(cb)` / `setOnStep(cb)` and an `update({ paused, speed })` method to reflect state).
- `packages/farm-valley/src/ui/playback-controls.test.ts` — NEW: at least 3 tests (clicking pause fires callback; speed buttons fire with the right multiplier; step button fires).
- `packages/farm-valley/src/ui/index.ts` — export the new panel.
- `packages/engine/src/runtime/loop.ts` — ALLOWED only if a minimal hook is needed (e.g. a way to run N ticks per frame, or to skip ticks). Read it first. Prefer doing the gating in `main.ts` without touching the engine; only touch `loop.ts` if `GameLoop` genuinely can't express variable tick cadence.

## Files you must NOT touch

- All systems under `systems/**` and all `agents/**` — playback must not change sim behavior.
- `sim-bootstrap.ts`, `world-setup.ts`, `world/**`, `components.ts`, `protocols/**`.
- `screens/**`, `render-systems.ts`.
- Other engine source except the one `loop.ts` exception above.

## Determinism guarantee

Pausing/stepping/speed must produce **byte-identical** sim state to an uninterrupted run for the same seed and same total tick count. The only thing changing is wall-clock pacing of `scheduler.tick`. Do not introduce any wall-clock or `Date.now` dependency into tick logic.

## Acceptance criteria

- `npm run typecheck -w farm-valley` passes
- `npm run test -w farm-valley` passes (new playback-controls tests added)
- `npm run dev`: spacebar pauses/resumes; speed buttons visibly change sim rate; step advances exactly one tick while paused; pan/zoom/focus still work while paused
- No `.js` import suffixes; no new runtime deps

## Workflow

You're the sonnet executor. Read this brief, then the listed files (especially `main.ts` `GameLoop` wiring and one existing `ui/*.ts` panel for the pattern), then implement. Run typecheck + tests before reporting done. Report files changed, test counts, and anything surprising. Do not commit — orchestrator handles that.
