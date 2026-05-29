# Game Task 20 — Event Feed / Activity Ticker

## Context

The game's economy is rich — auctions, peer seed trades, market buys/sells, weather shocks, crop losses — but most of it is invisible. A viewer sees farmers walk around and numbers change, but the *story* (who traded with whom, who won the auction, who got wiped out by drought) never surfaces. The message bus already carries every one of these as a typed message (`performative` + `ontology` + body; see [architecture.md](../../../wiki/architecture.md)). A subscriber that formats notable messages into a scrolling feed turns invisible economics into a narrative.

This is the highest narrative-payoff brief: it's why you watch.

## Goal

1. **Event feed panel**: a scrolling DOM panel (newest at top, capped at ~30 lines) showing notable moments, e.g.:
   - `Day 7 — Hannah bought 3 radish from Otto (24g)`
   - `Day 12 — Drought! Atticus lost a wheat crop`
   - `Day 12 — Auction won by Cora at 45g`
   - `Day 20 — Otto sold 5 wheat to the shop (70g)`
2. **Source the events**: a system or render-loop subscriber that reads the relevant ontologies off the bus / inboxes and formats them. Prefer a read-only snoop (like `TrustSystem` and `MeetIndicatorSystem` already do) so it doesn't perturb sim state.
3. **Deterministic ordering**: events for a given tick must format in a stable order (sort by tick, then by a stable key) so a replay produces the identical feed.

## Files in scope

- `packages/farm-valley/src/systems/event-feed.ts` — NEW: a read-only system (or a collector invoked from the loop) that snoops the bus/inboxes for notable ontologies (`ONT_MARKET.TRADE_COMPLETED`, `ONT_SHOP.AUCTION_RESULT`, encounter ACCEPT, weather shocks, crop-loss events) and produces a deterministic, capped list of formatted strings with their day/tick.
- `packages/farm-valley/src/systems/event-feed.test.ts` — NEW: feed captures a trade and an auction result; ordering is deterministic; list is capped.
- `packages/farm-valley/src/ui/event-feed-panel.ts` — NEW DOM panel following the `ui/leaderboard.ts` pattern; `update(entries)` renders newest-first, capped.
- `packages/farm-valley/src/ui/event-feed-panel.test.ts` — NEW: renders entries, respects the cap.
- `packages/farm-valley/src/ui/index.ts` — export the panel.
- `packages/farm-valley/src/sim-bootstrap.ts` — register the event-feed system in the scheduler (read-only; place it where it can observe messages before they're cleared, like `TrustSystem`). Expose its accessor on `BootedSim` (mirror how `meetIndicators` is exposed).
- `packages/farm-valley/src/main.ts` — construct the panel; call `update(...)` from `onRender`.

## Files you must NOT touch

- `agents/**` — events are *observed*, not produced by changing agent logic.
- `world/**`, `world-setup.ts`, `components.ts`.
- `protocols/**` — read existing ontologies; do not add new ones for this.
- `render-systems.ts`, `screens/**`.
- Engine source.

## Read-only / determinism guarantee

The event-feed system must be a passive snoop — it may read inboxes and the bus but must NOT consume/mutate messages other systems depend on, and must NOT add bus traffic. Follow the `TrustSystem` precedent (which carefully snoops before `PerceiveSystem` clears inboxes). Formatting must be a pure function of sim state so replays match.

## Acceptance criteria

- `npm run typecheck -w farm-valley` passes
- `npm run test -w farm-valley` passes (event-feed system + panel tests added)
- `npm run dev`: a feed panel shows a live, readable stream of trades / auction results / weather events as the run progresses; same seed produces the same feed
- No `.js` import suffixes; no new runtime deps

## Workflow

You're the sonnet executor. Read this brief, then `TrustSystem` and `MeetIndicatorSystem` (for the read-only snoop pattern + how accessors are exposed on `BootedSim`), `sim-bootstrap.ts`, and one `ui/*.ts` panel. Implement. Run typecheck + tests before reporting done. Report files changed, test counts, and anything surprising. Do not commit — orchestrator handles that.
