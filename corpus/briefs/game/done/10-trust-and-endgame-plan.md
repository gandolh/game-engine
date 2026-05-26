# Plan — Brief 10: Trust Updates + Aggressive End-of-Sim Liquidation

Author: orchestrator subagent
Date: 2026-05-26
Brief: [10-trust-and-endgame.md](./10-trust-and-endgame.md)

## TL;DR

Three concrete changes:

1. **Add a new `systems/trust.ts`** that snoops farmer inboxes (for encounter ACCEPT/DECLINE and for forwarded BUY_REQUEST acknowledgements that imply a successful sale), the market wall's inbox (for TRADE_COMPLETED), and the hoarder coordinators' state (for CNP broken commitments). Lazy-initializes `farmer.trust` when first touched. Clamped to `[0, 1]`.
2. **Extend `ONT_SIMULATION.DAY_START`'s body** with a `daysRemaining` field; `DayClockSystem` accepts `maxDays` via config and computes `maxDays - currentDay`. `PerceiveSystem` mirrors `daysRemaining` into `farmer.beliefs.data.daysRemaining`.
3. **Aggressive personality** gains a liquidation branch: when `beliefs.data.daysRemaining <= 2`, it travels to village (if needed) and enqueues `sell-shopkeeper` intents for every non-zero crop in inventory at priority 0 (above everything else); planting/market actions are skipped for that day.

## Why these shape choices

### Trust as a separate system (not folded into act/encounter/market)

- The events that should mint trust deltas are dispersed across three layers: farmer inboxes (encounter), wall inbox (TRADE_COMPLETED), and CNP coordinators (broken commitments). A single ownership site keeps the matrix legible and the deltas symmetrical.
- It keeps `act.ts`, `encounter.ts`, `market.ts` out of scope (per the no-touch list).
- It runs as a passive snooper: it READS inboxes without draining them. The actual consumers (PerceiveSystem for the farmer inbox; MarketSystem for the wall inbox) still drain them at their normal point in the schedule.

### Extending DAY_START vs. adding a new ontology

- Extend `DayStartBody` with an optional-then-required `daysRemaining: number`. Reasons:
  - DAY_START fires once per day already; the value derives directly from the day boundary that produced it.
  - PerceiveSystem already mirrors `body.day` into beliefs — adding `daysRemaining` is a one-liner there.
  - A second ontology would multiply per-day broadcasts for no semantic gain.
- Risk: any external consumer of DAY_START that destructures `{ day }` only is unaffected (additive).

### `maxDays` threading

`main.ts` already declares `CONFIG.maxDays = 100`. Currently `bootstrapSim` doesn't accept it. Add an optional `maxDays?: number` to `SimBootstrapOptions` (default `100`); pass it into the `DayClockSystem` config (`{ ticksPerDay, maxDays }`). `main.ts` passes `CONFIG.maxDays` through.

## Trust delta matrix

| Event | Detected at | Toward | Delta |
|---|---|---|---|
| Peer ACCEPTed our OFFER_SEED | farmer inbox: `ENCOUNTER.ACCEPT` from peer | sender | +0.05 |
| Peer DECLINEd our OFFER_SEED | farmer inbox: `ENCOUNTER.DECLINE` from peer | sender | -0.05 |
| We ACCEPTed peer's OFFER_SEED | farmer inbox: outgoing intent of kind `encounter-accept` not yet implemented; **fallback**: when farmer receives `ENCOUNTER.OFFER_SEED` and the next tick farmer's outgoing inbox has a matching `ENCOUNTER.ACCEPT` reply — out of scope for this round, see Gotchas. We instead apply the symmetric +0.05 on the responder side when their inbox receives `ENCOUNTER.OFFER_SEED` followed by their own `ENCOUNTER.ACCEPT` being observed in the bus. *Practical scope: only the initiator-side delta from the table above is implementable today*. The responder-side delta is documented as TODO. |  |  |
| CNP broken commitment | CNP coordinator: `task.status === "awarded"` past `deadlineTick + COMMITMENT_WINDOW` with `winnerId !== null` and no recorded `cnp-completed` ack | initiator → winner | -0.10 |
| Successful market trade | wall inbox: `MARKET.TRADE_COMPLETED` (snoop, not drain) — body carries `offerId`; trust system looks up offer's `sellerId` via MarketSystem's `offersById` map; buyer is inferred from preceding `BUY_REQUEST` if present, else skipped. **Simpler approach** (chosen): TRADE_COMPLETED body to carry `buyerId` and `sellerId`; the trust system reads those directly. Since no production code currently emits TRADE_COMPLETED, this is forward-looking. The trust system will read `buyerId`/`sellerId` if present in the body and apply +0.05 toward seller. If they're missing it silently does nothing (defensive). | buyer → seller | +0.05 |

