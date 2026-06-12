---
title: Randomize agent BDI models so each agent is unique
created: 2026-06-12
status: open
tags: [sim, agents, bdi]
---

# Randomize agent BDI models so each agent is unique

Parameterize the BDI model per-agent so same-`kind` farmers diverge, instead of
every farmer of a personality kind behaving identically. Deterministic.

## Decisions (grilled 2026-06-12)

- **Injection point found.** Each farmer already spawns with per-agent params in
  [sim-bootstrap.ts](../../packages/sim-core/src/sim-bootstrap.ts): `personality`,
  `startGold`, `riskProfile`, `minGoldReserve`, `startSeeds`. The 5 named farmers
  are hand-tuned; the 16 procedural farms get defaults — so same-kind farmers are
  identical today. This is the seam.
- **(A) Sample variance ONCE at spawn, baked into components.** Fork
  `rng.fork('agent:'+id+':bdi')`, draw per-agent values, store on the agent.
  Deterministic, cheap, stable across the run. (NOT re-derived per tick — that
  thrashes intentions.)
- **Jitter SCALAR knobs only:**
  - `minGoldReserve` — ± spread around the kind's base.
  - a continuous `riskTolerance` — augment the 3-level `riskProfile` with a
    per-agent numeric.
  - bean/crop valuation weights ([bean-valuation.ts](../../packages/sim-core/src/agents/bean-valuation.ts)).
- **Do NOT reorder the intention queue.** Priority-order variance is where
  determinism bugs + pathological behavior hide. Same decision *structure*, shifted
  *thresholds*.
- All randomization through the seeded `Rng` — never `Math.random`/`Date.now`
  (see [project_mining_random_determinism]).

## Acceptance (scope = spike + proposal, per original ask)

- Spawn-time baked jitter lands for 2–3 scalar knobs (reserve / riskTolerance /
  valuation weights).
- Same-kind agents observably diverge in a real run.
- Sim stays deterministic: fast 3-day/3-seed `EXPORT=json` diff at default
  ticksPerDay is byte-identical.
