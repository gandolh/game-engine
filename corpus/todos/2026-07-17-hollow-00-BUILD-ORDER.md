# Hollow — BUILD ORDER (design of record + milestone map)

status: todo
created: 2026-07-17

**Hollow** is a third game on the shared engine: a director/observer **multi-generational
social simulation**. You author personas, seed a small town, press play, and study emergent
interaction — cooperation, sabotage, community formation, families, and dynasties — over
open-ended generations. **No LLM in v1**; BDI personalities are the substrate, with the genome
trait-vector as the seam an LLM rationalizer plugs into later.

This file is the **design of record** and the master ordering for the numbered `hollow-NN-*`
briefs. It supersedes nothing (new game). When M1 lands, fold a durable summary into a new
`corpus/wiki/hollow-overview.md` and log it.

---

## Locked design decisions (do not relitigate without a new decision note)

1. **Genre / user role.** Director/observer ("scientist"). The user authors personas, seeds
   the world, observes, and *perturbs* (inject events, spawn/kill, change resources). **No
   player-embodied avatar** — no Pip-style controller, no first-person interaction layer.
2. **Anchor substrate.** Needs + scarce, spatially-located resources + a real economy.
   Decisions have weight because agents can fail (hunger → poverty → isolation → death).
   **Scarcity is the population regulator** (population is not otherwise capped). This is the
   direct answer to the failure mode observed in the prior LLM agent-society study
   (github.com/gandolh/agent-society): agents hallucinated thoughts because decisions had no
   consequence. Here every social move is a survival strategy.
3. **Communities are EMERGENT.** No pre-drawn factions. A community crystallizes when a
   cluster of agents accumulates enough mutual trust / shared activity, then becomes a
   first-class entity (shared stockpile, territory, norms). Communities grow, split, merge,
   and dissolve from agent behavior. The user seeds personas + world, never groups.
4. **Multi-generational life sim.** Agents are born, age through stages (child → adult →
   elder), and die (age / starvation / violence). Compressed lifespan, **open-ended run** (no
   fixed end — continues until extinction or the user stops). Dynasties rise and fall.
5. **Pair-bonding + genetics.** Two adults pair-bond (proximity + trust + trait-compatibility
   + life-stage) → household → children. The **genome** encodes three gene groups:
   - **behavior** — the BDI weights (sociability, risk tolerance, aggression, loyalty, greed,
     industriousness, curiosity, …),
   - **aptitude** — per-skill affinity = learning rate + skill cap (the *level* is lived
     state, not inherited; it grows with practice),
   - **appearance** — heritable visual genes (height, build, skin/hair tone from palette
     roles) so **lineage is visible in the 3D world** — children resemble parents.

   Inheritance = per-gene crossover from both parents + small mutation. **`Personality` holds
   the genome (fixed at birth); `Beliefs`/`Desires`/`Intentions` are lived experience (not
   inherited).** This reuses the existing engine BDI component split exactly and is the LLM
   plug-in seam.
