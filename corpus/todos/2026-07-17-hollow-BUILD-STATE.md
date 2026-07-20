# Hollow — BUILD STATE / RESUME (live tracker)

status: in-progress
updated: 2026-07-20

**Read this first to resume the Hollow build.** Design-of-record + all brief specs are in
`corpus/todos/2026-07-17-hollow-00-BUILD-ORDER.md` and `…-hollow-01..13-*.md`. This file is the
live progress tracker + the API handoffs needed to dispatch the next brief.

## How we're building it
- Skill: **plan-split-dispatch**, backlog/wave mode. Controller (opus) plans/verifies/adjudicates;
  executor briefs dispatched to **Sonnet** subagents (per user directive), **except hollow-02**
  which ran on **opus** (it refactors the shipping Farm game).
- **Branch `hollow`** (off `main`). Local only — **nothing pushed**. Per-brief checkpoint commits.
- One brief per wave (M1 is a serial dependency chain: `01→02→03→04→05→06→07`).
- **Verify gate after each wave** (controller runs it, not the subagent): `npm run typecheck`
  (whole workspace) + `npm run test -w @hollow/sim-core` (narrow) + git-tracked check
  (`git status --porcelain` shows new files; `git check-ignore <new src dir>` empty). Commit only
  when green.

## Constraints (carry into every dispatch)
- **Constrained hardware**: small runs; **ALWAYS ask the user before any determinism/EXPORT check**;
  narrowest test scope (single workspace), never the full repo suite mid-wave.
- **Determinism load-bearing**: all randomness via seeded `Rng.fork(label)`; no `Math.random`/
  `Date.now`; verify at DEFAULT and LOW tick scale.
- **Agent-prompt hygiene**: forbid `git reset`/`checkout`/`stash` in subagent prompts; subagents
  don't commit; controller integrates.
- **Verify integration, not just green tests**: reject weak assertions; confirm real behavior.
- Engine names no game; `@hollow/*` imports `@engine/*` only (layering test enforces).
- **Determinism-gate decision (recorded):** the user chose to gate Farm behavior-preservation on
  the 867+216 green unit tests only — the byte-identity `EXPORT=json` diff was **skipped**.
  Residual risk lives in hollow-02's `OfferLedger` swap; fallback = revert
  `games/farm/sim-core/src/systems/encounter-trade/system.ts` to its `Map`/`Set` form, keeping
  `OfferLedger` engine-only. Apply the same "trust tests unless told otherwise" default going
  forward, but still ASK before running any determinism check.

## Progress

| Brief | State | Commit |
|---|---|---|
| planning (BUILD-ORDER + 14 briefs) | ✅ | `edb6284` |
| hollow-01 workspace skeleton | ✅ done, verified | `411a561` |
| hollow-02 engine agent-kernel promotion (+Farm refactor) | ✅ done, verified | `a9d2a5f` |
| hollow-03 needs / economy / scarcity | ✅ done, verified | `1790d59` |
| hollow-04 relationships / emergent communities | ✅ done, verified | `9bbc90f` |
| **hollow-05 lifecycle / pair-bonding / genetics** | ✅ **done, verified** | `c8c3c2b` |
| **hollow-06 social verbs** | ✅ **done, verified** (split 6a+6b) | `5bd92c5` + `b802738` |
| **hollow-07 headless CLI + export** | ✅ **done, verified** | (this wave) |
| **M1 EXIT-BAR GATE** | ✅ **PASSED** (2026-07-20) — see wiki/hollow-overview.md | — |
| **hollow-08 engine WebGPU 3D renderer** | ✅ **done, verified** (split 8a+8b) | `b5f146e` + `575b9d0` |
| **hollow-09 cozy 3D town scene** | ✅ **done, verified** (split 9a+9b+9c) | `0848664` + `c3b8441` + `4bd5994` |
| **M2 GATE** | ✅ headless-verified; **live 3D image Chrome-gated** (not self-verifiable) | — |
| **hollow-10 chronicle + dashboard** | ✅ **done, verified** (split 10a+10b) | `d71f372` + `e2fbdc7` |
| **hollow-11 authoring + perturbation** | ✅ **done, verified** (split 11a+11b) | `66444c2` + `4716203` |
| **M3 GATE** | ✅ headless + DOM-flow verified; **live 3D image Chrome-gated** | — |
| M4 (hollow-12..13) | ⬜ specs written, queued | — |

