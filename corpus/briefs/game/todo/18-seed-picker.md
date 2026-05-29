# Game Task 18 — Seed Picker on Home Screen

## Context

The run seed is hardcoded (`0xc0ffee` in `sim-bootstrap.ts` defaults / `main.ts`). Every run is identical, which undercuts the "watch emergent BDI behavior" pitch — viewers can't re-roll for a different story or revisit a memorable one. Since the sim is deterministic on seed alone ([decisions.md](../../../wiki/decisions.md)), exposing the seed turns each launch into a distinct, repeatable run.

Small brief; pairs with **Brief 17 (save/replay)**, which serializes the same seed for sharing.

## Goal

1. **Seed input on the home screen**: a text/number field pre-filled with the default seed, plus a "Randomize" button that picks a fresh seed (deterministically derived from a one-time entropy source at click time — this is UI, outside the sim, so `Math.random`/`Date.now` are allowed *here only*).
2. **Plumb the chosen seed** into `bootstrapSim` so Start uses it.
3. **Display the seed** during the run (e.g. in the debug overlay or observer header) and on the game-over screen so a good run can be noted/shared.

## Files in scope

- `packages/farm-valley/src/screens/home-screen.ts` — add the seed input + Randomize button; expose the chosen seed to the Start handler (callback or return value).
- `packages/farm-valley/src/screens/home-screen.test.ts` (create if absent) — test that Randomize changes the field and that Start surfaces the entered seed.
- `packages/farm-valley/src/main.ts` — receive the seed from the home screen and pass it into `bootstrapSim`; surface it in an existing overlay/panel.
- `packages/farm-valley/src/run-descriptor.ts` — ALLOWED to share the seed type with Brief 17 if that brief landed first; otherwise keep seed plumbing local and let 17 absorb it.

## Files you must NOT touch

- `systems/**`, `agents/**`, `world/**`, `components.ts`, `protocols/**`.
- `render-systems.ts`.
- `sim-bootstrap.ts` beyond confirming it already accepts `seed` in `SimBootstrapOptions` (it does — do not change its signature).

## Allowed-randomness note

`Math.random()` is permitted **only** in the home-screen "Randomize" handler (pre-sim UI). Once a seed is chosen it flows into the seeded `Rng` and the sim stays deterministic. Do not introduce non-determinism anywhere under `systems/**` or `agents/**`.

## Acceptance criteria

- `npm run typecheck -w farm-valley` passes
- `npm run test -w farm-valley` passes (home-screen seed test added)
- `npm run dev`: home screen shows a seed field + Randomize; entering a seed and pressing Start runs that seed; the seed is visible during play and at game over; the same seed reproduces the same run
- No `.js` import suffixes; no new runtime deps

## Workflow

You're the sonnet executor. Read this brief, then `screens/home-screen.ts` and the Start wiring in `main.ts`. Implement. Run typecheck + tests before reporting done. Report files changed, test counts, and anything surprising. Do not commit — orchestrator handles that.
