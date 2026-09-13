# audit-04 — Hollow builds a whole snapshot to read one integer

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). One-line engine-free fix inside Hollow.

## The defect

[games/hollow/client/src/worker/sim-worker.ts:267-274](../../games/hollow/client/src/worker/sim-worker.ts#L267-L274):

```ts
function tickBatch(count: number): void {
  if (simResult === null) return;
  for (let i = 0; i < count; i++) {
    simResult.tick();
    const tick = simResult.getSnapshot().tick;     // full snapshot for one integer
    if (ticksPerDay > 0 && tick % ticksPerDay === 0) sampleAndPostMetrics(tick / ticksPerDay);
  }
}
```

`getSnapshot()` ([hollow/sim-core/src/sim-bootstrap.ts:1006-1089](../../games/hollow/sim-core/src/sim-bootstrap.ts#L1006-L1089))
builds the entire agent/corpse/community/resource payload. The tick counter it wants is a closure
local (`let tickCount = 0`, [sim-bootstrap.ts:969](../../games/hollow/sim-core/src/sim-bootstrap.ts#L969))
with **no getter**, even though `get interventionLog()` sits right beside it at line 990.

The `inspect` handler (~line 311 of the worker) has the same shape.

## Failure scenario

Hollow at speed 8 (`SPEED_OPTIONS = [1,2,4,8]`): each 20 Hz interval fire runs 8 ticks, so 8
`getSnapshot()` calls from `tickBatch` plus 1 from `postSnapshot` — and **8 of the 9 are discarded
after reading one integer**. Each build allocates an object per agent plus a `needs` record (via
`Object.entries`), an inventory spread and an appearance object, sorts the corpse list, and maps every
community's territory. At population 40 that is ~250 objects per build, so roughly 40k discarded
objects/sec on the worker thread — exactly where the sim needs its budget. Scales linearly with a
persona-seeded larger population.

## Fix sketch

Add `get tick(): number { return tickCount; }` to the object returned by `bootstrapHollowSim`,
alongside the existing `get interventionLog()`. Read it in `tickBatch` and in the `inspect` handler.

Mind the off-by-one already documented at
[sim-bootstrap.ts:982-985](../../games/hollow/sim-core/src/sim-bootstrap.ts#L982-L985): `tickCount` is
incremented *after* `scheduler.tick`, and `schedule()` deliberately reads the pre-increment value. The
getter must return the same value `getSnapshot().tick` returns today — verify, don't assume.

## Files you OWN
- [games/hollow/sim-core/src/sim-bootstrap.ts](../../games/hollow/sim-core/src/sim-bootstrap.ts) (add the getter only)
- [games/hollow/client/src/worker/sim-worker.ts](../../games/hollow/client/src/worker/sim-worker.ts)

## Files you must NOT touch
- the snapshot *shape* — no fields added or removed
- any other system in `hollow/sim-core`

## Acceptance
- `getSnapshot()` is called once per posted snapshot, not once per tick. State the before/after count
  at speed 1 and speed 8.
- The per-sim-year metrics sampling still fires on exactly the same ticks — assert this, because an
  off-by-one here silently shifts every metrics row.
- `npm run test -w @hollow/sim-core` and `-w @hollow/client` green; `npm run sim:hollow` still produces
  the same metrics/chronicle for a fixed seed (this is the determinism-relevant check — the getter must
  not consume an Rng draw or change tick accounting).
