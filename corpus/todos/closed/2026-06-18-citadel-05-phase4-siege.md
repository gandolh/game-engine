---
title: "Citadel Phase 4 — threat / siege layer"
created: 2026-06-18
status: open
tags: [citadel, phase4, defense, siege, walls]
---

# Phase 4 — Threat / siege layer

Third pressure, completing the layered vision. Periodic raids force defensive planning;
walls and gates reshape attacker routes; the clash resolves by a deterministic strength calc.

## Scope
- **Materials extension + refining chains:** Quarry → **stone** (terrain-locked on a stone deposit); **Sawmill** (wood→**planks**); **Smith** (ore→**tools**, ore from a mine on an ore node). Walls/towers/keep cost stone+planks; garrison needs tools (introduces the materials sinks that justify stone/ore gathering — completes the shallow-chain set from APR #23).
- **Defensive structures:**
  - **Wall** — 1-wide impassable segments (drag-paint, like roads); reshape the walkable grid for raiders.
  - **Gate** — passable to your villagers, a chokepoint for raiders.
  - **Tower** / **Garrison** — contribute defensive strength; garrison houses soldiers (a job/population sink).
  - **Keep** — the heart; if sacked → hard game-over.
- **Raiders:** spawn at map edge on a periodic/escalating schedule (seeded); **path** toward the keep/citadel using the WASM pathfinder over the wall-modified grid; gates/walls force detours and chokepoints.
- **Siege resolution (abstract):** when raiders reach defenses, resolve the clash by a **deterministic strength calc** (walls + towers + garrison strength + layout vs raider strength) — no RTS unit micro. Outcomes: repelled / partial damage (buildings/pop lost) / sacked.
- **Fail:** keep sacked → hard game-over (joins pop-0 from Phase 2).
- **HUD/feed:** threat level / next-raid indicator; defensive strength readout; siege results in the event feed.

## Decisions (grilled 2026-06-18)
- Spatial siege, abstract resolution — raiders path in, walls reshape routes, deterministic calc resolves; NO unit micro / RTS combat (APR #9).
- Quarry/stone + Sawmill(planks) + Smith(tools) land HERE — the remaining shallow refining chains, gated to when defense needs them (APR #15, #23).
- Quarry/mine terrain-locked on stone/ore nodes (APR #22).
- Walls = 1-wide segments, drag-painted (APR #5, #21); rebuild walkable grid (Phase-1 substrate).
- Raider spawn/pathing seeded + deterministic (APR #13).

## Done when
- Raids arrive on schedule and path to the citadel; walls/gates demonstrably reroute them.
- A well-defended layout repels raids; a poorly-defended one loses buildings/pop and can be sacked → game-over.
- Deterministic replay holds across full sieges; typecheck + palette guard pass; scoped siege/pathing tests green.

## Open tuning (resolve in-phase)
- Raid cadence/escalation curve; strength-calc formula weights; stone costs; garrison size vs pop.