## hollow-05 — how it went (2026-07-20)
Re-dispatched FRESH on a Sonnet executor (the old `stash@{0}` partial was NOT salvaged). Implementation
was scope-clean (all in `games/hollow/sim-core/`, no engine edits) and typechecked first try — but the
controller (opus) caught a **population-dynamics defect the green unit tests hid**: the executor's
full-sim `FAST_LIFECYCLE` used *ample* food + high fertility, which removed the only carrying-capacity
mechanism → the 3000-tick dynasties test ran the population to thousands and the O(n²) community pass
made the suite effectively hang (looked like green tests, was actually a near-hang).

**Root finding (design-level):** food-scarcity alone can't bound the population at test timescales.
The per-partner food-security birth gate is *bimodal* (villager AI keeps everyone fed until food
crashes), and pairbonding is a *positive* feedback (more agents → denser → more trust → more bonds →
more births), so the system is **bistable**: any fertility high enough to survive the founder die-off
lets lucky seeds explode; any low enough to cap growth lets unlucky seeds go extinct. Confirmed over 5
parameter sweeps (see scratchpad diag runs) — no fertility/food setting is bounded-and-surviving
across seeds.

**Fix (user-approved):** added a **density-dependent birth brake** — `BIRTH_PERCAPITA_FOOD_TARGET`
(family/constants.ts) scales effective birth chance by per-capita food supply
(`sum(food-node regen)/aliveCount`), turning the bimodal gate into a smooth logistic brake →
self-limiting, seed-robust plateau. Swept the target: T=6 is bounded (~15–65) and never-extinct across
seeds {1,7,33,101,202}; T≥15 over-throttles to extinction. New opt: `birthPerCapitaFoodTarget`.
Rewrote `sim-bootstrap.family.test.ts` around a stable `STABLE_LIFECYCLE` profile with modest tick
budgets (≤1200) + a real scarcity-coupling A/B test. Suite: **95/95 green in ~4s**; whole-workspace
typecheck **17/17**.

**Lesson filed:** `gestationTicks` defaults to 250 — omitting it from a compressed test profile
silently defaults gestation to 250 ticks → no birth completes before founders die → extinction. When
building a FAST_* profile, copy EVERY compressed knob; a missing one silently reverts to the
production default and can invert the dynamics.

## Note: the old stash is still present
`git stash drop stash@{0}` was **blocked by the permission classifier** this session — the WIP stash
"hollow-05 WIP (incomplete…)" is harmless dead weight and was NOT used. Drop it manually when
convenient: `git stash drop stash@{0}`.

## HANDOFF from hollow-05 (feed to hollow-06 / 07)
- `BootedHollowSim` now also exposes `households: HouseholdRegistry` and `lineage: LineageRegistry`.
- New Hollow components on `HollowEntity`: `genome` (behavior/aptitude/appearance — appearance tones
  are HOLLOW_PAL role strings), `lifecycle` (birthTick/ageTicks/stage), `householdId:number|null`.
- Family ontology `ONT_FAMILY.{BONDED,BIRTH,DEATH,STAGE_CHANGED}` (protocols/family.ts); the
  bootstrap subscribes BIRTH/DEATH to keep `bornCount`/`diedCount` on the snapshot.
- Death seam for **hollow-06 violence**: `HollowLifecycleSystem.evaluateDeath` already reads
  `beliefs.data.violentDeath === true` (nothing sets it yet) — hollow-06's resolved-attack signal
  sets that flag to cause a "violence" death (inheritance/lineage/despawn all already handle it).
- Snapshot extended additively: agents carry `ageTicks/stage/householdId/appearance`; top-level
  `bornCount/diedCount/householdCount`. New subpath exports `./family`, `./lineage`.
- Scheduler order now: …→ BELONGING → **PAIRBOND → REPRODUCTION → LIFECYCLE** → NEEDS-DECAY →
  RESOURCE-REGEN.

