---
title: "Citadel Phase 3 — happiness + governance (decrees, trader)"
created: 2026-06-18
status: open
tags: [citadel, phase3, happiness, needs, decrees, trade]
---

# Phase 3 — Happiness + governance

Second of the three layered pressures, plus the player's ongoing-steering layer.
Population now has needs beyond food; unmet needs lower happiness, which throttles
immigration and eventually drives people out. Decrees and a barter trader give the
player decisions to make between building sprees.

## Scope
- **Needs** (start small): faith, safety, goods/market access. Each satisfied by proximity/connectivity to a service building.
- **Service buildings:** Chapel (faith), Market (goods — draws from global stockpile), and a safety source (placeholder until Phase 4 garrison exists; e.g. a watch post).
- **Happiness** aggregate per citadel (or per-house district): rises when needs met, falls when unmet.
- **Effects:** high happiness boosts immigration rate; low happiness slows it and, below a threshold, causes villagers to leave (feeds the existing pull-model out-migration from Phase 2).
- **HUD:** happiness indicator + per-need breakdown; event-feed entries for unrest/departures.

### Governance — decrees / policies
- A handful of toggleable **decrees**, each a few modifiers on existing systems: **rationing** (less bread consumed per head, −happiness), **conscription** (more garrison/labor to defense, fewer economic workers — meaningful once Phase 4 exists, but the toggle + worker-reallocation lands here), **tithe** (resource skim → unlocks something / placeholder benefit, −happiness), **work hours** (more output, −happiness). No coin (APR #28).
- UI: a decrees panel; active decrees surface their tradeoffs.

### Barter trader / Trading Post
- Optional **Trading Post** building enables a **periodic traveling trader** (seeded cadence): swap surplus goods for needed goods by **barter** (no currency, no fluctuating prices). The relief valve for surpluses/shortfalls.
- UI: trade panel when the caravan is present; event-feed announces arrivals.

## Decisions (grilled 2026-06-18)
- Happiness is the SECOND layer, after the food+materials MVP (APR #2, phasing).
- Reuses the Phase-2 pull-model: happiness modulates immigration/out-migration rather than a separate mechanic (APR #16).
- Market draws from the global stockpile established in Phase 2 (APR #18).
- **Lightweight decrees** — modifiers on existing systems, not a deep management sim (APR #27).
- **No coin economy; barter trader only** as surplus/shortfall relief (APR #28).

## Done when
- Building services raises happiness and accelerates growth; neglecting them stalls/reverses it.
- Needs are legible in the HUD; departures show in the event feed.
- Decrees toggle and visibly shift the modeled tradeoffs.
- A Trading Post + caravan lets the player barter surplus for shortfall goods.
- Deterministic replay holds (incl. seeded caravan cadence); typecheck + palette guard pass; scoped happiness/decree/trade tests green.

## Open tuning (resolve in-phase)
- Which exact needs ship in v1 of this layer; service radius vs road-distance; happiness thresholds; decree modifier magnitudes; caravan cadence + barter ratios.
