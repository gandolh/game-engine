---
summary: What Hollow is (generational social-emergence sim on the shared engine), its M1 architecture (needs → communities → lifecycle/genetics → social verbs → headless research CLI), the M1 exit-bar results, and the load-bearing decisions + known limitations.
updated: 2026-07-20
---

# Hollow — overview

Hollow is the **third game** on the shared TypeScript ECS engine (`@engine/*`), alongside Farm
Valley and Citadel. It is a **generational social-emergence sim / research instrument**: a town of
villager agents that have needs, gather from scarce resources, build trust, coalesce into emergent
communities, pair-bond, reproduce with **heritable genomes**, choose **cooperative and antagonistic
social moves**, and die — over many generations, deterministically, headless. The point is to
*study* what emerges (dynasties, cooperation-vs-sabotage divergence, community rise/fall) from
seeded initial conditions, not to hand-author a story.

Built on branch **`hollow`** (local, unpushed) via `plan-split-dispatch` (opus controller, Sonnet
executors). Milestone **M1 is complete** — see the exit-bar results below.

## Packages
- **`@hollow/sim-core`** — the transport-agnostic, deterministic sim (systems, agents, world,
  economy, community, family, lineage, social protocols). Render-free.
- **`@hollow/client`** — browser client (skeleton; the M2 WebGPU 3D renderer is queued as hollow-08+).
- **`@tool/hollow-sim`** — the headless research CLI (hollow-07): drives `bootstrapHollowSim` on the
  main thread, samples metrics, captures the event chronicle, exports for offline study.

Layering obeys the monorepo rule: `@engine/core` → `@hollow/sim-core` → `@hollow/client` /
`@tool/hollow-sim`. The engine never imports a game; Hollow imports only `@engine/*`. hollow-02
promoted the generic agent kernel (needs, deliberation registry, relationship ledger, CNP
`OfferLedger`) up into `@engine/core/agent` so all three games share it.

## The tick (scheduler order)
`bootstrapHollowSim()` registers systems in this deliberate order (each has an inline data-dep
rationale in [sim-bootstrap.ts](../../games/hollow/sim-core/src/sim-bootstrap.ts)):

**PERCEIVE** (+social witness fan-out) → **DELIBERATE** → **ACT** (+social verbs) → **TRUST-ACCRUAL**
→ **COMMUNITY** → **BELONGING** → **PAIRBOND** → **REPRODUCTION** → **LIFECYCLE** → **NEEDS-DECAY**
→ **RESOURCE-REGEN**.

Determinism is load-bearing: all randomness flows through the seeded `Rng` via named `fork(label)`
(no `Math.random`/`Date.now`); a tick's output depends solely on the tick count. The social
deliberation layer is intentionally **rng-free** (pure genome/state scoring).

## M1 systems (what emerges from what)
- **hollow-03 needs / economy / scarcity** — food/rest/wealth/safety/belonging needs decay; agents
  travel to spatial resource nodes (finite stock + regen) to harvest+consume. A starvation signal
  (`beliefs.data.starving`) is the scarcity → population-regulation hook.
- **hollow-04 relationships / emergent communities** — a directed trust `RelationshipLedger`
  accrues from proximity/shared activity; a periodic detection pass crystallizes/grows/leaves/
  splits/merges/dissolves communities; `communityId` couples to the `belonging` need.
- **hollow-05 lifecycle / pair-bonding / genetics** — agents age (child→adult→elder), pair-bond into
  households, reproduce with **crossover+mutation genomes** (behavior genes + aptitude + appearance),
  and die (old age / starvation / a violence seam). A permanent `LineageRegistry` keeps ancestry
  queryable after ECS despawn.
- **hollow-06 social verbs** — 9 verbs with real effects (gift/share/help_labor/teach/trade,
  steal/sabotage/rumor/attack) + a lived `Skills` level; villagers **choose** among them via a
  deterministic, genome-gated scorer (greed→steal, aggression→sabotage/attack, loyalty→gift/share,
  sociability→help, curiosity→teach). Survival always outranks social choice.
- **hollow-07 headless research CLI** — `@tool/hollow-sim` exports `metrics.csv` (per-year
  time-series), `events.jsonl` (the chronicle), `lineage.json` (ancestry). `npm run sim:hollow`.

## Load-bearing decisions
- **Density-dependent birth brake (the population stabilizer).** Food scarcity alone cannot bound
  the population at test timescales: the per-partner food-security birth gate is *bimodal* (the AI
  keeps everyone fed until food suddenly crashes) and pairbonding is a *positive* feedback, so the
  raw system is **bistable** (explode or go extinct by seed — confirmed over 5 sweeps). The fix
  (`BIRTH_PERCAPITA_FOOD_TARGET`, family/constants.ts) scales effective birth chance by per-capita
  food supply → a smooth logistic brake → a self-limiting, seed-robust plateau. This is what makes
  "scarcity-stable population across seeds" real.
