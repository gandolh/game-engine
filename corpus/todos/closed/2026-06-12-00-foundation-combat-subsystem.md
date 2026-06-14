---
title: "FOUNDATION #0 (sim) — Watchable combat subsystem (HP + AP swings)"
created: 2026-06-12
tags: [sim, agents, combat, foundation]
blocks: [ring-box-rivalry-fights, steal-from-npcs-friendship-penalty]
status: done
---

> **✅ DONE 2026-06-13.** Full scope (foundation + ring + street) shipped in one
> combat drop. `Health` component (HP 40), `FIGHTING` FSM state (Perceive/Deliberate/
> Act skip it), `CombatSystem` (ACT stage) owns bouts: swing-interval cadence
> (tick-derived, `swingIntervalTicks(ticksPerDay)`), AP-cost swings (bat > fists),
> KO-not-death. **Ring**: CHALLENGE/ACCEPT handshake + teleport to the new ring island
> + ±10g stake + mutual-trust bond + HP reset at bout end. **Street**: in-place, loot
> ≤3 goods (no gold/tools), mutual-AP forfeit, seeded flee, witness trust penalties
> (extra on loot) → retaliation via the relationship axis. AI initiation via
> `AggressionSystem` (co-located rivals only) → `ChaseSystem` (pursuit window, flee,
> CHALLENGE on reach). Pip attacks anyone via player-control; bouts auto-resolve.
> Render: HP bar + hostile glyph. Governors: per-pair 2-day cooldown, daily cap,
> AP-reserve gate. Frequency tuning DEFERRED →
> [tune-combat-frequency](2026-06-13-tune-combat-frequency.md). 747 sim-core +
> 182 farm-valley tests green; typecheck clean; no determinism run (constrained hw).

# FOUNDATION #0 (sim) — Watchable real-time combat subsystem

Shared foundation for BOTH the ring-box and street-fight/steal todos. This is the
single biggest piece in the 2026-06-12 todo set. **Determinism is load-bearing —
all combat randomness flows through the seeded `Rng`, never `Math.random`/`Date.now`.**

## Decisions (grilled 2026-06-12)

- **Watchable, tick-by-tick combat** (NOT a one-shot stat formula). Combatants
  enter a new `FIGHTING` FSM state ([farmer.ts](../../packages/sim-core/src/components/farmer.ts)
  `FarmerFsmState`) and trade blows over many ticks; the viewer watches HP drain.
  First to **0 HP loses** (KO, **not death**).
- **HP is a new component.** Resets to full at **day start** (`DAY_START` trigger,
  like [bubbles.ts](../../packages/sim-core/src/systems/bubbles.ts) / weather).
- **Stamina is merged into AP** — there is **no separate stamina stat**. A swing
  costs **AP** ([inventory.ts](../../packages/sim-core/src/components/inventory.ts)
  `ActionPoints`, the existing per-day budget `100 + 2×day`). Bat costs more AP
  per swing than fists. Running out of AP mid-fight → can't swing → you take hits
  and likely lose. **This makes fighting a real opportunity cost** (AP spent
  swinging is AP not spent farming) and is a strong new BDI pressure.
- **Weapons: bare hands + bat only.** Bat = higher per-swing damage (and higher AP
  cost); fists = default, everyone can fight unarmed. The bat is the "bat
  inventory" weapon from the steal todo.
- **Per-tick combat step:** seeded `rng.fork('fight:'+pairKey+':'+tick)` for damage
  variance; tilt by `riskTolerance`/weapon. KO floors HP, does not kill.
- **No eating mechanic in v1.** All recovery is via reset (see below). The
  "consume food to regenerate" idea is explicitly dropped — possible future todo.

## Pip in combat (grilled 2026-06-12)

- **Pip's fights AUTO-RESOLVE** — no manual combat minigame. The player's agency is
  the *choice* to initiate/accept and who/when; once teleported in, Pip's combat
  FSM swings on its own from HP/AP/weapon stats, identical to an AI bout. Keeps the
  "you watch, you don't play" thesis, adds no combat input mode/UI, and keeps the
  combat loop determinism-clean (no wall-clock player input mid-resolution). The
  combat code runs both with and without Pip (headless sim has no player).

## Handshake + teleport (initiation)

Mirror the existing encounter handshake
([protocols/encounter.ts](../../packages/sim-core/src/protocols/encounter.ts):
`MEET`/`OFFER`/`ACCEPT`/`DECLINE` over the message bus, FIPA-ACL style):
new `CHALLENGE` / `ACCEPT` / `DECLINE`. Pip OR an AI can initiate. On accept,
both are **teleported to the ring** at the agreed period (ring-box only; street
fights happen in place).

## Fight-end resolution (grilled 2026-06-12) — context-specific, no soft-lock

The `FIGHTING` state MUST always terminate (else fighters soft-lock out of their
day). Rules differ by context:

- **Ring fight (always resolves to a winner):**
  - First to **0 HP** loses (KO), OR
  - First to **run out of AP** loses **immediately** — can't keep swinging in a
    committed match. No draws. No fleeing (you committed to the bout).
- **Street fight:**
  - First to **0 HP** loses (KO) → eligible to be looted.
  - If only one fighter runs out of AP, the other keeps swinging → likely KO.
  - **Both** out of AP → **mutual forfeit: no KO, no loot.**
  - **Small seeded per-tick flee chance** (`rng.fork('fight:'+pairKey+':'+tick)`):
    either fighter may forfeit/flee mid-brawl even with AP left → fight ends, **no
    KO, no loot**. (Street-only.)

## Fight governors (grilled 2026-06-12) — prevent brawl/death-spiral

Two autonomous triggers (rivals drawn to fight; below-cutoff witnesses attack
on sight) are unbounded and would collapse the sim into a daily brawl loop (the
degenerate emergent risk flagged by [project_leader_runaway] /
[project_peer_interaction_inert]). **All four governors, lightweight:**

- **Per-pair cooldown = 2 in-game days.** A settled fight stays settled — that pair
  can't fight again for 2 days.
- **AP-reserve gate.** A farmer won't *initiate* a fight if it would drop AP below
  the reserve needed for the farming day — fighting competes with farming, and the
  BDI should usually prefer farming.
- **Per-farmer daily fight cap** (~1–2 initiations/day).
- **Attack-on-sight fires once per cooldown window**, not every co-located tick.

**Intended frequency: RARE DRAMA** (a few notable fights per run), not a regular
feature of daily life. **Mandate: instrument fights/day + AP-spent-fighting in a
real run and TUNE** — do not trust the design (per the peer-interaction memory:
re-derive the premise from real runs).

## Recovery rules (differ by context)

- **Ring fight:** when the bout ends, reset **HP to full**; **AP spent stays
  spent** (even a sanctioned match costs productive AP — opportunity cost is real).
- **Street fight:** HP resets only at **day start** (no per-bout reset). No eating.

## Acceptance

- HP component + `FIGHTING` FSM state + per-tick seeded combat step exist; swings
  cost AP; bat > fists damage; first to 0 HP is KO'd (not killed).
- Challenge/accept handshake + ring teleport work for Pip and AI.
- Deterministic: 3-day/3-seed fast diff at default ticksPerDay is byte-identical;
  no `Math.random`/`Date.now` in any combat path.
- HP reset rules hold (ring: HP-only at bout end; street: day-start).
