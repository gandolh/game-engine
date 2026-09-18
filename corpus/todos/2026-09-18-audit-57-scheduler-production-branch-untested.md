# audit-57 — The Scheduler branch every game runs is never directly tested, and nothing pins system order

status: todo
created: 2026-09-18
context: found by the coverage lens of the 2026-09-18 sweep. `CLAUDE.md` calls scheduler ordering
load-bearing — *"the ordering encodes real data dependencies"* — and there is no test that asserts it.

## The gap

[`engine/core/src/sim/scheduler.ts:50`](../../engine/core/src/sim/scheduler.ts#L50) has two branches:

```ts
tick(ctx: SimContext): void {
  if (this.auditBus !== null) {
    const bus = this.auditBus;
    for (let i = 0; i < this.systems.length; i++) { bus.setStage(this.stageMap[i] ?? ""); this.systems[i]!.run(ctx); }
    bus.endTickAudit();
  } else {
    for (const sys of this.systems) sys.run(ctx);   // ← the branch every game actually runs
  }
}
```

The only test file is `scheduler-audit.test.ts`, and **both** of its tests call
`scheduler.enableStageAudit(bus)` before ticking (lines 37 and 73). There is no `scheduler.test.ts`.
The production `else` branch is reached only indirectly, through `bootstrapSim()`-driven game tests
that are asserting something else entirely. `stages()` ([`:38`](../../engine/core/src/sim/scheduler.ts#L38))
and the `.stage()` grouping semantics have no test at all.

Related and in scope: [`message-bus.ts:135`](../../engine/core/src/sim/message-bus.ts#L135)
`notifySubscribers` runs handlers in a bare `for…of` with no isolation — one throwing ontology
subscriber aborts delivery for every later message in the tick — and `drain()`
([`:76`](../../engine/core/src/sim/message-bus.ts#L76)) returns the **live internal array** rather than
a copy. Neither is covered.

## Failure scenario

The two branches drift — a guard added to the audited loop, or a reorder introduced while adding
per-system profiling — and only the audited path is verified. Since system order is where this repo
encodes real data dependencies (EncounterSystem → EncounterTradeSystem → PerceiveSystem, EventFeed
before PerceiveSystem clears inboxes), a silent reorder is a whole-game behaviour change with no red test.

## What to do

A `scheduler.test.ts` that pins the contract rather than the implementation:

- register three named systems; tick with audit **OFF**; assert the recorded call order is exactly
  `[A, B, C]`
- tick with audit **ON**; assert the same order, plus the `setStage`/`endTickAudit` sequence — the
  point is that the two branches agree
- `stages()` returns the right `{stage, name}` pairs, including the empty-stage default

For the bus: a test that a throwing handler does not prevent the remaining handlers and messages from
being notified. **Decide** whether isolation is the wanted behaviour before changing `notifySubscribers`
— "a subscriber throw aborts the tick loudly" is a defensible design in a deterministic sim, and if
that is the intent it should be asserted as such rather than quietly made resilient. Say which you chose.

`drain()` returning the live array may equally be a deliberate allocation choice; check its callers
before "fixing" it, and if it is deliberate, write that down instead.

## Files you OWN
- a new `engine/core/src/sim/scheduler.test.ts`
- [`engine/core/src/sim/message-bus.test.ts`](../../engine/core/src/sim/message-bus.test.ts)
- [`engine/core/src/sim/message-bus.ts`](../../engine/core/src/sim/message-bus.ts) — only if the
  isolation decision says so

## Files you must NOT touch
- [`scheduler.ts`](../../engine/core/src/sim/scheduler.ts) — this brief pins current behaviour. Any
  change to the tick loop is a determinism change across four games and needs its own spec.
- any game's `bootstrapSim` registration order — [`wiki/system-ordering.md`](../wiki/system-ordering.md)
  is authoritative and unchanged here

## Acceptance
- The new tests fail if the production loop is reordered or short-circuited — **demonstrate** by
  temporarily reversing `this.systems` and showing red, then restoring by hand.
- `npm run test -w @engine/core` green, and no game's output moves (this brief adds tests only,
  unless the bus decision changes code — in which case re-verify determinism).
