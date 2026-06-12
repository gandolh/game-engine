---
title: Kick/steal from NPCs with friendship penalties and retaliation
created: 2026-06-12
status: open
tags: [sim, agents, interaction, combat]
depends_on: [foundation-combat-subsystem, foundation-relationship-axis]
---

# Kick/steal from NPCs with friendship penalties and retaliation

Attack an NPC; when you win, loot their inventory. Witnesses lose friendship with
you; once friendship drops low enough they attack you on sight.

## Decisions (grilled 2026-06-12)

**Rides on the [combat foundation](2026-06-12-00-foundation-combat-subsystem.md)**
(this is the "street fighting" — same HP/AP/bat-fists combat, but NO ring, NO
teleport, NO agreed gold stake). Friendship = the unified
[relationship axis](2026-06-12-00-foundation-relationship-axis.md) (the directional
`trust` field; rivalry is now its low end). Retaliation = a **one-sided grudge**:
when *a witness's* trust toward the initiator drops below the rival cutoff (<0.25),
that witness gains an attack-on-sight inclination — no mutual agreement needed.

- **Who:** Pip can kick an NPC; an NPC can kick an NPC (symmetric). Both use the
  combat foundation in place.
- **Theft = post-KO looting, goods-only, capped at 3.** Combat runs until one
  combatant's **HP hits 0**; the victor can then take up to **3 items** from the
  KO'd entity's inventory (e.g. 3 fish, or 3 seeds, or a mix). **Tools are NEVER
  lootable** (equipped / bound to owner) — so a mugging hurts but can't permanently
  remove a farmer from the economy (avoids the snowball/cripple risk flagged by
  [project_leader_runaway]). The cap keeps theft recoverable.
  - **"3 items" = 3 individual units total** (e.g. 3 fish, or 2 fish + 1 seed) —
    NOT 3 full stacks.
  - **Gold is NEVER stealable in a street fight.** Gold only moves via the ring's
    fixed 10g stake. Clean split: **ring = the gold game, street = goods theft.**
- **Bat** makes the attack stronger (higher per-swing damage) vs. bare hands.
- **Witness detection = region + bridge co-location.** Anyone on the **same island
  (region) or bridge** as the fight witnesses it. **NO line-of-sight/raycast** —
  region/bridge co-location only (simple, deterministic, matches how regions work).
- **Friendship penalty:** every witness reduces their `trust` toward the
  **initiator**. **Looting items adds a LARGER trust reduction** on top of the
  reduction for merely attacking.
- **AI attack motivation = RIVALRY-DRIVEN ONLY (v1).** An AI only street-attacks
  someone it is already a rival with (its trust toward them < 0.25 rival cutoff).
  Theft is the *spoils of a grudge*, not opportunistic predation — keeps the feature
  coherent and dodges the snowball/strongest-mugs-everyone risk
  ([project_leader_runaway]). **Pip can attack anyone** (player choice); AI cannot
  mug strangers/friends. (Opportunistic mugging is a possible tuned follow-up.)
- **Initiation = a chase, with flee (grilled 2026-06-12):**
  - When an AI commits to attack a rival, show a **hostile indicator** above its head
    (a hostile variant of the thought-bubble) and **begin pursuing** the rival.
  - The target **perceives the threat and may flee** (a new flee intention).
  - **~10-second pursuit window**, then the attacker **cancels the intention** if it
    couldn't reach the target's proximity. Reaching proximity → fight starts.
  - **DETERMINISM:** sim is deterministic on tick count (wall-clock is render pacing
    only) — implement the window as a **fixed tick count, NOT wall-clock seconds**.
    ticksPerDay differs (~1200 browser / ~20 headless); pick N ticks tuned to ~10s
    at viewing pace and document it.
- **Retaliation:** when a witness's (or victim's) trust toward the initiator drops
  below the rival cutoff → that NPC gains the same rivalry-driven chase-and-attack
  behavior, subject to the
  [combat governors](2026-06-12-00-foundation-combat-subsystem.md) (per-pair 2-day
  cooldown, daily cap, once-per-cooldown).
- **Recovery:** street-fight HP resets at **day start** only (no per-bout reset, no
  eating).

## Acceptance

- Pip and AI can kick an NPC; AI only attacks rivals (Pip anyone). On KO the victor
  takes up to 3 goods units (tools excluded, no gold).
- An attacking AI shows a hostile indicator + chases; the target can flee; the
  attacker gives up after the ~10s (tick-based) pursuit window if it can't close.
- Bat increases attack damage over bare hands.
- Every same-region/bridge witness lowers trust toward the initiator; looting adds
  an extra trust hit.
- Below the trust threshold, NPCs initiate attack-on-sight against the initiator.
- Deterministic (3-day/3-seed fast diff byte-identical); no `Math.random` in sim
  paths.
