# hollow-03 — needs, economy, and scarcity (the anchor)

status: todo
milestone: M1
depends-on: hollow-02
created: 2026-07-17

## Goal
Build the substrate that gives every decision weight: agents have depleting needs; the town has
scarce, spatially-located resources and a real economy; falling behind has consequences; and
**scarcity regulates population**. Nothing social is meaningful until this bites.

## Scope
- **Needs** (per-agent, on the promoted needs component): at least `food`, `rest`, `safety`,
  `wealth`, `belonging`. Each decays per tick at a genome-influenced rate. Low needs degrade
  ability (slower work, higher stress); `food` at zero for too long → starvation death signal
  (consumed by hollow-05).
- **Resources in the world:** located resource nodes on the 64² grid (e.g. food source, raw
  material) with finite/renewing stock. Agents must travel to them (reuse engine travel /
  pathfinder). Depletion is real — over-harvesting a node exhausts it.
- **Production / consumption / ownership:** agents work aptitude-relevant jobs to produce
  goods; goods are owned (inventory) and consumed to satisfy needs; surplus can be stored or
  traded (trade verb comes in hollow-06, but the ownership/value model lands here).
- **Economy model:** a single coherent value model (prices ↔ effort ↔ need-satisfaction), in
  the spirit of Farm's economy doc — one source table the constants derive from, so it's
  tunable. Document the derivation inline.
- **Scarcity → population regulation:** total sustainable population is a function of resource
  throughput. When the town over-populates relative to resources, needs fail and deaths rise;
  when resources are ample, reproduction (hollow-05) can proceed. No hard population cap.

## Approach
- Reuse the promoted needs/decay + travel + inventory primitives; add Hollow-specific resource
  and job definitions in `@hollow/sim-core`.
- Keep all tuning constants in one `economy/` module with a comment block deriving them from a
  target "one agent covers its needs with ~X ticks of work at a node of stock Y."
- Determinism: resource regen, node yields, work outcomes all via named `Rng` forks.

## Acceptance / gates
- A headless run (no social systems yet) shows agents surviving indefinitely when resources are
  ample, and a die-off when the map is seeded resource-poor — i.e. the anchor bites.
- Sweep test: three resource-density seeds produce three distinct steady-state populations
  (proves scarcity regulates, not a fixed cap).
- Deterministic (byte-identical re-run at default tick scale AND at a low tick scale — recall
  the mining-Math.random lesson: verify at the default `ticksPerX`, not only a high value).
- `npm run test -w @hollow/sim-core` green with assertions on need levels + node depletion, not
  just "it ran".