- **Compressed research profile.** Production lifecycle constants are slow (adult window 8000 ticks)
  — far too slow to show ≥5 generations headless. `@tool/hollow-sim` defaults to a controller-
  validated **compressed-but-stable** profile (adultElder 200, gestation 10, birth brake target 6,
  food 120/tick) so a ~1200-tick run shows multi-generational, bounded, deterministic emergence.
- **Genome lives on a Hollow component, not the engine `Personality`** (which stays generic
  `{kind}`) — the engine never learns game specifics.

## M1 EXIT-BAR — PASSED (2026-07-20)
Judged by reading real exported runs (`@tool/hollow-sim`, compressed profile, 12 "years" =
1200 ticks), not test-green alone:

| criterion | seed 7 | seed 101 |
|---|---|---|
| population (stable band) | 24→57→37, bounded | 24→…→56, bounded |
| communities formed / dissolved | 10 / 6 (+3 merged) | 6 / 2 |
| lineage records (founders + descendants) | 206 (24+182) | 250 (24+226) |
| generations of descent | 16 | (deep) |
| cooperative events | 5273 | 1833 |
| antagonistic events | **1407 (~27%)** | **140 (~7%)** |
| violent deaths | 5 | 0 |

- **Communities form AND dissolve/split/merge** — yes (both seeds). ✓
- **Cooperation-vs-sabotage differs meaningfully between seeds** — yes: seed 7 is ~4× the
  antagonism share of seed 101 (~27% vs ~7%). ✓
- **≥3-generation lineages with heritable trait drift** — yes: 16 generations of descent; mean
  behavior genes drift over the run (e.g. seed 7 mean sociability 0.53→0.62, a plausible selection
  signal). ✓
- **Population held in a stable band by the scarcity + density brake** — yes: bounded oscillation
  (24–57), no explosion, no extinction. ✓
- **Deterministic** — `CHECK_DETERMINISM` passes byte-identical on a small run. ✓
- **Emergence narrative visible in the data** — seed 7's metrics show a turbulent founding (high
  antagonism years 1–3: ~400 antag/window) settling into a cooperative equilibrium (antag →~0) as
  trust rises and communities consolidate. ✓

## Known limitations (carried forward)
- **`steal` and `trade` are dormant (count 0) in natural play.** A fed, cooperative town has no
  needy+greedy+low-trust actor next to a stealable holder, and solo agents' inventories net to ~0
  (harvest self-consumes), so there is little to steal or trade. The mechanics are correct and
  unit-tested (hollow-06a); they will become emergent under a **persistent-inventory / scarcer
  economy** (a future economy-deepening brief). Not an M1 blocker — cooperation-vs-sabotage
  divergence is delivered by gift/share/help/sabotage/rumor.
- **`attack` is intentionally rare** (aggression gate 0.99) to keep the population stable under
  random genomes; it does fire (0–39/seed) and feeds the violence-death seam.
- **`betray` and `exclude`** verbs from the hollow-06 spec are deferred (documented seams).
- **Farm behavior-preservation for hollow-02** was gated on unit tests only (the byte-identity
  `EXPORT=json` diff was skipped per user); residual risk lives in the encounter-trade `OfferLedger`
  swap, fallback = revert that file to its Map/Set form.

## Where things live
- Sim: [games/hollow/sim-core/src/](../../games/hollow/sim-core/src/) — `sim-bootstrap.ts`,
  `agents/` (villager + social-verbs), `community/`, `family/` (lifecycle/pairbond/reproduction +
  registry + genetics + constants), `lineage/`, `social/` (act + witness + constants), `protocols/`.
- Tool: [tools/hollow-sim/src/](../../tools/hollow-sim/src/) — `env.ts` (research profile),
  `metrics.ts`, `chronicle.ts`, `export.ts`, `run-core.ts`, `determinism.ts`.
- Live build tracker / handoffs: [../todos/2026-07-17-hollow-BUILD-STATE.md](../todos/2026-07-17-hollow-BUILD-STATE.md).

## Next (M2+)
hollow-08 WebGPU 3D renderer, hollow-09 cozy-town scene, hollow-10 client chronicle/dashboard,
hollow-11 authoring/perturbation, hollow-12 governance/politics, hollow-13 LLM rationalizer seam —
all specs written and queued in `corpus/todos/`. The economy deepening that activates steal/trade
should slot in before or alongside these.
