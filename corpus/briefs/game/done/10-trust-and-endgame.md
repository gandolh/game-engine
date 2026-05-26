# Game Task 10 — Trust Updates + Aggressive End-of-Sim Liquidation

## Context

Two related polish items from [open-questions.md](../../wiki/open-questions.md):

1. **Trust scores** between farmers are static at 0.5. [hoarder.ts:146](../../../../packages/farm-valley/src/agents/hoarder.ts) and [opportunist.ts:117](../../../../packages/farm-valley/src/agents/opportunist.ts) read `farmer.trust?.byId.get(peerId)` for sorting (CNP bid priority, peer-buy priority). But no system writes to that map — it's all defaults.

2. **Aggressive end-game liquidation** was deferred in [Brief 01](../../briefs/game/done/01-personalities.md) because no end-of-sim signal existed at the time. Game now ends at day 100 (leaderboard). Aggressive should liquidate everything in the last 2 days.

User design calls this session:
- Trust deltas are moderate: **+0.05 on accept / +0.05 on successful trade, -0.05 on decline, -0.10 on broken commitment**. Clamp [0, 1].
- End-of-sim signal: **`DayClock` broadcasts `daysRemaining`** in its existing belief/message body. Personalities read `beliefs.daysRemaining <= 2`.

## Goal

### (a) Trust updates

Update `farmer.trust.byId` when peer-interaction events resolve:

- Peer ACCEPTed our OFFER_SEED → toward peer: `+0.05`
- Peer DECLINEd our OFFER_SEED → toward peer: `-0.05`
- We ACCEPTed peer's OFFER_SEED → toward peer: `+0.05` (mutual; both ACK seeing each other deal favorably)
- CNP broken commitment (winner ACCEPTed but didn't deliver — see `cnp-coordinator.ts`) → toward peer: `-0.10`
- Successful market trade (TRADE_COMPLETED via the market wall) → toward seller: `+0.05`

Bounds: clamp final value to `[0, 1]`. Use `farmer.trust.byId.set(peerId, newValue)`.

Trust updates happen wherever the resolving event is processed — likely a new `systems/trust.ts` that subscribes to relevant ontologies, or fold into existing systems (act/encounter) — pick one approach and justify in the plan.

### (b) Aggressive liquidation

- Add `daysRemaining` (integer, `maxDays - currentDay`) to whatever `DayClockSystem` already publishes per tick or per day. If DayClock publishes `ONT_DAY_CLOCK.DAY_START`, extend that body. If a separate broadcast is needed, define `ONT_DAY_CLOCK.DAYS_REMAINING` and emit per day.
- `DayClockSystem` needs to know `maxDays` — pass via constructor, threaded from `bootstrapSim`'s options, default to a config value (today it's `100` in [main.ts](../../../../packages/farm-valley/src/main.ts)).
- `PerceiveSystem` (or wherever beliefs are written): write `daysRemaining` into `farmer.beliefs.data.daysRemaining` so personalities can read it.
- Aggressive personality: when `beliefs.data.daysRemaining <= 2`, enqueue a `sell-shopkeeper` intent for every crop in inventory with `quantity = farmer.inventory.crops[crop]`. Skip planting / market actions for the day (or document the priority interaction). Existing AP handling stays.

## Files in scope

- `packages/farm-valley/src/components.ts` — if `Beliefs.data.daysRemaining` needs adding (additive)
- `packages/farm-valley/src/systems/day-clock.ts` — publish daysRemaining
- `packages/farm-valley/src/sim-bootstrap.ts` — pass maxDays to DayClockSystem
- `packages/farm-valley/src/main.ts` — wire CONFIG.maxDays through to bootstrapSim
- `packages/farm-valley/src/systems/perceive.ts` — surface daysRemaining into beliefs (if not already passing through)
- `packages/farm-valley/src/protocols/day-clock.ts` (if exists; else inline in protocols/simulation.ts wherever DAY_START body is defined) — extend body
- New `packages/farm-valley/src/systems/trust.ts` (or fold into existing) — apply trust deltas
- `packages/farm-valley/src/agents/aggressive.ts` — last-2-days liquidation branch
- Tests: trust.test.ts (or wherever you place trust logic), aggressive.test.ts, day-clock.test.ts

## Must NOT touch

- `packages/engine/**`
- `packages/farm-valley/src/systems/{travel,market,shopkeeper,encounter,act,finish-day,harvest,inbox-dispatch,weather,crop-growth,ap,shop-slate}.ts` — read-only references for understanding events
- `packages/farm-valley/src/agents/{conservative,hoarder,opportunist}.ts` — they ALREADY read trust; you're feeding them better data, not changing their logic
- `packages/farm-valley/src/agents/shop-slate.ts`
- `packages/farm-valley/src/protocols/{market,shop,encounter,travel}.ts`
- `world/**`, `world-setup.ts`

## Workflow

1. Read brief + relevant code (`day-clock.ts`, `cnp-coordinator.ts`, `aggressive.ts`, `components.ts`, the four personality files for how they read trust, `act.ts` for trade event processing).
2. Write a plan at `corpus/briefs/game/todo/10-trust-and-endgame-plan.md`.
3. Dispatch ONE sonnet subagent to execute. Give it plan + scope.
4. Verify typecheck + tests.
5. Report back.

## Acceptance criteria

- `npm run typecheck -w farm-valley` passes
- `npm run test -w farm-valley` passes
- Trust deltas test: simulate an OFFER_SEED → ACCEPT exchange and assert both farmers' trust map updated
- Aggressive liquidation test: with `daysRemaining = 1` and crops in inventory, the intent queue contains `sell-shopkeeper` intents covering all crops
- No `.js` import suffixes; no new deps
