# hollow-05 — lifecycle, pair-bonding & genetics

status: todo
milestone: M1
depends-on: hollow-03 (needs/economy), hollow-04 (relationships)
created: 2026-07-17

## Goal
Make the town multi-generational: agents are born, age, pair-bond, reproduce with **heritable
traits**, and die. Dynasties emerge. This is what makes the run open-ended and the study
generational.

## Scope
### Lifecycle
- **Age + stages:** `child → adult → elder`. Age advances in sim-time; stage gates capability
  (children don't work full jobs / can't pair-bond; elders decline). Compressed lifespan
  (~60–80 sim-years; tune so a lifespan ≈ ~an hour of watching at default speed).
- **Death:** three causes —
  - old age (hazard rising past the elder threshold),
  - starvation (consumes hollow-03's food-zero signal),
  - violence (consumes a resolved antagonistic-attack signal from hollow-06).
  On death: remove from the ECS world, run **inheritance** (owned goods → co-resident kin →
  community → commons), record the agent permanently in the **lineage record** (id, genome,
  parents, birth/death tick, cause, community history) so the ECS stays bounded but ancestry is
  queryable.

### Pair-bonding & reproduction
- **Bond trigger:** both adults, not close kin, mutual trust above threshold, trait
  compatibility above threshold, proximity/shared activity. One partner at a time (v1). Forms a
  **household** (co-residence, shared stockpile subset).
- **Reproduction:** a bonded co-habiting pair has a per-window birth chance **gated by food
  security** (no births during famine — ties reproduction to scarcity). Fixed gestation delay,
  then a child agent spawns into the household.

### Genetics (the GA)
- **Genome = 3 gene groups** on `Personality`:
  - `behavior[]` — BDI weights (sociability, risk, aggression, loyalty, greed, industriousness,
    curiosity, …), floats in fixed ranges.
  - `aptitude[]` — per-skill affinity = learning rate + cap (skill *level* is lived state).
  - `appearance` — height, build, skin tone, hair tone (tones = Hollow palette roles), so
    children visibly resemble parents (consumed by M2 mesh).
- **Inheritance:** per-gene crossover from both parents (blend for continuous genes, pick-one
  for categorical like tone) + **small mutation** (bounded gaussian-ish step / rare
  role-flip), all via a named `Rng.fork("genetics")`.
- `Beliefs`/`Desires`/`Intentions` are **fresh at birth** (lived experience, not inherited).

## Approach
- Seed the initial population with authored/randomized genomes (persona seeds — the user's
  authoring input; full authoring UI is M3, but the seed format lands here).
- Keep aging/reproduction/genetics constants in one tunable block; document the lifespan↔
  tick-scale derivation.
- Determinism is critical here — every genetic draw, birth roll, and death hazard through named
  forks; verify at BOTH default and low tick scale.

## Acceptance / gates
- Headless run over ≥5 generations: births, deaths (all three causes observed across seeds),
  and a **lineage record** with ≥3 generations of descent.
- **Heritability check:** children's genes are demonstrably a crossover+mutation of parents
  (test asserts child gene ∈ neighborhood of parent midpoint ± mutation bound); population-level
  trait drift is visible over generations.
- Population stays in a stable band via the scarcity/food-gated reproduction coupling (no
  explosion, no instant extinction) across seeds.
- Deterministic (byte-identical re-run).
- Kin-avoidance + one-partner + stage-gating all enforced (tests).
