---
title: Ring box where farmers fight to reduce rivalry and win gold
created: 2026-06-12
status: open
tags: [sim, agents, economy, combat]
depends_on: [foundation-combat-subsystem, foundation-relationship-axis, foundation-grow-grid-to-240, foundation-theme-decor-table]
status: done
---

> **✅ DONE 2026-06-13** (shipped with the combat subsystem). Dedicated ring island
> (region `ring`, `boxing` theme décor, bridged to village); CHALLENGE/ACCEPT +
> teleport; tick-by-tick HP bout → KO or AP-out; fixed 10g loser→winner; mutual-trust
> bond (de-escalation via the relationship axis, not a rivalry decrement); HP reset to
> full at bout end, AP spent stays spent. See
> [combat foundation](2026-06-12-00-foundation-combat-subsystem.md) + log.md.

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
- **Dedicated ring island** (grilled 2026-06-12) — a new small landmark near the
  central cluster with a `ring` theme (ropes/posts/crowd-stand décor), added as a
  grow-grid leaf + bridge (rides on
  [grow-grid](2026-06-12-00-foundation-grow-grid-to-240.md) +
  [theme table](2026-06-12-00-foundation-theme-decor-table.md)). Combatants
  **teleport in** so it needn't be on anyone's route, but a distinct island makes
  the feature legible to the viewer. Any `solid` borders must pass
  [solid-connectivity.test.ts](../../packages/sim-core/src/world/solid-connectivity.test.ts).
- **Outcome:** tick-by-tick HP combat; first to 0 HP loses (KO, not death).
- **Stakes:** **fixed 10g** transferred loser→winner.
- **Relationship effect:** a sanctioned bout is a **release valve** → **raises
  MUTUAL trust** between the two combatants (via the
  [relationship axis](2026-06-12-00-foundation-relationship-axis.md) —
  `applyTrustDelta` both ways). This REPLACES the original "reduce rivalry" framing:
  the old rivalry accumulator was monotonic-up with no decrement path; rivalry is
  now just the low end of trust, so de-escalation = trust up. AI rivals are drawn to
  the ring because they're rivals (low mutual trust); winning/bonding pulls them back
  toward neutral.
- **Reset:** after the bout, reset **HP to full**; **AP spent swinging stays spent**
  (even a sanctioned match costs productive AP).

## Acceptance

- A ring/arena feature exists that Pip and AI farmers can use (via the
  challenge/accept handshake + teleport).
- A fight resolves tick-by-tick to a KO; winner +10g, loser −10g.
- Mutual trust between the two combatants rises after the fight (de-escalation),
  via the relationship axis — NOT a rivalry-accumulator decrement.
- HP resets to full post-bout; AP cost stands; deterministic (3-day/3-seed fast
  diff byte-identical).
