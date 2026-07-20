---
summary: What Hollow is (generational social-emergence sim on the shared engine) — M1 headless sim (exit-bar PASSED), M2 3D layer (engine WebGPU renderer + gene-driven cozy town), M3 research surfaces (shared observe module + live chronicle/dashboard + persona authoring + deterministic shocks/replay), plus the load-bearing decisions + known limitations.
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
  main thread, samples metrics, captures the event chronicle, exports for offline study. Since M3 it
  consumes the shared `@hollow/sim-core/observe` serializers (one source of truth with the client) and
  accepts `PERSONA_SEED` + `INTERVENTION_LOG` for authored/replayed runs.

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
The first true-3D path in the repo (old WebGPU renderer deleted; Citadel's is 2D sprite-batch). Five
slices (details in log.md + commits):
- **08a `@engine/core/render3d` core** (`b5f146e`) — promoted Citadel's generic primitive→mesh
  generators (material key generalized to `string`; engine ships **no palette**) + the 3D math that
  didn't exist: `mat4` (column-major, `perspective` at **WebGPU clip z∈[0,1]**), `OrbitCamera`, ray
  `pick`. Pure, 37 tests.
- **08b WebGPU layer** (`575b9d0`) — standalone device/pipeline-cache/instanced `drawIndexed`;
  `scene3d.wgsl` cozy shading. All CPU packing factored into pure tests; only GPU orchestration is
  untestable-here.
- **09a town shell** (`0848664`) — ground+relief, territory tints, family-growing clustered homes,
  stock-scaled nodes, god-cam, day/night. Added the render-only per-agent **`action`** snapshot field
  (determinism-safe: written by ACT, read only by the snapshot builder).
- **09b gene-driven humanoids** (`c3b8441`) — appearance-colored via the **mesh-variant scheme**
  (skin×hair×pose, instanced); gene/stage scale + walk cycle + action poses on the render clock.
- **09c legibility + interaction** (`4bd5994`) — 2D overlay glyphs, `[T]` tags, click→read-only
  worker `inspect` → DOM panel, follow-cam.

**Post-Chrome fixes** (from the first real-GPU view): the material buffer used an 8-float ("std140")
stride while the WGSL `var<storage>` array is **std430 = 4-float** → the shader read every odd
material index from zero-padding → houses/rocks/half the palette rendered black (`53bc26c`, the key
bug); plus smoother half-Lambert lighting with a floor so no face is ever black + a slower day cycle
(`01beb9c`); and footprint-hitbox non-overlapping home placement (`f1d1991`). Note **`Rng.fork()`
consumes a parent draw** — appended forks must go after existing ones (see M3 audit).

## M2 verification
Headless-testable all green (`@hollow/client` + `@engine/core` incl. the WebGPU-z trap + all packing,
whole-workspace typecheck, palette guard, Farm/Citadel untouched). The **live 3D image is NOT
self-verified** — the sandbox Chrome has no WebGPU adapter (`requestAdapter()` → null), so the visual
acceptance is **gated on a human at `npm run hollow`** (engine example: `npm run demo3d -w
@hollow/client`).

## M3 — research surfaces + director role (2026-07-20)
Turns the viewer into a research instrument. Four slices (details in log.md + commits):
- **10a shared observe** (`d71f372`) — promoted the metrics/chronicle/export serializers into a
  browser-safe **`@hollow/sim-core/observe`** (single source of truth; the CLI's tests stayed
  UNCHANGED = byte-identity proof). Worker forwards `{events}` deltas + per-year `{metrics}` rows to a
  client `research-store`.
- **10b chronicle + dashboard + export** (`e2fbdc7`) — live filterable chronicle (click→camera-jump,
  dead-actor lineage fallback), live canvas dashboard, in-app metrics.csv/events.jsonl/lineage.json
  (byte-identical to the CLI). Read-only.
- **11a persona + shocks + replay** (`66444c2`) — determinism-critical: **`@hollow/sim-core/persona`**
  (extended `PersonaSeed`: archetypes+counts+per-gene lock; `ARCHETYPE_PRESETS`; deterministic
  `applyPersonaSeed`) + **`ONT_SHOCK`** famine/boom/disaster/plague via a `HollowShockSystem` in a new
  **SHOCK stage first in the tick** + a replayable `interventionLog`. Headline test: `seed +
  persona-seed + interventionLog` replays **byte-identical**.
- **11b authoring + perturbation UI** (`4716203`) — persona authoring screen (sliders + randomize-
  with-lock), time controls (pause/step/1–8×, pure pacing), shock buttons, and a URL-hash **run
  descriptor** that replays a shared run identically.

**M3 verification.** client 253 + sim-core 170 + tool 26 green; whole-workspace typecheck clean.
Determinism audited by hand: **`Rng.fork()` consumes a parent draw**, so 11a's new forks are appended
after all existing forks and created unconditionally → existing draw order byte-preserved; shocks only
at the tick boundary. The **DOM/interaction flow** (author→start→pause/step→famine→chronicle→Share→
identical replay in a fresh tab) was verified headless via agent-browser (DOM + worker need no GPU);
only the **3D image** stays real-Chrome-gated.

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
- Observe / research (M3): [games/hollow/sim-core/src/observe/](../../games/hollow/sim-core/src/observe/)
  (`@hollow/sim-core/observe` — metrics/chronicle/serializers/sampler, shared with the CLI),
  `src/persona/` (`@hollow/sim-core/persona` — PersonaSeed + presets + applyPersonaSeed),
  `src/shock/` + `src/protocols/shock.ts` (shock system + ONT_SHOCK), and client research surfaces
  under `games/hollow/client/src/` (`research-store.ts`, `chronicle-*`, `dashboard-panel.ts`,
  `export-panel.ts`, `persona-setup-panel.ts`, `time-control*`, `shock-*`, `run-descriptor.ts`).
- Engine 3D (M2): [engine/core/src/render3d/](../../engine/core/src/render3d/) — `geometry.ts`,
  `mat4.ts`, `camera3d.ts`, `pick.ts`, `webgpu/` (`device3d`/`pipeline-cache`/`renderer3d`/
  `buffers` + `shaders/scene3d.wgsl`). Generic; names no game.
- Client 3D (M2): [games/hollow/client/src/](../../games/hollow/client/src/) — `render3d/`
  (`app.ts` render loop, `humanoid.ts`, `agent-anim.ts`, `world-meshes.ts`, `overlay.ts`,
  `screen-project.ts`, `materials.ts`, `interp.ts`, …), `worker/` (`sim-worker.ts` + `inspect.ts`),
  `inspect-panel.ts`, `main.ts`.
- Live build tracker / handoffs: [../todos/2026-07-17-hollow-BUILD-STATE.md](../todos/2026-07-17-hollow-BUILD-STATE.md).

## Next (M4)
**M1 (hollow-01..07), M2 (hollow-08..09), and M3 (hollow-10..11) are complete.** M4 is depth:
hollow-12 governance/politics (emergent leaders, votable norms, collective sanctions, feuds),
hollow-13 LLM rationalizer seam (bounded choose-and-narrate within BDI candidates, event-triggered +
async + off-by-default deterministic). Both specs are written + queued in `corpus/todos/`. The economy
deepening that activates the dormant steal/trade verbs should still slot in before or alongside M4.