## hollow-06 — how it went (2026-07-20)
Split into TWO sequential Sonnet dispatches (the brief itself flags this as "exactly where green
tests / inert feature has bitten us") — controller verified real behavior between them:
- **6a mechanics** (`5bd92c5`): ACT-stage effects for all 9 verbs (gift/share/help_labor/teach/
  trade/steal/sabotage/rumor/attack), each with a real effect + `ONT_SOCIAL.*` event; new `Skills`
  component (lived level, aptitude-capped, scales MATERIAL harvest + practiced by work/teach);
  third-party fan-out (rumor + detected-steal lower bystanders' trust with distance decay) via a
  PERCEIVE-stage `HollowSocialWitnessSystem`. `attack` sets the hollow-05 `violentDeath` seam. New
  opts `stealDetectionProb/attackLethalityProb/sabotageDetectionProb`; forks `steal-detection/
  attack/sabotage-detection`; export `./social`. **trade settles synchronously** (multi-tick CNP
  negotiation = documented seam); **betray + exclude deferred** (documented seams).
- **6b deliberation** (`b802738`): villagers CHOOSE verbs via a DETERMINISTIC genome-gated
  weighted-average scorer (no rng). Survival ladder (food/rest) unchanged + always wins; then
  hard per-gene gates (greed→steal, aggression→sabotage/attack, loyalty→gift/share, sociability→
  help, curiosity→teach) + weighted factors; else `work`. Neighbor index added to the deliberation
  context (built once/tick, O(n)). Additive snapshot field `socialCounts` (per-verb running totals,
  via `ONT_SOCIAL` subscriptions) — feeds hollow-07 export.

**Controller verification (real headless runs, stable profile + random genomes, 5 seeds, 800t):**
cooperation AND antagonism both emerge on every seed; antag/coop ratio diverges strongly by seed
(seed 7 ~10× more antagonistic than 101); **population stays bounded (21–61) — the social layer did
NOT break hollow-05 stability**. Flip test: aggressive/disloyal cohort = antagonism-only, loyal/
sociable = cooperation-only. `@hollow/sim-core` 120/120 green; typecheck clean.

**KNOWN LIMITATION (logged for hollow-07 / a later economy brief):** `steal` and `trade` stay
DORMANT (count 0) in natural play — a fed, cooperative town has no needy+greedy+low-trust actor
next to a stealable holder, and solo agents' inventories net to ~zero (harvest self-consumes). The
mechanics are correct + unit-tested (6a); they'll become emergent under a persistent-inventory /
scarcer economy. `attack` is intentionally rare (gate 0.99) but does fire (0–39/seed). NOT a blocker
for the M1 exit-bar (cooperation-vs-sabotage divergence is delivered by gift/share/help/sabotage/
rumor). Flag this to hollow-07's export/metrics work and revisit in the economy deepening.

## HANDOFF from hollow-06 (feed to hollow-07)
- Snapshot now additionally carries `socialCounts: Readonly<Record<string,number>>` (keys
  gift/share/help/teach/trade/steal/sabotage/rumor/attack) alongside `bornCount/diedCount/
  householdCount` (hollow-05). hollow-07's CSV/JSON export should surface these + the community/
  lineage/needs data already on the snapshot.
- `ONT_SOCIAL.*` events (protocols/social.ts) are broadcast per consummated verb — hollow-07 can
  subscribe for per-event export instead of (or in addition to) the running counts.
- Every stochastic verb outcome has a `*Prob` option knob (steal/attack/sabotage) for
  scenario-authoring; genome cohorts can be biased in tests by mutating `genome.behavior[gene]`
  post-bootstrap.

## M2 — how it went (2026-07-20)
Continued straight into M2. **08** (engine renderer) split 8a (pure core: mesh promotion + mat4/
camera/pick, 37 tests) + 8b (WebGPU device/pipeline/instanced draw + `scene3d.wgsl` cozy flat-shade;
CPU packing pure-tested, GPU thin). **09** (town) split 9a (world/homes/nodes/cam/day-night + a
determinism-safe render-only `action` snapshot field) + 9b (gene-driven instanced humanoids via the
skin×hair×pose mesh-variant scheme + walk cycle/poses) + 9c (glyph/`[T]`-tag overlay + click→
read-only worker `inspect` → DOM panel + follow-cam). Every slice controller-verified (typecheck +
narrow tests + layering/palette/scope + determinism where relevant) and committed only-my-paths.

**The load-bearing M2 reality:** WebGPU cannot render headless in this environment (Citadel finding),
so the *visual* acceptance gates (08b's lit scene, 09's walking gene-visible town, glyphs/tags/
inspect) are **NOT self-verified** — they need a human in a WebGPU Chrome. Mitigation applied: all
CPU-side logic (mesh geometry, mat4, camera, ray-pick, buffer/instance/material packing, screen
projection, humanoid builder, pose/anim math, inspect assembly, name/glyph mapping) was factored
into **pure functions with unit tests**, so ~everything except the thin GPU/DOM orchestration is
verified. `@hollow/client` 143 + `@engine/core` 269 green; whole-workspace typecheck clean (18 pkgs,
Farm/Citadel untouched). **Human Chrome checklist** is in the controller's M2 handoff (below) + the
per-slice commit messages.

### Human Chrome-verify checklist (the ONLY unverified part of M2)
`npm run hollow` (repo root) → open the Vite URL (port per `games/hollow/client/vite.config.ts`) in
Chrome 113+ (or enable `chrome://flags` → "Unsafe WebGPU"). Expect: grassy 64² ground w/ gentle
relief; soft community territory tints; clustered homes that grow with family size; distinct
crop-bush vs rock nodes shrinking as depleted; **humanoids that walk, strike action poses, and whose
skin/hair colors visibly track lineage** (children resemble parents); golden day↔night with glowing
windows. Overlay: action glyphs over active agents; press **T** for name+need bars; **click** an
agent → gold highlight + side panel (genome/needs/mind/relationships/kin/community); **F** to
follow-cam. Engine-only sanity: `npm run demo3d -w @hollow/client` (static primitive scene).

## M3 — how it went (2026-07-20)
Four slices. **10a** promoted the metrics/chronicle/export serializers into a browser-safe
`@hollow/sim-core/observe` (single source of truth; the CLI's tests stayed UNCHANGED = byte-identity
proof) + worker forwards event/metric streams to a client research-store. **10b** built the live
chronicle (click→camera-jump), dashboard charts, and in-app export. **11a** (determinism-critical) added
`@hollow/sim-core/persona` (archetype presets + counts + per-gene lock + deterministic applyPersonaSeed)
and `ONT_SHOCK` shocks via a SHOCK stage first in the tick + a replayable interventionLog — headline
replay test byte-identical. **11b** added the authoring screen, time controls, shock buttons, and a
URL-hash run descriptor.

**Determinism audit (controller, by hand — not just the green test):** `Rng.fork(label)` DOES consume
one parent draw (`this.nextU32() ^ hash(label)`), so fork ORDER matters. 11a's two new forks
(`persona-authoring`, `shock`) are appended AFTER all existing forks and created UNCONDITIONALLY, so
every existing derived stream keeps its position and existing behavior is byte-preserved. Shocks only
enter via `scheduleShock` → applied in the tick-boundary SHOCK stage → logged. Verified: client 253 +
sim-core 170 + tool 26 green; whole-workspace typecheck clean.

**Browser reality (still true):** the sandbox Chrome has **no WebGPU adapter** — the 3D image is
Chrome-gated. BUT the M3 features are mostly DOM + worker (no GPU), so the full interaction flow
(author → start → pause/step → fire famine → chronicle reacts → Share link → identical replay) WAS
verified headless via agent-browser. Only the literal 3D scene needs a human in a GPU Chrome.

## ▶ NEXT ACTION (resume here) — M1 + M2 + M3 COMPLETE; this is now the M4 entry point
**M1 (hollow-01..07) + M2 (hollow-08..09) + M3 (hollow-10..11) are done (2026-07-20).** Findings +
the full story are in [../wiki/hollow-overview.md](../wiki/hollow-overview.md). Green: `@hollow/sim-core`
170 + `@tool/hollow-sim` 26 + `@hollow/client` 253 + `@engine/core` 269; whole-workspace typecheck
clean (Farm/Citadel untouched). Everything local on `hollow`, unpushed. Commits are only-my-paths each
slice.

**⚠ Carried-forward, still open (M2 did NOT close these):**
- **M2's live 3D image is human-unverified** (WebGPU headless unavailable). Someone must run the
  Chrome checklist above before trusting the *visual* acceptance — the headless surface is all green
  but a shader/camera/scene bug that only shows on-screen would not have been caught here.

To resume (M4):
1. Confirm baseline: `npm run test -w @hollow/client` (253) + `npm run test -w @hollow/sim-core`
   (170) + `npm run test -w @tool/hollow-sim` (26) + whole-workspace `npm run typecheck`. For the
   visual + interaction: run the Chrome checklist below.
2. **Still recommended before/alongside M4:** an **economy-deepening brief** (persistent inventory /
   real scarcity) so `steal`/`trade` stop being dormant (see hollow-overview.md "Known limitations").
   Note M3's shocks give a lever to stress the economy now.
3. **M4 (hollow-12, 13)** specs are queued in `corpus/todos/`: 12 governance/politics (emergent
   leaders, votable norms, collective sanctions, feud/reconciliation), 13 LLM rationalizer seam
   (bounded choose-and-narrate within BDI candidates, event-triggered + async + off-by-default
   deterministic, Haiku default). Dispatch on Sonnet executors, same verify-gate discipline. 12 is
   sim-core (fully headless-verifiable); 13 introduces a NON-deterministic live mode gated behind an
   off-by-default flag — keep M1–M3 byte-deterministic when it's off.
4. Housekeeping: stale `git stash@{0}` (if present) — drop when convenient; ensure `hollow-out/`
   (CLI EXPORT_DIR) is gitignored.

### Human Chrome-verify checklist — M3 (interaction + visual)
`npm run hollow` in a WebGPU Chrome. **Authoring:** the setup screen lists archetype presets; add rows
+ counts, tune gene sliders, lock a gene + Randomize (locked holds), set seed/density → Start boots a
town whose founders match. **Research:** the left rail chronicle fills with readable lines and clicking
one jumps the camera; the dashboard charts update per year; the three export buttons download files.
**Perturbation:** pause/step/1–8× pace the sim; fire Famine/Boom/Disaster/Plague → they appear in the
chronicle and move the dashboard. **Share:** the Share button writes a URL hash; opening it in a fresh
tab replays the identical town. (The DOM half of all this was verified headless; the 3D scene needs your
GPU Chrome.)

---

## HANDOFF SURFACES (from completed briefs 01–04) — feed these to the hollow-05 dispatch

### Sim shape (`@hollow/sim-core`)
- `bootstrapHollowSim(opts: HollowSimOptions)` → `{ world, bus, scheduler, rng, tick(), getSnapshot(), resources: ResourceWorld, communities: CommunityRegistry }`. Scheduler: `.stage(name).add(system)`.
- Current scheduler order: **PERCEIVE → DELIBERATE → ACT → TRUST-ACCRUAL → COMMUNITY → BELONGING → NEEDS-DECAY → RESOURCE-REGEN** (each stage has an inline data-dep rationale in `sim-bootstrap.ts`).
- `HollowSimOptions` (all optional past seed/ticksPerDay): `seed`, `ticksPerDay`, `population`, `foodNodeCount`, `materialNodeCount`, `foodNodeMaxStock`, `foodNodeRegenPerTick`, `materialNodeMaxStock`, `materialNodeRegenPerTick`, `trustProximityDelta`, `trustSharedNodeDelta`, `trustDecayRate`, `communityCheckIntervalTicks`, `communityMinSize`, `communityMinMembers`, `communityMinDensity`, `communityTrustThreshold`, `communityJoinTrustThreshold`, `communityLeaveTrustThreshold`, `communityMergeCrossTrustThreshold`, `communityMergeTerritoryRadius`, `belongingMemberReplenishPerTick`, `belongingNonMemberDecayPerTick`.
- `HollowSnapshot`: `{ tick, aliveCount, agents: HollowAgentSnapshot[], resourceNodes[], communities: HollowCommunitySnapshot[] }`. `HollowAgentSnapshot{ id, kind, gx, gy, needs:Record<string,number>, inventory:Record<string,number>, starving, communityId }`. `HollowCommunitySnapshot{ id, members, territory, stockpile, norms }`. **Extend additively** for age/stage/genome/householdId.
- Subpath exports: `.`, `/sim-bootstrap`, `/components`, `/world`, `/economy`, `/protocols`, `/agents`, `/systems`, `/population`, `/community`.

### Entity + components (`@hollow/sim-core/components`)
- `HollowEntity{ id?, fsm?:FsmState<"PERCEIVE"|"ACT">, beliefs?, desires?, intentions?, personality?{kind}, inbox?, agent?:HollowAgent, needs?:Needs, inventory?:Inventory, ownership?:Ownership, relationships?:RelationshipLedger, communityId?:number|null }`.
- `HollowAgent{ gx, gy, moveTarget:MoveTarget|null }`. `Inventory{ goods:Record<string,number> }` (+`addGoods`/`takeGoods`). `Ownership{ ownerId }` (self-pointing seam only). `personality.kind` = `"villager"` (only registered deliberator kind; lives on the ENGINE `Personality` component — required by `createDeliberateSystem`).
- Needs kinds present: `food, rest, wealth, belonging` (belonging is now driven by community membership).

### Engine agent kernel (`@engine/core/agent`, from hollow-02)
- Needs: `Need{value,min,max,decayPerTick}`, `Needs{byKind}`, `makeNeed/decayNeed/replenishNeed/needFraction/needIsDepleted`, `createNeedsDecaySystem(world,{component,needsOf,name?})`.
- Deliberation: `createRegistry<V>(label?)`, `createPersonalityRegistry<E,Ctx>()`, `Deliberator<E,Ctx>`, `createDeliberateSystem(world,{registry,perceiveState,actState,shouldSkip?,makeContext?,name?})`.
- CNP: `PERFORMATIVE{INFORM,REQUEST,PROPOSE,ACCEPT,REJECT,CFP,FAILURE,REFUSE}`, `OfferLedger<T>` (ttl, `add/has/get/remove/expire/beginHandshakeRound/claimHandshake`). *(For hollow-06.)*
- Relationship: `RelationshipLedger{byId:Map<number,number>}`, `relationshipScore(ledger,peer,scale?)`, `applyRelationshipDelta(ledger,peer,delta,scale?)`, `pairKey`, `directedKey`, `UNIT_TRUST_SCALE{min:0,max:1,neutral:0.5}`.
- BDI components in `@engine/core/ecs`; message bus in `@engine/core/sim` (ontology broadcast + `subscribeOntology`); `Rng.fork(label)` in `@engine/core/runtime`.

### Hollow systems/protocols already present
- Deliberator registration: `registerPersonality(kind, fn)` on `personalityRegistry` (`@hollow/sim-core/agents`); context `{ tick, resources: ResourceWorld }`. Registered: `"villager"`.
- Resources (`@hollow/sim-core/world`): plain-data `ResourceWorld` — `getNode(id)`, `nearestNode(kind,gx,gy)` (deterministic lowest-id tie-break), `harvest(id,amount)`, `regenTick()`; `ResourceKind="food"|"material"`; `GRID_SIZE=64`.
- Community (`@hollow/sim-core/community`): `CommunityRegistry` on `.communities` — `form(memberIds,territory,tick,norms?)`, `get/all/addMember/removeMember/setMembers/setTerritory/contribute(id,kind,amt)/dissolve(id)`. Trust accrual constants: `TRUST_PROXIMITY_DELTA=0.02`, `TRUST_SHARED_NODE_DELTA=0.02`, `TRUST_DECAY_TOWARD_NEUTRAL_RATE=0.01`. Systems: `HollowTrustAccrualSystem`, `HollowCommunitySystem`, `HollowBelongingSystem`.
- Starvation signal (`@hollow/sim-core/protocols`): `beliefs.data.starving:boolean` + `beliefs.data.foodDepletedTicks:number`; edge broadcast `ONT_STARVATION.ONSET {agentId,tick}`. **hollow-05 consumes this to perform starvation death (no despawn happens today).**
- Community events: `ONT_COMMUNITY.{FORMED,JOINED,LEFT,SPLIT,MERGED,DISSOLVED}` + typed bodies.

### Palette (client only; sim-core is render-free)
`games/hollow/client/src/render/hollow-palette.ts` exports `HOLLOW_PAL` (32 shared roles + tone roles: skin `skin/skinMid/skinLight/skinDark/skinDeep`, hair `hairBlack/hairBrown/hairBlonde/hairRed/hairGrey`). Store appearance genes in sim-core as the **role-name strings**; the client maps role→color.

### Architecture notes learned during the build
- Engine has **no `FixedStepClock`** — sim-core is pure tick-counting via `Scheduler.tick(ctx)`; the 20 Hz cadence is owned by the client Worker's `setInterval` (Citadel's real pattern). Update BUILD-ORDER decision #11 wording accordingly at M1 closeout.
- ECS despawn mid-loop is safe (pooled query copy) — but iterate/despawn in **ascending id order** for determinism.