6. **Social verbs (the observable "moves").** Four groups; emergence is which agents choose
   under pressure:
   - **Cooperative** — trade/barter (Contract-Net), gift, share resources, help with labor,
     teach a skill.
   - **Antagonistic** — steal, sabotage (damage another's resource/production), betray a deal,
     spread rumor (lower a target's reputation), exclude from a community.
   - **Bonding/kinship** — court, pair-bond, cohabit, raise children, inherit on death, mourn.
   - **Governance/collective** — vote/appoint a leader, set a community norm, levy a shared
     contribution, sanction a rule-breaker. **Higher-order — deferred to M4.**
7. **Rendering = true 3D, raw WebGPU, promoted into `@engine/core`.** Not sprites; not
   Citadel's software rasterizer. A generic WebGPU 3D renderer lives in the engine (so it can
   name no game). Cozy look = **flat shading (one tone per face by normal) + ambient occlusion
   + warm palette-snapped ramps**, optional toon ramp. Meshes are **baked from parametric
   primitives** (box/cylinder/cone/pyramid/gable → indexed triangle mesh) — the same
   "assets are code" approach as Citadel's mesh building generators, but rendered live in
   WebGPU instead of rasterized to an atlas. This is the 3D analog of the project's
   established bake-from-recipes principle.
8. **Isolation + reuse.** Games never import each other (enforced). Farm's generic agent
   machinery (needs, FSM PERCEIVE→ACT loop, deliberate-registry, Contract-Net trade,
   trust/relationship primitives) is **promoted up into `@engine/core`**; Farm is refactored
   to consume it; Hollow consumes it fresh. Net effect: shared mechanics leave Farm's package,
   so the two existing games become **more** isolated, not less. Genome/GA, aging, families,
   and communities are new systems built on top (in `@engine/core` where generic, else in
   `@hollow/sim-core`).
9. **Output = a research instrument.** Timeline / event-log + metrics dashboard with CSV/JSON
   export + a **headless research CLI** (`@tool/hollow-sim`) for batch seed/persona
   experiments. Live in-world overlays beyond a minimal click-inspect are **out of v1 scope**
   (can be added later). Determinism is load-bearing — everything through seeded `Rng`, no
   `Math.random`/`Date.now` in sim.
10. **Scale.** ~30–60 living agents at once (held there by scarcity + death); world ~64×64
    tiles. Dead agents leave the ECS world and persist only in the lineage record, so cost
    stays bounded across generations.
11. **Transport.** Sim runs in an in-browser **Web Worker** (like Citadel solo) for the app;
    the headless CLI and all tests drive the scheduler directly on the main thread. No server
    / no multiplayer in v1. `bootstrapHollowSim()` stays transport-agnostic.
12. **Palette.** Reuse Citadel's **Apollo-46** (cozy warm) as the base, extended with named
    natural skin/hair-tone roles for appearance genetics. Palette guard is per-scope — add a
    Hollow scope validated against the Hollow palette module, mirroring the Citadel precedent.
13. **Name / packages.** `@hollow/sim-core`, `@hollow/client`, `@tool/hollow-sim`. Engine
    additions land in `@engine/core` (+ `@engine/ui` for any shared widgets).

---

## Small mechanics defaults (locked unless vetoed)

- **Death causes:** old age (past elder threshold, rising hazard), starvation (a need hits
  zero for too long), violence (a resolved antagonistic attack). No disease in v1.
- **Pair-bond trigger:** both adults, not close kin, sufficient mutual trust, trait
  compatibility above a threshold, and proximity/shared activity. One partner at a time in v1.
- **Reproduction:** a bonded co-habiting pair has a per-window chance gated by food security
  (no children during famine — scarcity regulation). Gestation is a fixed delay.
- **Inheritance on death:** owned resources pass to co-resident kin (partner → children →
  nearest community), else revert to the commons.
- **Aptitude vs skill:** aptitude gene sets learning rate + cap; skill level is lived state,
  raised by doing the work and by being *taught* (the teach verb).

---

## Milestone map

Headless-first: **prove emergence in the data before spending on rendering.** Each milestone
is independently valuable and gated.

### M1 — Sim vertical slice (headless, no 3D). The proof.
- `hollow-01-workspace-skeleton` — packages, tsconfig wiring, palette module + per-scope
  guard, `bootstrapHollowSim`, Worker + headless entry stubs.
- `hollow-02-engine-agent-kernel-promotion` — lift generic BDI/needs/FSM/deliberate-registry/
  CNP-trade/trust from Farm into `@engine/core`; refactor Farm to consume; **determinism-diff
  gate** on Farm.
- `hollow-03-needs-economy-scarcity` — needs decay, located scarce resources, production/
  consumption, ownership, scarcity-as-population-regulator.
- `hollow-04-relationships-emergent-communities` — relationship ledger, trust ties, community
  crystallization (form/grow/split/merge/dissolve), shared stockpile/territory/norms.
- `hollow-05-lifecycle-pairbond-genetics` — life stages, aging, death, pair-bonding,
  reproduction, genome (behavior+aptitude+appearance), crossover+mutation, kinship graph,
  inheritance.
- `hollow-06-social-verbs` — cooperative + antagonistic action handlers and the BDI
  deliberation that chooses among them under need pressure.
- `hollow-07-headless-cli-metrics-export` — `@tool/hollow-sim`, generational run loop, metrics
  time-series + event stream, CSV/JSON export, `CHECK_DETERMINISM`.

**M1 exit bar:** a headless seed run over ≥5 generations produces, in the exported data,
*observable emergence* — at least: communities forming and at least one dissolving; visible
cooperation-vs-sabotage divergence between seeds; multi-generation lineages with heritable
trait drift; population held in a stable band by scarcity (not exploding, not instantly
extinct). Deterministic (byte-identical re-run). This is the go/no-go for M2.

### M2 — Engine WebGPU 3D renderer + cozy town. (briefs `hollow-08`, `hollow-09`)
- `hollow-08-engine-webgpu-3d-renderer` — generic `@engine/core` WebGPU 3D layer (device/
  pipeline cache, depth buffer, camera + bind-group scheme, flat-shade-by-normal + AO pass,
  warm ramp) + promote a generic **primitive→mesh** module (box/cylinder/cone/pyramid/gable +
  transform/merge) from Citadel's mesh generators into the engine.
- `hollow-09-hollow-cozy-town-scene` — the living cozy town: **free orbit+pan+zoom perspective
  god-cam** with ray-pick; households as house meshes that grow with families; readable
  resource nodes; community territory ground-tint; low-poly humanoid agents driven by
  **appearance genes** (height/build/skin+hair tone) with a walk cycle + action poses;
  **subtle-diegetic legibility + a [T] tag toggle**; day/night warm wash; click → inspect panel.
- Render consumes the Worker snapshot stream; render-only, sim byte-untouched.

**M2 locked decisions:** camera = free orbit+pan+zoom perspective (ray-pick); legibility =
subtle diegetic (action glyph + posture + territory tint, kids smaller) with a `[T]` toggle for
name/need tags, full detail on click; fidelity = living cozy town (gene-driven humanoids +
per-household homes + readable nodes + action poses + day/night).

### M3 — Client app: the research surfaces. (briefs `hollow-10`, `hollow-11`)
- `hollow-10-client-chronicle-and-dashboard` — the app shell (3D view + DOM side panels); a
  **live, forward-only chronicle** of significant events (births, deaths, pairings, betrayals,
  community formed/split/dissolved, famines) where clicking an event **jumps the camera** to the
  actors in the live sim (NO world rewind — deep analysis is via export); a **metrics dashboard**
  of live time-series (population, births/deaths by cause, community count/size, mean trust,
  wealth Gini, coop-vs-sabotage rate, mean trait drift) in a DOM side-panel + in-app CSV/JSON
  export reusing the CLI's format.
- `hollow-11-authoring-and-perturbation` — **guided persona authoring** (archetype presets +
  counts + gene sliders + randomize/lock; writes the same persona-seed file the CLI consumes);
  **live perturbation = time controls (pause/speed 1–8×/step) + environmental shocks (famine/
  boom/disaster/plague)**; interventions are logged so `seed + intervention-log` reproduces a
  run; save/share a run via seed + persona-seed (like Farm's descriptor). *(Agent-level edits &
  live rule-tuning are explicitly deferred past M3.)*

**M3 locked decisions:** timeline = live chronicle + camera-jump, no world rewind; authoring =
guided archetypes+sliders sharing the CLI persona-seed format; perturbation = time + shocks only
(logged for reproducibility); dashboard = DOM side-panel live charts + export.

### M4 — Depth. (briefs `hollow-12`, `hollow-13`)
- `hollow-12-governance-and-politics` — **emergent leaders** (standing → contestable de-facto
  leader), **votable norms** (share-rate, cooperation expectation, admission), **collective
  sanctions** (fine from stockpile / trust penalty / exclusion), leadership contests + factional
  splits; plus antagonism tuning + feud/reconciliation dynamics.
- `hollow-13-llm-rationalizer-seam` — the **bounded** LLM seam: BDI produces the grounded
  feasible candidate intentions; the LLM **chooses among those candidates and narrates why**
  (never invents unsupported actions), narrative logged to the chronicle. **Event-triggered**
  (only at significant decisions: join/leave, betray, pair-bond, sanction, big trade), **async
  off the tick loop with BDI-default fallback** (never blocks). **Off by default → byte-
  deterministic (M1–M3 unaffected); on → labeled non-deterministic live mode** with an optional
  prompt-keyed response cache for reproducible replay. Pluggable provider, default **Claude
  Haiku 4.5** (swappable to Sonnet for deep runs).

**M4 locked decisions:** governance = emergent leaders + votable norms + sanctions; LLM
authority = bounded choose-and-rationalize within BDI options (anchored, cannot invent actions);
LLM runtime = event-triggered + async + BDI fallback, off-by-default deterministic, cache for
replay.

---

## Cross-cutting invariants (every Hollow brief must honor)

- **Determinism.** All randomness via seeded `Rng.fork(label)`. No `Math.random`/`Date.now` in
  sim/genetics. The GA (crossover/mutation) draws from a named fork. Prove behavior-preserving
  refactors with multi-seed `EXPORT=json` diffs, not just `CHECK_DETERMINISM`.
- **Palette purity.** Every color from named Apollo-46 (+ Hollow tone) role constants; no raw
  hex. Per-scope palette guard covers `games/hollow/`.
- **No `.js` import suffixes; pinned versions; TS strict** (+ `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`).
- **Engine names no game.** Anything promoted to `@engine/core` must be game-agnostic (no
  "farmer", "villager", "crop" nouns). Hollow-specific nouns stay in `@hollow/sim-core`.
- **Scheduler order is load-bearing.** Document data dependencies inline as Farm/Citadel do;
  the inbox lifecycle (dispatch → snoop → perceive-clears) pattern carries over.
- **Verify integration, not just green tests.** Per the repeated project lesson, run the
  headless demo and inspect exported data — reject weak assertions and inert features.
