---
title: "Citadel Phase 4.5 — hazards (fire + disease)"
created: 2026-06-18
status: open
tags: [citadel, phase45, hazards, fire, disease, threat]
---

# Phase 4.5 — Hazards (fire + disease)

Two internal/environmental threats that test a different part of planning than walls do.
Where the siege layer rewards walls + chokepoints, hazards reward **spacing**, **wells**,
and **services** — they punish the dense optimal-packing a logistics player tends toward.
Sits after the siege layer (shares the "threat" pillar) but uses entirely separate mechanics.

## Scope

### Fire
- Ignition: small seeded chance per wooden building per day (raised by density, lowered by mitigation). A future hook: siege/raid can start fires.
- **Spread:** fire propagates to adjacent/close wooden buildings (uses tile proximity over the grid). Burning buildings stop functioning and can be destroyed.
- **Mitigation:** a **Well** / firefighting building in range; **spacing / firebreaks** (gaps, roads, stone buildings don't carry fire). Rewards deliberate layout over max packing.

### Disease
- Onset: seeded chance scaled by **crowding** (population per house / density) and **low happiness** (ties into Phase 3).
- **Spread:** through connected/crowded population; sick villagers work less / can die.
- **Mitigation:** a **Healer** building in range; sanitation (e.g. well access, lower crowding). Plays directly against the happiness layer.

### Surfacing
- HUD/event-feed: fire alerts, outbreak alerts, affected counts; visual marker on burning/sick buildings (placeholder tint pre-art).

## Decisions (grilled 2026-06-18)
- Fire + disease are the chosen threat-variety additions; full disaster suite (famine/structural collapse) explicitly NOT in scope (APR #25).
- Both are **spatial** threats that reward spacing/services — deliberately opposite of the wall-packing siege rewards.
- Disease couples to the Phase-3 happiness/crowding model; fire couples to building density + the Well.
- Seeded, deterministic (APR #13) — no `Math.random`.

## Done when
- A densely-packed wooden citadel suffers fire spread; spacing + wells demonstrably reduce it.
- A crowded, unhappy citadel suffers outbreaks; a healer + lower density demonstrably reduce them.
- Hazards surface clearly in HUD/event feed.
- Deterministic replay holds across fire/outbreak events; typecheck + palette guard pass; scoped hazard tests green.

## Open tuning (resolve in-phase)
- Ignition/onset rates; spread radius/probability; mitigation strengths; whether sieges start fires in v1.
