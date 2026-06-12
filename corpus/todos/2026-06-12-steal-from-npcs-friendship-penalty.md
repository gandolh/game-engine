---
title: Kick/steal from NPCs with friendship penalties and retaliation
created: 2026-06-12
status: open
tags: [sim, agents, interaction, combat]
depends_on: [foundation-combat-subsystem]
---

# Kick/steal from NPCs with friendship penalties and retaliation

Attack an NPC; when you win, loot their inventory. Witnesses lose friendship with
you; once friendship drops low enough they attack you on sight.

## Decisions (grilled 2026-06-12)

**Rides on the [combat foundation](2026-06-12-00-foundation-combat-subsystem.md)**
(this is the "street fighting" — same HP/AP/bat-fists combat, but NO ring, NO
teleport, NO agreed gold stake). Friendship = the existing directional **`trust`**
component (`trust.byId`, 0.5 baseline — drives alliances/rivalry).

- **Who:** Pip can kick an NPC; an NPC can kick an NPC (symmetric). Both use the
  combat foundation in place.
- **Theft = post-KO looting.** Combat runs until one combatant's **HP hits 0**;
  the KO'd entity's **whole inventory becomes accessible** and the victor can take
  **everything** (losing a brawl can wipe you out — high stakes).
- **Bat** makes the attack stronger (higher per-swing damage) vs. bare hands.
- **Witness detection = region + bridge co-location.** Anyone on the **same island
  (region) or bridge** as the fight witnesses it. **NO line-of-sight/raycast** —
  region/bridge co-location only (simple, deterministic, matches how regions work).
- **Friendship penalty:** every witness reduces their `trust` toward the
  **initiator**. **Looting items adds a LARGER trust reduction** on top of the
  reduction for merely attacking.
- **Retaliation:** when a witness's (or victim's) trust toward the initiator drops
  below a threshold → that NPC gains an **attack-on-sight** intention (street fight
  via the combat foundation).
- **Recovery:** street-fight HP resets at **day start** only (no per-bout reset, no
  eating).

## Acceptance

- Pip and AI can kick an NPC; on KO the victor can take any/all items from the
  KO'd inventory.
- Bat increases attack damage over bare hands.
- Every same-region/bridge witness lowers trust toward the initiator; looting adds
  an extra trust hit.
- Below the trust threshold, NPCs initiate attack-on-sight against the initiator.
- Deterministic (3-day/3-seed fast diff byte-identical); no `Math.random` in sim
  paths.
