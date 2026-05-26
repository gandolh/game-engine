# Game Task 14 — MEET Indicator

## Context

`EncounterSystem` emits `ONT_ENCOUNTER.MEET` to both farmers when they share a region. The MEET pair has a 20-tick cooldown (`MEET_COOLDOWN_TICKS`). Today there's no visual signal — encounters are invisible to the observer. The locked design vision wants encounters to be a "moment" the player can spot.

## Goal

When two farmers MEET, render a visible indicator (small bubble / icon / connecting line) over each farmer for a short period (the cooldown window, or a shorter dedicated indicator window, e.g. 10 ticks). Multiple simultaneous MEETs render independently.

## Files in scope

- `packages/farm-valley/src/systems/meet-indicator.ts` (create) — a small bookkeeping system that snoops the bus or the encounter map and tracks `{ farmerId, peerId, expiresAtTick }` indicator events. Two implementation options:
  - **(a) Snoop the bus** for `ONT_ENCOUNTER.MEET` messages via `bus.subscribeOntology` (cheap; runs at system-construction time)
  - **(b) Mirror the cooldown map** — read state from EncounterSystem. Tighter coupling; avoid.
  Pick (a). Document.
- `packages/farm-valley/src/systems/meet-indicator.test.ts` (create) — given a MEET message on the bus, the system tracks an indicator; the indicator expires after the window
- `packages/farm-valley/src/sim-bootstrap.ts` — register the new system after `EncounterSystem`; export the indicator instance so `main.ts` / `render-systems.ts` can read it
- `packages/farm-valley/src/render-systems.ts` — accept a `meetIndicators: { farmerId: number; peerId: number }[]` parameter on `buildCanvasFrame`; for each active indicator, emit a sprite (a bubble / `!` icon from the atlas — check existing sprites first; if nothing fits, add a recipe in `tools/atlas-builder/src/recipes.ts` for `indicator/meet`) positioned above the farmer's transform
- `packages/farm-valley/src/main.ts` — pass current `meetIndicators.active(tick)` (or whatever method you give the indicator system) to `buildCanvasFrame`
- `tools/atlas-builder/src/recipes.ts` + atlas artifacts — only if you need a new icon sprite

## Files you must NOT touch

- `packages/farm-valley/src/systems/encounter.ts`, `encounter-trade.ts`, `trust.ts`
- `protocols/encounter.ts`
- All personality / agent files
- All other systems
- `components.ts`, `world/**`, `world-setup.ts`
- `ui/**` (observer, leaderboard, etc.)
- Other engine source

## Coordination with concurrent briefs

- **Brief 11 (focus-camera)** adds a focus halo via a separate generator. Yours is also a separate generator (or a separate render pass). Both append to the sprite list — no conflict if you scope to your own function.
- **Brief 13 (walking-animation)** modifies the farmer sprite frame in the existing entity loop. You don't touch farmer sprites — you emit *new* sprite entries for indicators. No conflict.
- **Brief 15 (slate-billboard)** is DOM; no conflict.

## Acceptance criteria

- `npm run typecheck -w farm-valley` passes
- `npm run test -w farm-valley` passes (no regressions; new meet-indicator test added)
- If atlas changed: `npm run atlas` succeeds
- `npm run dev`: when two farmers walk into the same region, a small indicator appears above each of them for ~10–20 ticks
- No `.js` import suffixes; no new runtime deps

## Workflow

Sonnet executor. Read brief → read `encounter.ts` (event shape), `protocols/encounter.ts`, existing renderer for sprite-emission pattern → implement. Run typecheck + tests before reporting. Do not commit.
