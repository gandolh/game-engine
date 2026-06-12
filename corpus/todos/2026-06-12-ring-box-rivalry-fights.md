---
title: Ring box where farmers fight to reduce rivalry and win gold
created: 2026-06-12
status: open
tags: [sim, agents, economy, combat]
depends_on: [foundation-combat-subsystem]
---

# Ring box where farmers fight to reduce rivalry and win gold

A ring/boxing arena where Pip or an AI can fight. Fighting reduces rivalry between
the two combatants; the winner wins gold, the loser loses gold.

## Decisions (grilled 2026-06-12)

**Rides on the [combat foundation](2026-06-12-00-foundation-combat-subsystem.md)**
(watchable tick-by-tick HP combat, AP-cost swings, bat/fists, challenge/accept +
teleport handshake). This todo = the ring feature + ring-specific stakes/effects.

- **Participants:** Pip OR an AI initiates a fight request; either can accept.
  AI-vs-AI driven by rivalry (a present/nearby high-rivalry peer is a natural
  challenge target — closes the loop with the existing rivalry system, which
  brief 59 made actually fire).
- **The ring is an interactive feature** on an island. On accept, both combatants
  are **teleported to the ring** at the agreed period. Any `solid` borders must
  pass [solid-connectivity.test.ts](../../packages/sim-core/src/world/solid-connectivity.test.ts)
  (no severed chokepoint / covered bridge mouth).
- **Outcome:** tick-by-tick HP combat; first to 0 HP loses (KO, not death).
- **Stakes:** **fixed 10g** transferred loser→winner.
- **Rivalry:** reduced between the two combatants after the bout (existing pairwise
  rivalry score, [rivalry/types.ts](../../packages/sim-core/src/systems/rivalry/types.ts)).
- **Reset:** after the bout, reset **HP to full**; **AP spent swinging stays spent**
  (even a sanctioned match costs productive AP).

## Acceptance

- A ring/arena feature exists that Pip and AI farmers can use (via the
  challenge/accept handshake + teleport).
- A fight resolves tick-by-tick to a KO; winner +10g, loser −10g.
- Rivalry between the two combatants is reduced after the fight.
- HP resets to full post-bout; AP cost stands; deterministic (3-day/3-seed fast
  diff byte-identical).
