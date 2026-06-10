# Brief 68 — Ambient idle life (birds, leaves, chimney smoke)

**Status:** done (merged 2026-06-10) · **Area:** `packages/farm-valley` (render-only ambient layer) · **Drafted:** 2026-06-10

The world reads as frozen between farmer actions. Add a thin layer of ambient motion — occasional birds crossing the sky, drifting leaves near trees, smoke wisps from building chimneys — so the valley breathes while you watch. From the 2026-06-10 game-feel research pass ([performance.md](../../../wiki/performance.md) Tier 3). **Render-only; zero sim/determinism impact** — nothing here may touch the worker/server sim or the snapshot contents.

## Read first

- Root [CLAUDE.md](../../../../CLAUDE.md) — **EDG32 palette is enforced**; every particle color must be an `EDG.*` constant (the guard test will fail otherwise).
- [packages/farm-valley/src/main/render-loop.ts](../../../../packages/farm-valley/src/main/render-loop.ts) — where the dynamic draw queue is built; the foam-bubble stride logic there is the existing pattern for cheap ambient effects.
- Brief [64](64-subtle-water-waves.md) (todo) — sibling ambient-water effect; share the same update slot if it lands first.

## Current state

- All current ambience is tied to sim state (weather particles, meet indicators). There is no client-side ambient particle layer.
- The renderer is Canvas2D with a per-frame dynamic queue over a baked static backdrop; budget is comfortable at ~300 sprites (research pass conclusion), so a capped ambient layer is safe.

## Tasks

- [ ] **1. Ambient layer module** (`main/ambient.ts`): a client-side particle pool updated per render frame with `dtMs`, drawing into the dynamic queue (above terrain, below UI). Hard cap (~40 live particles), object-pooled, zero per-frame allocation.
- [ ] **2. Determinism stance: cosmetic randomness is allowed here** — this layer lives entirely outside the sim (`Math.random()` is acceptable client-side, like the existing wall-clock alpha). But seed a local mulberry32 from the run-descriptor seed anyway so two viewers of the same run see the same skies — it's one line and keeps the "same seed, same movie" story whole. **Never** read or fork the sim rng.
- [ ] **3. Three effects:**
  - **Birds** — 1–3 silhouettes crossing the viewport on a shallow arc every 20–60 s, despawn off-screen.
  - **Leaves** — near tree features (positions available from the static layer), a leaf detaches, flutters down-wind ~2 s, fades.
  - **Chimney smoke** — slow wisps above shop/tavern/house set-pieces, rising + dissipating, density modulated by the day/night wash time (less at night).
- [ ] **4. Pause behaviour:** ambient motion keeps running while the *sim* is paused (the world is alive even when time is stopped) — but freezes when the tab is hidden (coordinate with brief [66](66-visibilitychange-pause-resync.md); reuse its hidden flag).
- [ ] **5. Verify:** palette guard test passes; no measurable frame-time regression with the profiler overlay; `npm run typecheck` + `npm run test -w farm-valley`.

## Acceptance

- Idle viewport shows believable occasional motion within ~30 s of watching; nothing flickers or accumulates unbounded.
- `npm run sim` and all sim tests byte-identical (this code is unreachable headless).
- Every drawn color is an `EDG.*` constant.

## Risks / notes

- **Low risk, taste-heavy.** Err toward *sparse* — this is a quiet farm, not a particle demo. Tunable constants at the top of the module.
- Don't couple to snapshot data beyond static-layer positions and day-phase; the layer must survive a server reconnect without state.
