---
summary: What Hollow is (generational social-emergence sim on the shared engine) — M1 headless sim (exit-bar PASSED), M2 3D layer (engine WebGPU renderer + gene-driven cozy town), M3 research surfaces (observe module + chronicle/dashboard + persona authoring + shocks/replay), M4 hollow-12 governance + antagonism arcs, M5 hollow-14 Daily Life (leader-assigned jobs + diurnal routine + one central hearth + rare/private interaction), M6 hollow-15 Mortality & Care (3-day starvation death + persistent corpses + graveyard/grave-digger burial + rot→disease + medic), plus load-bearing decisions + known traits.
updated: 2026-07-21
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

**SHOCK** → **PERCEIVE** (+social witness fan-out +feud) → **DELIBERATE** → **ACT** (+social verbs
+care verbs collect/bury/treat) → **TRUST-ACCRUAL** → **GOVERNANCE** → **JOBS** → **COMMUNITY** →
**BELONGING** → **PAIRBOND** → **REPRODUCTION** → **DISEASE** (hollow-15 daily mortality/recovery) →
**LIFECYCLE** → **CORPSE** (hollow-15 rot + disease spread) → **NEEDS-DECAY** → **RESOURCE-REGEN**.
(sim-bootstrap.ts is authoritative; DISEASE sits right before LIFECYCLE so a disease death flows
through LIFECYCLE's single corpse-spawning death path, and CORPSE right after it.)

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
The first true-3D path in the repo. **08** `@engine/core/render3d` (promoted mesh generators — engine
ships **no palette**; `mat4` at **WebGPU clip z∈[0,1]**, `OrbitCamera`, ray `pick`) + WebGPU
device/pipeline/instanced draw + `scene3d.wgsl`. **09** the cozy town: ground/territory tints/
family-growing homes/stock-scaled nodes/day-night, gene-driven humanoids via the **mesh-variant
scheme** (skin×hair×pose), overlay glyphs/tags/click-inspect/follow-cam. Headline post-Chrome fix
(`53bc26c`): the material buffer used an 8-float stride but the WGSL `var<storage>` array is **std430 =
4-float** → half the palette rendered black. **The live 3D image is human-Chrome-gated** — the sandbox
has no WebGPU adapter (`requestAdapter()` → null), so only the visual acceptance is unverified here.
Full slice-by-slice detail in log.md + BUILD-STATE.

## M3 — research surfaces + director role (2026-07-20)
Turns the viewer into a research instrument. **10** promoted the metrics/chronicle/export serializers
into a browser-safe **`@hollow/sim-core/observe`** (single source of truth; CLI tests unchanged =
byte-identity proof) + a live chronicle (click→camera-jump), dashboard, and in-app export. **11**
(determinism-critical) **`@hollow/sim-core/persona`** (archetypes + per-gene lock + deterministic
`applyPersonaSeed`) + **`ONT_SHOCK`** famine/boom/disaster/plague via a SHOCK stage + a replayable
`interventionLog` (byte-identical replay), plus the authoring screen, time controls, shock buttons, and
a URL-hash run descriptor. Determinism lesson: **`Rng.fork()` consumes a parent draw** → new forks must
be appended after existing ones + created unconditionally. DOM/interaction flow verified headless; the
3D image stays Chrome-gated.

## Known limitations (carried forward)
- **`steal`/`trade` are largely dormant in natural play** (a fed town has no needy+greedy+low-trust
  actor next to a stealable holder). Mechanics are correct + unit-tested (hollow-06a); hollow-14's
  jobs→stockpile deepened the economy, but full emergence still wants scarcer per-agent inventory.
  See also M5's known traits (community-merge + chronic-hunger).
- **`attack` is intentionally rare** (aggression gate 0.99) to keep the population stable under
  random genomes; it does fire (0–39/seed) and feeds the violence-death seam.
- **hollow-12 feud arcs are a tail phenomenon.** Because the antagonism gates are tuned for rarity and
  the scoring is needPressure-dominated, a *mild* greedy skew (0.85) fires ZERO antisocial acts in
  300–400t — grudge escalation/reconciliation only manifests at an aggressive cohort + longer runs
  (700t). The economy-deepening brief that makes steal/trade emergent will also make feuds everyday.
- **`betray` and `exclude`** verbs from the hollow-06 spec are deferred (documented seams).
- **Farm behavior-preservation for hollow-02** was gated on unit tests only (the byte-identity
  `EXPORT=json` diff was skipped per user); residual risk lives in the encounter-trade `OfferLedger`
  swap, fallback = revert that file to its Map/Set form.

## Where things live
- Sim: [games/hollow/sim-core/src/](../../games/hollow/sim-core/src/) — `sim-bootstrap.ts`,
  `agents/` (villager + social-verbs), `community/`, `governance/` (hollow-12a standing/leader/norms/
  sanctions), `family/` (lifecycle/pairbond/reproduction + registry + genetics + constants),
  `lineage/`, `social/` (act + witness + **feud** + constants), `mortality/` (hollow-15
  disease-system/corpse-system/care-act-system + constants + medic-capacity helper),
  `protocols/` (incl. `governance.ts`, `feud.ts`, `mortality.ts`). Corpse/Disease are Hollow
  components (`components/corpse.ts`, `components/disease.ts`); `GRAVEYARD_TILE` in `world/grid.ts`.
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

## M4 — governance & antagonism arcs (hollow-12, done)
Depth on the emergent society, both slices sim-core + headless-verifiable (`96f0bf5` + `1b32909`).
**12a governance** — a `GOVERNANCE` stage gives each community per-member **standing**, a contestable
**leader** (argmax standing), **votable norms** (shareRate/cooperation/admission drift on a
standing+genome vote), and **sanctions** (fine / trust penalty / exclusion); norm-clash feeds the
existing LEAVE/SPLIT. **12b antagonism arcs** — a persistent directed `Feud` grudge (hostility was
stateless before) escalated by harm, reconciled by cooperation + decay, with a hysteresis band; it
biases antagonistic target-selection (spirals) but rarity gates stay on raw trust. Neither slice adds
an `Rng`/fork (pure arithmetic, id-sorted ties; `nextU32` continuation proves the stream is
undisturbed); cross-seed + greedy-vs-loyal tests prove the dynamics emerge, not scripted.

## M5 — Daily Life (hollow-14, done)
Re-textured the social sim into a legible daily life (design settled with the user; brief has the full
design-of-record). Five chunks, sim-core then a render pass (`19fa2dc`·`48240fd`·`d404d3e`·`53f78fd`·`8382a8e`):
- **Day-cycle** — a pure `dayPhase(tick, ticksPerDay)` clock (commute/work/gather/sleep); in-game day
  20→200 ticks. Life constants are RAW ticks, so a longer day preserves the generational saga WITHOUT
  retuning the bistable population constants.
- **Jobs** — `occupation` component + a JOBS stage where the hollow-12 leader assigns roles by
  aptitude+demand (loners self-assign); gatherers produce into the community stockpile.
- **Hearth + routine** — one authored central `HEARTH_TILE`; agents commute to work, converge on the
  hearth at dusk, disperse home at night; **belonging renews by hearth attendance**, not membership.
- **Social throttle** — interaction is now rare + private (per-agent cooldown + household/close-tie
  gate); broad mixing only at the hearth during GATHER. Trust is proximity-driven, so a weak
  `TRUST_GATHERING_DELTA` keeps the nightly gathering from fusing the town into one community.
- **Render** — glowing emissive hearth; the day/night wash is synced to the SIM day so dusk coincides
  with the convergence; `J` toggles job-cue badges.
- **Verified** (controller's own headless run): interaction volume down ~6–66×, governance + feuds
  still fire, communities always emerge; population stable; 17/17 whole-workspace typecheck.
- **Known traits (accepted, not bugs):** (1) communities tend to MERGE into one cohesive village over
  time — inherent to one shared hearth; user accepted it as on-theme. (2) bounded, non-lethal chronic
  hunger on some seeds (the routine funnels foraging) — a food-economy balance item.

## M6 — Mortality & Care (hollow-15, done 2026-07-21)
Gave death consequences and a care economy. Sim-core complete + headless-verified; render dispatched
separately (Chrome-gated visual). Brief: [../todos/2026-07-21-hollow-15-mortality-and-care.md](../todos/2026-07-21-hollow-15-mortality-and-care.md).
- **Starvation is lethal in 3 in-game days.** A starvation-death path already existed
  (`family/lifecycle-system.ts`) but defaulted to a huge 3000 raw ticks; the bootstrap default is now
  day-derived (`STARVATION_DEATH_DAYS * ticksPerDay`), still overridable via `starvationDeathTicks`
  (the legacy scarcity + family tests pin a large value / disable disease to isolate what they test).
- **Corpses persist (architectural change).** Death no longer silently despawns — `handleDeath` spawns
  a **`Corpse` on its own entity** (`{ id, corpse }`, no agent/needs → invisible to every living-agent
  query) at the death tile, and releases any body the deceased was carrying. New DeathCause `"disease"`.
- **Graveyard + grave-digger.** One authored `GRAVEYARD_TILE` (like the hearth, but offset +12,+12 so
  its disease radius never touches the hearth crowd). New leader/demand-assigned `grave-digger`
  occupation: collect nearest unburied body → carry to graveyard → bury (corpse despawns, `buriedCount++`).
- **Rot → disease.** An unburied body rots after `CORPSE_ROT_DELAY_DAYS` (2) and infects uninfected
  agents within `DISEASE_SPREAD_RADIUS` (2) at `DISEASE_INFECT_PROB_PER_TICK` (0.008/tick). Disease is a
  per-agent `Disease` component.
- **Disease outcome + medic.** Each in-game day a sick agent rolls `DISEASE_MORTALITY_PROB_PER_DAY`
  (0.10) to die (cause "disease"), REGARDLESS of treatment; a survivor recovers after 5 days on its own
  or 2 once a **medic** (new role, treats ≤3 patients/day, nearest sick-untreated first) has treated it.
  Compounded per-illness lethality is steep by design (untreated ≈41%, treated ≈19%) — which is why the
  INFECTION rate is kept low.
- **Two new stages** around LIFECYCLE: `DISEASE` (before — daily mortality/recovery, sets
  `beliefs.data.pendingDeathCause` for the one death path) and `CORPSE` (after — rot + spread +
  carried-corpse follow). Care verbs (collect/bury/treat) run in a new `HollowCareActSystem` sibling in
  the ACT stage. Two new **unconditional** rng forks appended after `shock` (`disease-spread`,
  `disease-mortality`) — determinism preserved (byte-identical replay test passes).
- **Emergent balance (headless-verified, seeds 7/101, 2000t):** grave-diggers emerge via a
  backlog-proportional demand nudge and bury the dead; disease becomes a controlled endemic
  (~7–10 disease deaths vs ~370 old-age), infections + treatments + recoveries all fire, population
  stays bounded (no collapse, no runaway). Key tuning: **burial demand out-prioritizes medic demand**
  (grave-digger bias 0.7 vs medic 0.6, corpse-demand target 4 so routine churn leaves work for medics) —
  because burial removes the disease SOURCE while treatment only mitigates. A far-corner graveyard +
  short rot delay was measured to turn every death into a town-wiping plague; the current placement +
  2-day grace is what makes it survivable.
- **Known trait (accepted):** a poorly-organized town (leaderless/fragmented during an outbreak) can
  still suffer a heavier disease toll than a well-organized one — seed-dependent divergence, on-theme
  for the emergence sim, not a bug.

## Next (hollow-13)
hollow-13 LLM rationalizer seam (bounded choose-and-narrate within BDI candidates, event-triggered +
async + off-by-default deterministic) is the last queued brief — and the hearth (and now a funeral /
outbreak) gives it natural drama to narrate. The economy-deepening idea is largely **absorbed by
hollow-14** (jobs → stockpile); what remains is optional food-economy balancing.
