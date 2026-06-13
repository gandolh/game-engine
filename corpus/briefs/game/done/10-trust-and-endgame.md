# Game Task 10 — Trust Updates + Aggressive End-of-Sim Liquidation

**Status:** Done
> Condensed 2026-06-13 — original spec in git history.

Two fixes: trust scores were static at 0.5 despite personalities already reading them; and aggressive's end-of-sim liquidation had been deferred pending an end-of-sim signal.

## What shipped

- `packages/farm-valley/src/systems/trust.ts` (new) — subscribes to relevant ontologies and applies trust deltas: OFFER_SEED accepted → +0.05 toward peer (both sides); OFFER_SEED declined → -0.05; CNP broken commitment → -0.10; successful market trade → +0.05 toward seller. Values clamped `[0, 1]` via `farmer.trust.byId.set(peerId, newValue)`.
- `packages/farm-valley/src/systems/day-clock.ts` — publishes `daysRemaining` (`maxDays - currentDay`) in the `ONT_DAY_CLOCK.DAY_START` body; accepts `maxDays` via constructor threaded from `bootstrapSim` options.
- `packages/farm-valley/src/sim-bootstrap.ts` + `main.ts` — `maxDays` wired through to `DayClockSystem`.
- `packages/farm-valley/src/systems/perceive.ts` — surfaces `daysRemaining` into `farmer.beliefs.data.daysRemaining`.
- `packages/farm-valley/src/agents/aggressive.ts` — when `beliefs.data.daysRemaining <= 2`, enqueues `sell-shopkeeper` intents for all crops in inventory; skips planting/market actions.
- Tests: `trust.test.ts` (OFFER_SEED → ACCEPT exchange updates both farmers' trust maps), `aggressive.test.ts` (daysRemaining = 1 + crops → sell-shopkeeper intents), `day-clock.test.ts`.
