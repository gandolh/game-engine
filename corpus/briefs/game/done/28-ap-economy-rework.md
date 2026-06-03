# Game Task 28 — AP Economy Rework (3c)

## Context

With the intra-day timeline (Brief 27), agents deliberate many times per day and **walking is AP-free**. The impact analysis (2026-06-03) flagged that today **free travel is the only throttle the AP pruner ever drops**, and the real per-day action cap is "deliberation runs once/day" — *not* AP. Once agents act many times across a long day, **AP must become the genuine per-day budget** or agents act unbounded.

Current state: `AP_COST` table at [systems/ap.ts](../../../../packages/farm-valley/src/systems/ap.ts):16-29, max AP defined in [world-setup.ts](../../../../packages/farm-valley/src/world/world-setup.ts):48. Latent bug: `sell-from-wall` is in `isSellIntent` (`ap.ts:40`) but absent from `AP_COST`, so it costs 0 (the `apCostOf` fallthrough returns 0 for unknown kinds).

## Goal

A meaningful AP economy: a large, growing daily budget gated by sleep, with a costed action table where walking is free (time-throttled instead), trades are cheaper between friends, and bidding is accessible.

## Design decisions (locked via grilling 2026-06-03)

### Budget model — growing ceiling + sleep gate (both apply)

- **`maxAP(day) = 100 + 2 × (day − 1)`** — starts at 100 on day 1, grows +2 each day (day 100 = 298).
- **Sleep gates the wake-up amount.** You wake with the full `maxAP(day)` ceiling **only if you slept at home** last night. If caught **away at nightfall (unrested** — signal from Brief 27), you start with **half** that ceiling: `floor(maxAP(day) / 2)`.
- Refill is therefore on **sleep**, not on the day boundary — move it out of `FinishDaySystem` into the sleep handler (coordinate with Brief 27).

### AP cost table

| Action | Cost | Notes |
|---|---|---|
| travel (walk) | **0** | Free in AP; costs **time/daylight** (Brief 27) — long trips eat the work window. |
| plant a crop | **1** | |
| water a crop | **1** | The watering action itself; the irrigation/death mechanic is Brief 29. |
| sell (per transaction) | **3** | Per transaction, not per unit. |
| trade / transaction init | **3** base | **Friends get a tiered discount** (below). |
| gift (any item) | **1** | Each client has a **preferred-gift list** (below). |
| auction participate (entry) | **2** | One-time entry to contest an auction. |
| auction bid | **0** | The bid itself is free once you've paid entry. |
| `sell-from-wall` | **3** | **Bug fix** — add it to `AP_COST` (currently silently 0). |

### Friend discount — tiered (on trade/transaction init)

Cost scales with the initiator's trust toward the counterparty (`farmer.trust.byId`, baseline 0.5):

- trust ≥ 0.7 → **1 AP**
- trust ≥ 0.5 → **2 AP**
- below 0.5 → **3 AP** (base)

Tiered (not linear/binary) because it's the clearest to display in the "why" panel ("trade Hannah: 1 AP (friend)") and to balance.

### Preferred-gift lists (new data)

- Each farmer (client) has a **list of preferred gift items**. Gifting a preferred item yields a larger trust boost than a non-preferred one. (The golden bean from Brief 24 is universally high-value; ordinary items' value depends on the receiver's preferences.)
- This is a per-personality (or per-entity) data table read by the gift handshake (Brief 24's `OFFER_BEAN`, generalized to `OFFER_GIFT` for arbitrary items, or a parallel hook).

## Files in scope

- `systems/ap.ts` — new `AP_COST` table; the `sell-from-wall` fix; the friend-discount lookup for trade-init; `maxAP(day)` ceiling; half-AP-if-unrested wake-up logic.
- `world/world-setup.ts` — initial AP = `maxAP(1)` = 100.
- `systems/finish-day.ts` / sleep handler — move refill onto sleep (with Brief 27).
- `components.ts` — preferred-gift list data on the farmer; the growing-ceiling + unrested fields if not already added by Brief 27.
- `agents/*.ts` — deliberation must budget against the new costs; the "why" panel reasons should mention friend discounts and gift preferences.
- Matching `*.test.ts` — ceiling grows +2/day; unrested halves it; tiered discount at each trust tier; free travel; `sell-from-wall` now costs 3; gift preference affects trust delta.

## Files you must NOT touch

- The macro-economy day cadences (Brief 27's denomination guard).
- Engine source.

## Dependencies

- **Requires Brief 27** (intra-day timeline + unrested signal + sleep refill point). If 27 is not merged, this brief cannot wire sleep-gated refill — sequence it after 27.

## Acceptance

- A farmer's AP ceiling grows over the run; sleeping refills to the ceiling; being stranded halves the next day.
- Trades between trusted farmers visibly cost less AP.
- Free travel; `sell-from-wall` costs 3; gifting a preferred item moves trust more than a non-preferred one.
- `npm test` / `npm run typecheck` green; determinism harness MATCHes.
