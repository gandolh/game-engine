---
summary: What Hollow is (generational social-emergence sim on the shared engine), its M1 architecture (needs → communities → lifecycle/genetics → social verbs → headless research CLI) with the M1 exit-bar PASSED, and its M2 3D layer (engine WebGPU renderer + gene-driven cozy town), the load-bearing decisions + known limitations.
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
- **`@hollow/client`** — browser client. **M2 landed** the living 3D town: it consumes the
  engine WebGPU renderer, reads the Worker snapshot stream, and draws the cozy scene
  (`src/render3d/` + `src/main.ts`, worker `src/worker/`). `npm run hollow`.
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

## M2 — engine 3D renderer + cozy town (2026-07-20)
M2 is the first true-3D path in the repo (the old WebGPU renderer was deleted; Citadel's WebGPU
use is 2D sprite-batch). Built in five slices, all committed on `hollow`:

- **hollow-08a — engine render3d core** (`b5f146e`, `@engine/core/render3d`, *pure, 37 headless
  tests*). Promoted Citadel's generic primitive→mesh generators (box/cylinder/cone/pyramid/gable/
  disc/quad + transforms/merge/boundsOf) into the engine, generalizing the material key to a plain
  `string` (engine ships **no palette**). Added the 3D math that did not exist anywhere: `mat4`
  (column-major `Float32Array`, GPU-upload-ready; `perspective` targets **WebGPU clip z∈[0,1]**,
  right-handed), `OrbitCamera` (orbit/pan/zoom god-cam), and `pick` (screen→world ray, ray∩AABB,
  ray∩triangle, `pickNearest`).
- **hollow-08b — WebGPU render layer** (`575b9d0`). Standalone (does NOT touch the 2D sprite-batch
  path): `device3d`, memoized `pipeline-cache` (depth24plus/less, back-cull, ccw), instanced
  `drawIndexed`, per-frame + per-material bind groups, an instance vertex buffer. `scene3d.wgsl`
  does the **cozy look**: flat shading via `dpdx/dpdy` face normal → 3-step warm toon ramp +
  hemispheric ambient + day/night dim + emissive window-glow. **All CPU-side packing is factored
  into pure unit-tested functions** (`buffers.ts`: packMesh/packInstance/packMaterials/instanceAABB)
  so the only untestable-here part is the thin GPU orchestration.
- **hollow-09a — town shell** (`0848664`). The `@hollow/client` app: 64² ground with gentle sine
  relief, soft community territory tints, household homes that grow with family size and cluster by
  community, distinct crop-bush/rock resource nodes scaled by stock, the orbit god-cam, and a
  sim-clock day/night wash. Added a render-only per-agent **`action`** field to the snapshot
  (`walk/eat/work/rest` + the 9 social verbs) — **determinism-safe** (written by the ACT stage, read
  only by the snapshot builder; proven byte-identical by `sim-bootstrap.action.test.ts`).
- **hollow-09b — gene-driven humanoids** (`c3b8441`). Low-poly humanoids built from primitives,
  colored by appearance genes. Because the renderer gives one tint per instance, per-agent skin AND
  hair color are made correct via the **mesh-variant scheme** (variants keyed by skin×hair×pose,
  ≤5×5×7, built lazily once each, instanced); height/build/life-stage + walk-bob/facing ride the
  per-instance model matrix; poses map from `action`. Walk cycle uses the render clock + interp
  buffer (no lockstep).
- **hollow-09c — legibility + interaction** (`4bd5994`). A 2D overlay over the WebGPU canvas: subtle
  action glyphs by default; **`[T]`** toggles name + need/stress bar. Click ray-picks an agent →
  gold highlight + a **worker `inspect` round-trip** (read-only `world.query` + community/household/
  lineage registries → `InspectDetail`: identity/genome/needs/BDI/relationships/kin/community; dead
  agents fall back to the lineage record) → a DOM side panel. **Follow-cam** (`F`) locks the camera
  target to the selected agent.

**M2 verification.** Everything headless-testable is green: `@hollow/client` 143 tests, `@engine/
core` 269 (incl. the WebGPU-z trap + all packing), whole-workspace typecheck clean across all 18
packages, palette guard green, Farm/Citadel untouched. **The live 3D image is NOT self-verified** —
WebGPU cannot render headless in this environment (the established Citadel finding), so M2's visual
acceptance (a lit walking town, gene-visible lineage, glyphs/tags/inspect) is **gated on a human
opening `npm run hollow` in a WebGPU Chrome**. Engine example: `npm run demo3d -w @hollow/client`.

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
- Engine 3D (M2): [engine/core/src/render3d/](../../engine/core/src/render3d/) — `geometry.ts`,
  `mat4.ts`, `camera3d.ts`, `pick.ts`, `webgpu/` (`device3d`/`pipeline-cache`/`renderer3d`/
  `buffers` + `shaders/scene3d.wgsl`). Generic; names no game.
- Client 3D (M2): [games/hollow/client/src/](../../games/hollow/client/src/) — `render3d/`
  (`app.ts` render loop, `humanoid.ts`, `agent-anim.ts`, `world-meshes.ts`, `overlay.ts`,
  `screen-project.ts`, `materials.ts`, `interp.ts`, …), `worker/` (`sim-worker.ts` + `inspect.ts`),
  `inspect-panel.ts`, `main.ts`.
- Live build tracker / handoffs: [../todos/2026-07-17-hollow-BUILD-STATE.md](../todos/2026-07-17-hollow-BUILD-STATE.md).

## Next (M3+)
**M1 (hollow-01..07) and M2 (hollow-08..09) are complete.** M3 is the research surfaces:
hollow-10 client chronicle/dashboard (live event feed with camera-jump + live metric charts +
in-app CSV/JSON export), hollow-11 authoring/perturbation (guided persona authoring + time controls
+ environmental shocks, logged for reproducibility). M4 depth: hollow-12 governance/politics,
hollow-13 LLM rationalizer seam. All specs are written + queued in `corpus/todos/`. The economy
deepening that activates the dormant steal/trade verbs should still slot in before or alongside M3.
