# Brief 61 — Continuous sub-tile movement for Pip (fixes the rapid-reversal teleport)

**Status:** done (merged 2026-06-10) · **Area:** `packages/sim-core` (player-control) + snapshot path · **Drafted:** 2026-06-10

**Bug:** rapidly alternating input (left→right→left) makes Pip visually **teleport**. **Decision:** rather than patching the tile-glide, convert Pip to **continuous movement** — float position + velocity, so Pip can rest at a fraction of a tile. This eliminates the whole class of glide-reset glitches.

## Read first

- [corpus/wiki/player-and-interaction.md](../../../wiki/player-and-interaction.md) — Pip, hotbar, feature collision.
- Root [CLAUDE.md](../../../../CLAUDE.md) — determinism rules; sim lives in `packages/sim-core` since the 55-58 split.
- The existing tests: [player-control.test.ts](../../../../packages/sim-core/src/systems/player-control.test.ts) — note the press-stop-press regression test (~137-152); it does **not** cover mid-glide reversal.

## Root cause of the teleport (verified against code 2026-06-10)

Pip's movement is **tile-committed with a trailing render glide**, in [packages/sim-core/src/systems/player-control/system.ts](../../../../packages/sim-core/src/systems/player-control/system.ts):

- On a step commit (~lines 67-83): `transform.x/y` jumps a **whole tile immediately**; `glideFromX/Y` remembers the departed tile; `farmer.renderPos` (float, render-only) eases from `glideFrom` → `transform` over `PLAYER_STEP_TICKS` (3 ticks) using `frac = (STEP - cooldown) / STEP` (~line 93-97).
- Input arrives as latest-wins overwrites of `player.pendingMoveX/Y` ([server/src/sim-host.ts](../../../../packages/server/src/sim-host.ts) `applyInput` ~185-193 — no per-tick queue).
- **The bug:** reverse direction mid-glide → the next commit resets `glideFromX = Math.round(transform.x)`, a tile that can be **behind where `renderPos` already eased to** (e.g. renderPos at 31.33 between 32→31, new commit sets renderPos back to 31, then transform jumps to 32). The snapshot stream emits a backward jump, and the main-thread two-snapshot lerp ([sim-client/client.ts](../../../../packages/farm-valley/src/worker/sim-client/client.ts) ~327-332) amplifies it into a visible teleport. Sim-side bug; the renderer faithfully displays it.

## Design: continuous movement

Pip's authoritative position becomes a **float** (sub-tile), updated by a per-tick velocity derived from held axes. AI farmers stay tile-based (pathfinder waypoints) — **do not touch TravelSystem**.

- **Position:** keep `transform.x/y` as the single authoritative position but allow fractions for Pip. Every sim consumer that targets tiles must round: action targeting ([systems/act](../../../../packages/sim-core/src/systems/act/index.ts)), region/proximity checks in render-systems, hotbar tile targeting.
- **Velocity:** speed = `1 / PLAYER_STEP_TICKS` tiles/tick (matches current effective speed, 3 ticks/tile). Held axes set velocity directly (no acceleration — keep it deterministic and snappy). Diagonal: normalize (×`Math.SQRT1_2`) or keep axis-independent — pick one, document it, keep it deterministic (no `Math.random()`, no wall-clock).
- **Collision:** keep tile-quantized walkability (`canStand` → `isWalkable` + feature/`solid` checks, currently ~lines 202-215 of system.ts) but test it against Pip's **AABB** (a slightly-inset box, e.g. 0.6×0.6 tile around Pip's center): move X then Y separately per tick, clamping each axis at the blocking tile's edge. This preserves the existing wall-slide feel and never lets Pip's box overlap a solid tile.
- **renderPos / glide machinery:** delete `glideFromX/Y`, `stepCooldown`, and the easing block. `renderPos` either goes away (snapshot-builder [sprites.ts](../../../../packages/sim-core/src/snapshot-builder/sprites.ts) ~143-147 falls back to `transform`, now smooth by itself) or is set `= transform` every tick. Main-thread snapshot interpolation needs **no change** — it already lerps floats.
- **Facing** stays authoritative from input axes (as today, ~line 59).
- **Determinism:** input is an external side-channel (latest-wins buffer) — unchanged. Given the same input-per-tick sequence, movement must be bit-identical; velocity math uses plain float ops only.

## Tasks

- [ ] **1. Write the failing regression test first:** drive PlayerControlSystem, flip `pendingMoveX` left→right mid-step, assert Pip's emitted position **never moves backward past its previous value by more than one tick's velocity** (this fails on current code).
- [ ] **2.** Rework [player-control/system.ts](../../../../packages/sim-core/src/systems/player-control/system.ts): velocity-based float movement + per-axis AABB collision clamp; remove glide fields from the player component ([components/farmer.ts](../../../../packages/sim-core/src/components/farmer.ts) ~96-132).
- [ ] **3.** Round-at-the-seams audit: grep every reader of Pip's `transform` in sim-core (`act/`, hotbar targeting, region tracking, snapshot proximity labels) and apply `Math.round` where a tile index is expected. `noUncheckedIndexedAccess` will catch some, not all.
- [ ] **4.** Update [player-control.test.ts](../../../../packages/sim-core/src/systems/player-control.test.ts): speed parity (≈3 ticks/tile), wall-slide, stop-resting-at-fraction, reversal smoothness. Keep the old press-stop-press regression green (semantics: stopping no longer snaps to a tile).
- [ ] **5.** Verify AI farmers untouched: [travel.test.ts](../../../../packages/sim-core/src/systems/travel.test.ts) green, and a short headless `npm run sim` run (MAX_DAYS=3, ticks=20) diffs identical vs `main` for a couple of seeds — Pip is absent headless, so any diff means collateral damage. **Ask the user before running any determinism check** (resource-limits rule).
- [ ] **6.** Manual feel-check in `npm run dev`: hold-walk, rapid left↔right jitter (no teleport), action targeting (E) still hits the tile in front of Pip, hotbar interactions on plots still work.

## Acceptance

- Rapid direction reversal produces smooth, monotonic-feeling motion — no backward jump in the snapshot stream (regression test from task 1 passes).
- Pip can stop mid-tile and remain there.
- Tile-targeted actions (till/plant/water, feature interactions) behave exactly as before.
- AI farmer behaviour byte-identical (task 5 diff).

## Risks / notes

- **Biggest risk is the rounding seams (task 3)** — a missed `Math.round` turns into a subtle off-by-one in action targeting. Be exhaustive; list every touched call-site in the PR description.
- Feature collision currently blocks per-tile; the AABB inset (0.6) is a feel parameter — tune in dev, then freeze.
- Don't change the input protocol (`WorkerInbound`/WS) — latest-wins buffering is fine once movement is continuous.