### Implementation note on the responder-side OFFER_SEED ACCEPT

There is no system that *processes* OFFER_SEED right now — those ontologies are declared but no code (system or personality) reads them. The brief's responder-side delta ("we ACCEPTed peer's OFFER_SEED") would fire only when such a handler exists. The plan therefore implements:

- Initiator-side: when our inbox receives `ENCOUNTER.ACCEPT` or `ENCOUNTER.DECLINE`, we apply the corresponding delta toward the sender.
- A code comment in `trust.ts` calls out where the responder-side delta should be added once the OFFER_SEED loop is built.

This keeps the system honest about what events actually exist today.

### CNP broken-commitment detection

`cnp-coordinator.ts` already has `closeTask` which sets `status = "awarded"` and a `winnerId`. There is currently no signal that maps an awarded CNP task to "delivery completed." We add the following:

- A new method on `CnpCoordinator`: `expiredAwarded(currentTick: number, completionWindow: number): readonly CnpTask[]` returning awarded tasks where `currentTick - deadlineTick >= completionWindow` and `winnerId !== null` and `status !== "completed"`. Then `markCompleted(taskId)` would still flip status (it already exists).
- Hoarder is read-only, so we do NOT add this to hoarder. Instead the trust system holds a registry of coordinators keyed by farmer id, populated lazily via the same `coordinators` map that hoarder.ts uses. Problem: that map is `const` inside hoarder.ts, not exported.

Alternative — keep ownership where it lives. Add to `CnpCoordinator`:
- A new instance method `findBrokenCommitments(currentTick, window)` returning broken tasks.
- A new instance method `markBrokenCommitmentReported(taskId)` so we only emit the trust delta once per task.

Then the trust system needs access to coordinators. The cleanest non-invasive way: export a `getCnpCoordinator(farmerId)` accessor from hoarder.ts so the trust system can query it. But hoarder.ts is on the no-touch list.

**Resolution**: Move the `coordinators` Map out of `hoarder.ts` into the (non-read-only) `cnp-coordinator.ts` as a module-level registry with `getOrCreateCoordinator(farmerId)` / `listCoordinators()` exports. The `hoarder.ts` change is a one-line import swap of the same function name — but it's still a write. The brief lists hoarder.ts on the no-touch list explicitly.

**Final resolution (no hoarder edit)**: Define an `internal/cnp-registry.ts` that owns the coordinators Map, exporting `getOrCreateCoordinator(farmerId)` and `listCoordinators()`. hoarder.ts already uses a private local Map. We *cannot* modify hoarder.ts. So the trust system reaches into hoarder's coordinators via a new exported test-style accessor on hoarder.ts — also forbidden.

**Accepted compromise**: ship the broken-commitment delta logic + unit test against `CnpCoordinator` directly (give it the `findBrokenCommitments` + `markBrokenCommitmentReported` methods). In `trust.ts`, document that the coordinator-side wiring depends on a future small refactor of hoarder.ts to expose its coordinator (one-line change, future ticket). Add the trust system hook that *accepts* a coordinator (or no coordinator) so the unit test covers the math even though integration into hoarder is deferred.

Net effect:
- `CnpCoordinator` gets two new methods (commitment window + reporter tracking).
- `trust.ts` accepts an optional `cnpCoordinators: ReadonlyMap<number, CnpCoordinator>` source via constructor. When wired with a populated map, broken-commitment trust hits emerge automatically. Today the map will be empty (no integration into the hoarder pipeline), but the unit test injects a coordinator and asserts the delta.

## DayClock + Perceive changes

### `protocols/simulation.ts`

```ts
export interface DayStartBody {
  day: number;
  daysRemaining: number;  // new — maxDays - day
}
```

### `systems/day-clock.ts`

```ts
export interface DayClockConfig {
  ticksPerDay: number;
  maxDays: number;        // new
}
```

