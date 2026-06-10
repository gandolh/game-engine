# Brief 69 — Named system stages + same-stage message read/write assertion

**Status:** done (merged 2026-06-10) · **Area:** `packages/engine` (scheduler, message-bus dev hooks) + `packages/sim-core` (sim-bootstrap) · **Drafted:** 2026-06-10

The scheduler registration order in [sim-bootstrap.ts](../../../../packages/sim-core/src/sim-bootstrap.ts) encodes real data dependencies (EncounterSystem → EncounterTradeSystem → PerceiveSystem which clears inboxes; EventFeed/Tavern/Harbor/Festival must snoop messages **before** PerceiveSystem clears and MarketSystem drains) — but only in inline comments. A reorder compiles fine and breaks silently. Turn the convention into structure + a dev-mode lint. **Behavior-preserving refactor** — registration order must not change.

## Read first

- [corpus/wiki/architecture.md](../../../wiki/architecture.md) — scheduler + message-bus sections.
- The inline comment blocks in [sim-bootstrap.ts](../../../../packages/sim-core/src/sim-bootstrap.ts) (~lines 230–340) — they ARE the spec for which stage each system belongs to.
- [packages/engine/src/sim/scheduler.ts](../../../../packages/engine/src/sim/scheduler.ts) (trivial today: `add(system)` list) and [message-bus.ts](../../../../packages/engine/src/sim/message-bus.ts).

## Current state (verified against code 2026-06-10)

- `Scheduler` is a flat ordered list; `System` has only `name` + `run(ctx)`.
- The bootstrap's comment-documented bands are, in order: **CLOCK** (dayClock, shock), **DISPATCH** (InboxDispatchSystem, slate/notice refresh), **SNOOP** (encounter/trade/trust/rivalry/festival/harbor/eventFeed/tavern/runHistory — read-only over inboxes), **PERCEIVE** (PerceiveSystem clears inboxes), **GROW** (crop/tile/bubble/harvest/livestock/orchard/plot-sense), **DELIBERATE** (DeliberateSystem, PlayerControlSystem, apSystem), **MOVE** (feature-collision, travel), **ACT/RESOLVE** (ActSystem, market, shopkeeper, auction, carpenter, …). Exact membership: read the comments, don't trust this list blindly.

## Tasks

- [ ] **1. Engine: stage labels.** Add `Scheduler.stage(name: string): this` that tags subsequent `add()` calls (or `add(system, {stage})`) — purely declarative metadata, no reordering logic. Expose `stages()` for tooling/tests. `@engine/core` stays generic: stage names are caller-defined strings.
- [ ] **2. Bootstrap adopts stages.** Re-express the existing registration sequence under named stages matching the comment bands. **Diff discipline:** the flattened system order must be byte-identical to today — add a unit test asserting the exact ordered system-name list.
- [ ] **3. Dev-mode bus instrumentation.** Behind an opt-in flag (`scheduler.enableStageAudit(bus)` or similar): wrap `MessageBus.send`/inbox reads to record `(stage, ontology, read|write)` per tick, and assert no ontology is **written and then read within the same stage** (the cross-stage handoff rule that the SNOOP→PERCEIVE ordering protects). Throw with a message naming both systems. Enabled in tests and `npm run dev`; compiled out / off for headless perf runs.
- [ ] **4. Regression test for the known rule:** a test that deliberately registers a reader before its writer's stage boundary and asserts the audit throws (proves the lint can catch the "EventFeed after PerceiveSystem" class of bug).
- [ ] **5. Prove behavior preservation.** `npm run typecheck` + `npm run test`. Then a **fast multi-seed diff** (3 seeds × 3 days, `TICKS_PER_DAY=20`, `EXPORT=json`) against pre-change output — byte-identical required. ⚠️ **Ask the user before running any determinism/sim check** (constrained hardware — keep runs at the small fast-diff size, never the full 100-day check).

## Acceptance

- Order-assertion unit test pins today's exact system order; stage audit throws on a synthetic same-stage write→read; fast 3-seed diff byte-identical.
- The big comment blocks in bootstrap shrink to one line per stage (the stage name now carries the intent).

## Risks / notes

- The audit must observe *reads* — if inbox consumption doesn't flow through a bus API today (systems may read `entity.inbox.messages` directly), scope the audit to what's observable cheaply (bus `send` + `flush` + a tagged `markRead(stage)` helper adopted by the snoop band) rather than building a proxy over entity state. Partial coverage that catches the real rule beats a perfect design that never ships.
- Engine-never-imports-game holds: ontology strings stay opaque to the engine.
