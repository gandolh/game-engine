# audit-09 — Citadel re-runs the whole job-assignment ladder per idle villager per tick

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`) — likely the dominant per-tick cost in the Citadel worker.

## The defect

[games/citadel/sim-core/src/systems/villager-system.ts:177-180](../../../games/citadel/sim-core/src/systems/villager-system.ts#L177-L180):

```ts
private step(v: VillagerComponent, ctx: SimContext): void {
  switch (v.fsm) {
    case "idle":
      this.assign(v);        // every tick, ungated
```

`assign()` ([:246-283](../../../games/citadel/sim-core/src/systems/villager-system.ts#L246-L283)) does one
full `buildingWorld.query("building")` scan to collect `staffedTypes`, then 8 tiers × 2 passes, each its
own full scan — ~17 scans. A villager that cannot be placed **stays `idle` and repeats this forever**.

`buildingWorld` holds one entity **per road tile** as well as per building
([sim-bootstrap.ts:558](../../../games/citadel/sim-core/src/sim-bootstrap.ts#L558) spawns for every
`placeOne`, roads included), so in a mature 192×192 town the scanned set is easily 600-1000 entities.
Each scan also takes a pooled array copy of the whole set
([world.ts:67-70](../../../engine/core/src/ecs/world.ts#L67-L70)).

## Failure scenario

A mature solo town where every worker slot is filled, or whose producers are all disconnected: every
surplus villager is **permanently** idle, costing ~17 × B entity iterations per tick each. At 30 idle
villagers and B ≈ 800 that is ~410k entity iterations per tick — ~8 M/s at 20 Hz, ~33 M/s at the 4×
speed button.

Note this is a *Citadel* finding. [wiki/performance.md](../../wiki/performance.md) is Farm-only and its
"engine far under budget" conclusion was measured against Farm's ~300 entities; it does not cover this.

## Fix sketch

Two independent changes, either of which helps; do both:
1. **Cache the candidate set** — open slots bucketed by `[goods, primary, staffed]`, invalidated on
   placement / demolish / worker-count change (the same events that already maintain
   `state.buildingTiles`).
2. **Back off failed assignment** — an idle villager that failed to place retries on an interval (e.g.
   once per sim-day) instead of every tick. This alone removes the pathological case.

## Files you OWN
- [games/citadel/sim-core/src/systems/villager-system.ts](../../../games/citadel/sim-core/src/systems/villager-system.ts)
- the cache/invalidation hooks where placement and demolish already update `state`
- colocated tests

## Files you must NOT touch
- scheduler registration order in `sim-bootstrap.ts` — read the inline comments; the order encodes real
  data dependencies
- the engine's ECS (`world.ts`) — do not "fix" query iteration; it is already pooled and measured

## Acceptance
- Assignment cost no longer scales with (idle villagers × buildings) per tick. Report measured entity
  iterations or tick time before/after, via `npm run sim:citadel` with a small budget.
- **Behaviour must be identical**: the same villager gets the same job in the same tier order for a
  fixed seed. A cache that changes assignment order changes the sim. Prove it with a fixed-seed
  before/after run comparison, not just a green suite.
- `npm run test -w @citadel/sim-core` green, including the `phase45` fixtures.
- Keep runs small (low `MAX_DAYS`); **ask before any full determinism check**.
