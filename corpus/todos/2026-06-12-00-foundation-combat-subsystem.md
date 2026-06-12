---
title: "FOUNDATION #0 (sim) — Watchable combat subsystem (HP + AP swings)"
created: 2026-06-12
status: open
tags: [sim, agents, combat, foundation]
blocks: [ring-box-rivalry-fights, steal-from-npcs-friendship-penalty]
---

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

## Handshake + teleport (initiation)

Mirror the existing encounter handshake
([protocols/encounter.ts](../../packages/sim-core/src/protocols/encounter.ts):
`MEET`/`OFFER`/`ACCEPT`/`DECLINE` over the message bus, FIPA-ACL style):
new `CHALLENGE` / `ACCEPT` / `DECLINE`. Pip OR an AI can initiate. On accept,
both are **teleported to the ring** at the agreed period (ring-box only; street
fights happen in place).

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