In `run`, compute `daysRemaining = Math.max(0, this.config.maxDays - this.currentDay)` and include it in `DayStartBody`.

### `systems/perceive.ts`

Inside the existing `DAY_START` branch, after writing `currentDay`:

```ts
farmer.beliefs.data.daysRemaining = body.daysRemaining;
```

### `sim-bootstrap.ts`

- Add `maxDays?: number` to `SimBootstrapOptions` (default `100`).
- Pass into `new DayClockSystem(bus, { ticksPerDay, maxDays })`.

### `main.ts`

- Add `maxDays: CONFIG.maxDays` to the `bootstrapSim({ ... })` call site.

## Aggressive liquidation branch

In `agents/aggressive.ts`, at the very top of `deliberateAggressive` (after sanity checks, before everything else):

```ts
const daysRemaining = farmer.beliefs.data["daysRemaining"] as number | undefined;
if (daysRemaining !== undefined && daysRemaining <= 2) {
  farmer.intentions.queue.length = 0;
  const inVillage = farmer.farmer?.currentRegion === "village";
  let anyToSell = false;
  for (const crop of PROFITABILITY_ORDER) {
    const qty = farmer.inventory.crops[crop];
    if (qty > 0) {
      anyToSell = true;
      farmer.intentions.queue.push({
        kind: "sell-shopkeeper",
        data: { crop, quantity: qty },
        priority: 0,
      });
    }
  }
  if (anyToSell && !inVillage) {
    farmer.intentions.queue.unshift({
      kind: "travel",
      data: { targetRegionId: "village" },
      priority: 0,
    });
  }
  return;  // skip plant/market for the day
}
```

Priority 0 puts liquidation ahead of every other priority (1..6) the system uses. The intent queue is sorted at end of normal deliberation; in the liquidation branch we early-return, but the sort order is moot when only one priority exists. We DO unshift the travel intent so it precedes the sells in queue order (the existing `priority` sort would still group them together; positional order within a priority bucket is then insertion order — see Gotchas).

## File-by-file changelist

### Write (in scope)
- `packages/farm-valley/src/protocols/simulation.ts` — extend `DayStartBody`.
- `packages/farm-valley/src/systems/day-clock.ts` — accept `maxDays`; emit `daysRemaining`.
- `packages/farm-valley/src/systems/perceive.ts` — mirror `daysRemaining` into beliefs.
- `packages/farm-valley/src/sim-bootstrap.ts` — thread `maxDays` from options into DayClock.
- `packages/farm-valley/src/main.ts` — pass `CONFIG.maxDays` to `bootstrapSim`.
- `packages/farm-valley/src/agents/cnp-coordinator.ts` — add `findBrokenCommitments`, `markBrokenCommitmentReported`.
- `packages/farm-valley/src/agents/aggressive.ts` — liquidation branch.
- New `packages/farm-valley/src/systems/trust.ts` — TrustSystem.

### Write (tests, additive)
- New `packages/farm-valley/src/systems/trust.test.ts`
- New `packages/farm-valley/src/systems/day-clock.test.ts` (only if no existing one — confirm before creating; otherwise extend)
- Extend `packages/farm-valley/src/agents/aggressive.test.ts` with the liquidation case.
- Extend `packages/farm-valley/src/agents/cnp-coordinator.test.ts` for the broken-commitment helpers.

