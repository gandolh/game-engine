# Game Task 92 — Model B: runtime-varying world seed + multi-seed property tests

**Status:** Todo
**Epic:** Organic world gen (Model B). Brief 3 of 3. **Depends on [90](90-modelb-generate-world-and-mask-plumbing.md) + [91](91-modelb-ca-shapes-and-mask-derived-anchors.md)** (organic shapes + mask-derived anchors must be proven across many pinned seeds first).
**Design:** grill-me 2026-06-13 (decision table in [90](90-modelb-generate-world-and-mask-plumbing.md)).

## Goal

Flip the world seed from the fixed default to **runtime-varying** — a different organic map per run, still fully deterministic per chosen seed. Prove the gameplay systems that ride on world layout survive an arbitrary map.

## Work

- **Thread a runtime world seed** into `generateWorld(seed)` at bootstrap ([sim-bootstrap.ts](../../../../packages/sim-core/src/sim-bootstrap.ts)). Source: a field on the sim config / `SEED` env for run-sim. The exported `REGIONS`/`ROADS` (default-seed) consts from [90](90-modelb-generate-world-and-mask-plumbing.md) get replaced by the bootstrap-time generated result threaded through; audit the ~118 callers that import `REGIONS`/`regionAt` to consume the generated instance, not a module const.
- **Gameplay-ripple audit** — varying map shifts everything keyed off layout:
  - Farmer→farm assignment (`homeRegion` on `FarmerSpec`, `makeExtraFarmerSpecs`) — still valid for any farm set.
  - `nearestResourceZone` routing — re-derives per map; verify a far farm still routes sanely.
  - Bridge topology / BFS connectivity — must hold for every accepted seed (rect fallback guarantees a generable map, but connectivity is the gate).
  - Economy/balance: does map size/shape shift AP-to-resource distances enough to skew the 100-day race? Note in [economy.md](../../../wiki/economy.md) if so.
- **Multi-seed property tests** — the validation strategy [world-generation.md](../../../wiki/world-generation.md) was blocked on. Run `generateWorld` over many seeds; assert invariants as **properties**: no region pair < 2 ocean gap, full BFS connectivity from village, every forced core on land, every station/footprint placed. This is the accept-check for "any seed produces a playable map."

## Key invariants

- Deterministic **per seed**: same seed → byte-identical sim at ticks/day **20 and 1200** (only run CHECK_DETERMINISM if asked).
- Every accepted seed satisfies all property-test invariants; rect fallback ([91](91-modelb-ca-shapes-and-mask-derived-anchors.md)) keeps every seed generable.
- All randomness `rng.fork(label)` off the world seed; never `Math.random`/`Date.now`.
- Masks stay out of `RenderSnapshot`.

## Risks

- **Balance drift** — a wildly different map could de-tune the economy. If property tests show large distance variance, consider clamping seed acceptance to maps within a layout-metric band (bounded retry on the whole seed) rather than accepting any.
- **Concurrent-session / save compat** — if a run's seed isn't recorded, a replay regenerates a different map. Persist the chosen seed alongside run results.

## On completion

Move 90/91/92 to `done/`, append `log.md` entries, and update [world-generation.md](../../../wiki/world-generation.md): Model B moves from "research menu" to "implemented"; mark Phase 0/1/2 status.