### No-touch (must NOT edit)
- `packages/engine/**`
- `packages/farm-valley/src/systems/{travel,market,shopkeeper,encounter,act,finish-day,harvest,inbox-dispatch,weather,crop-growth,ap,shop-slate}.ts`
- `packages/farm-valley/src/agents/{conservative,hoarder,opportunist,shop-slate}.ts`
- `packages/farm-valley/src/protocols/{market,shop,encounter,travel}.ts`
- `packages/farm-valley/src/world/**`, `packages/farm-valley/src/world-setup.ts`
- `packages/farm-valley/src/components.ts` is ALSO not strictly necessary — `TrustScores` already exists. Touch only if a new field needs adding (we don't).

## TrustSystem details

### Signature

```ts
export interface TrustConfig {
  acceptDelta?: number;      // default +0.05
  declineDelta?: number;     // default -0.05
  brokenDelta?: number;      // default -0.10
  tradeDelta?: number;       // default +0.05
  brokenCommitmentWindow?: number;  // default 4 ticks past deadline
}

export class TrustSystem implements System {
  constructor(
    private readonly world: World<GameEntity>,
    private readonly cnpCoordinators?: ReadonlyMap<number, CnpCoordinator>,
    private readonly config?: TrustConfig,
  ) {}
}
```

### What it does each tick

1. For every farmer (has `inbox`):
   - Walk `inbox.messages` *without removing them*.
   - If `msg.ontology === ENCOUNTER.ACCEPT` and `typeof msg.sender === "number"`: apply `+acceptDelta` toward `msg.sender`.
   - If `msg.ontology === ENCOUNTER.DECLINE` and `typeof msg.sender === "number"`: apply `-declineDelta` toward `msg.sender`.
   - Track which messages we've already applied via a `Set<string>` keyed by `${farmerId}:${ontology}:${msg.tickIssued}:${msg.sender}` so re-runs on the same tick don't double-apply. (Defense in depth — within a single scheduler.tick this is moot.)
2. For the market wall (has `marketWall` + `inbox`):
   - Walk `inbox.messages`. For each `MARKET.TRADE_COMPLETED`, read `body.buyerId` and `body.sellerId`. If both are numbers: apply `+tradeDelta` to buyer's trust toward seller.
   - Tracked-applied set as above to avoid double-counting since MarketSystem may not run until later this tick.
3. For each entry in `cnpCoordinators`:
   - Call `coord.findBrokenCommitments(ctx.tick, brokenCommitmentWindow)`.
   - For each broken task, apply `-brokenDelta` to `task.initiatorId`'s trust toward `task.winnerId`.
   - Call `coord.markBrokenCommitmentReported(task.taskId)` so it fires once.

### Lazy trust init

```ts
function applyTrustDelta(farmer: GameEntity, peerId: number, delta: number): void {
  if (!farmer.trust) farmer.trust = { byId: new Map<number, number>() };
  const current = farmer.trust.byId.get(peerId) ?? 0.5;
  const next = Math.max(0, Math.min(1, current + delta));
  farmer.trust.byId.set(peerId, next);
}
```

Baseline `0.5` matches the default that `hoarder.ts` and `opportunist.ts` already use when looking up missing peers.

### Where it sits in the scheduler

Insert between `InboxDispatchSystem` and `PerceiveSystem` in `sim-bootstrap.ts`. After dispatch, farmer inboxes contain the messages destined for them this tick. Before perceive drains them.

```
... .add(new InboxDispatchSystem(bus, world))
    .add(new ShopSlateSystem(world, bus, rng))
    .add(new EncounterSystem(world, bus))
    .add(new TrustSystem(world, /* coords */ undefined))  // NEW
    .add(new PerceiveSystem(world))
```

Trade-off: PerceiveSystem currently clears the farmer inbox at the end of its run. TrustSystem reads but doesn't clear — Perceive's clearing afterwards is fine.

The market wall's inbox is drained by MarketSystem, which runs AFTER TrustSystem in the tick. So TrustSystem snoops first; market drains. Order is correct.

## Tests

### `systems/trust.test.ts` (new)

- `applies +acceptDelta on inbox ENCOUNTER.ACCEPT` — seed farmer with no trust; run system after pushing an ACCEPT message; assert `farmer.trust.byId.get(senderId) === 0.55`.
- `applies -declineDelta on inbox ENCOUNTER.DECLINE` — assert `0.45`.
- `clamps trust above 1` — set initial `0.98`; apply ACCEPT; assert `1.0`.
- `clamps trust below 0` — set initial `0.05`; apply DECLINE; assert `0.0`.
- `applies +tradeDelta on TRADE_COMPLETED to buyer toward seller` — create market wall entity, push TRADE_COMPLETED with `{ offerId, buyerId, sellerId }`, run system; assert buyer's trust map has +0.05 toward seller.
- `does not crash when TRADE_COMPLETED body lacks buyerId/sellerId` (defensive).
- `applies -brokenDelta from CNP broken commitment` — construct a coordinator, start + award a task, advance past `brokenCommitmentWindow`, run system; assert initiator's trust toward winner is `0.4`.
- `idempotent: running the same tick twice does not double-apply` — for both inbox and broken-commitment paths.
- `lazy-inits farmer.trust when absent`.

### `agents/aggressive.test.ts` (extend)

- `liquidates all crops when daysRemaining <= 2` — farmer with `{ pumpkin: 3, wheat: 2, radish: 4 }`, `beliefs.data.daysRemaining = 1`, in village → intent queue contains exactly three `sell-shopkeeper` intents covering all three crops, no `plant`/`buy-seed`/`post-offer`.
- `liquidation issues travel-to-village first when not in village`.
- `does not liquidate when daysRemaining = 3` — falls back to normal flow.

### `agents/cnp-coordinator.test.ts` (extend)

- `findBrokenCommitments returns awarded tasks past the commitment window` — start, award (close), advance ticks past `deadlineTick + window`, assert returned task list contains it.
- `markBrokenCommitmentReported prevents re-reporting`.
- `findBrokenCommitments excludes already-completed tasks`.
- `findBrokenCommitments excludes tasks with winnerId === null`.

### `systems/day-clock.test.ts` (new — verify no existing file before adding)

- `publishes DAY_START with daysRemaining = maxDays - day` — at tick 0 with `maxDays: 100`, expect `{ day: 0, daysRemaining: 100 }`; advance one day, expect `daysRemaining = 99`.
- `clamps daysRemaining to 0 once past maxDays`.

### `systems/perceive.test.ts` — check whether one exists; if so extend, else skip (not required).

Note: `npm run test -w farm-valley` should remain green.

## Gotchas

1. **Trust map on farmers is currently never initialized** — `world-setup.ts` (no-touch) does not seed `trust`. The TrustSystem must lazy-init the map on first delta. Confirmed in `applyTrustDelta` above.
2. **Clamp ordering**: clamp AFTER addition (`Math.max(0, Math.min(1, current + delta))`), not before. Single expression keeps it obvious.
3. **Inbox snoop without drain**: TrustSystem reads but does not clear `inbox.messages`. PerceiveSystem clears the farmer inboxes at the end of its run (line 23 of perceive.ts: `farmer.inbox.messages.length = 0;`). MarketSystem drains the wall inbox. Both happen later in the same tick — order is correct.
4. **TRADE_COMPLETED is never emitted today**: defensive coding — if `buyerId`/`sellerId` missing from the body, skip silently. Unit test asserts this. No production code path tests this in integration; that lands when a seller-side market handler is added.
5. **Responder-side OFFER_SEED ACCEPT delta**: not implementable today because no system processes OFFER_SEED. Document via comment + matrix entry; ship initiator-side only.
6. **Broken-commitment delta detection requires access to CNP coordinators**, currently encapsulated in hoarder.ts (no-touch). Ship the coordinator math + unit test; the wiring into the scheduler happens with `cnpCoordinators: undefined` for now. A short follow-up brief should expose the coordinator registry (one-line export change). Documented in code.
7. **`daysRemaining` clamp**: `Math.max(0, maxDays - day)` so the field never goes negative if game runs past `maxDays` (main.ts already halts at `day >= maxDays`, but defensive is good).
8. **DAY_START body is additive**: only PerceiveSystem reads `body.day` today; any other future consumer that destructures `{ day }` only is unaffected.
9. **Priority interaction in aggressive**: liquidation uses `priority: 0` which is lower than every other priority in the file (1..6), meaning it sorts first. But the early return after enqueueing makes the sort moot — only the liquidation intents are in the queue.
10. **Travel intent ordering inside liquidation**: I `unshift` so travel is positionally first; the priority sort at the end of the normal deliberate flow is bypassed by the early return, so insertion order is preserved.
11. **Idempotency of broken-commitment reporting**: critical, since the trust system runs every tick but a broken task remains broken indefinitely. `markBrokenCommitmentReported` flag on the task prevents repeated -0.10 hits.
12. **Idempotency of inbox-based deltas**: messages live in `inbox.messages` only until PerceiveSystem clears them at the end of the same tick. So within one tick, TrustSystem runs once → sees the message once. No idempotency state needed across ticks for the inbox path. Keep the design simple; do not add a tracking set.

## Acceptance check (post-implementation)

- `npm run typecheck -w farm-valley` — passes
- `npm run test -w farm-valley` — passes (existing tests + new trust + extended aggressive + extended coordinator tests + new day-clock if needed)
- All new code uses extensionless imports (no `.js` suffixes)
- No new dependencies in `packages/farm-valley/package.json`
- No edits to files in the no-touch list
