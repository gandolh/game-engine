---
summary: What Citadel is (settlement sim on the shared engine), the 2026-06-28 cozy pivot design-of-record, its packages, sim systems, and shared invariants.
updated: 2026-07-10
---

# Citadel — overview

**Citadel** is the second game in this monorepo, built on the same shared `@engine/core` as Farm Valley. It is a settlement sim: grow a town's economy through settlement *tiers*, keep villagers fed and happy. (It *began* as a settlement/light-RTS with sharp raids/sieges/fire/disease; the **2026-06-28 cozy pivot** — see banner below — reframes those threats as gentle, recoverable texture.) It is younger and more actively-evolving than Farm Valley — treat the briefs/todos below as the live spec and **verify against code** before relying on any detail here.

> **⚠️ DESIGN OF RECORD (2026-06-28): the cozy pivot.** A grilling session resolved
> *what Citadel is for* and reoriented the open work. The design is now:
> **a cozy placement puzzle you read by watching the town live** — arrange a town
> well on terrain (primary heart), watch it breathe (secondary), with **diegetic**
> feedback (mood/smoke/light, not a HUD). The **cozy contract**: *nothing you built
> is taken from you.* Threats don't destroy — they **dent local happiness, which
> taxes productivity to a ~60–70% floor (never zero)**, so recovery is guaranteed
> (no death spiral). The 2026-06-26 sharp-pressure systems (siege morale, interceptors,
> hazard interlocks, fire-as-razing) are **off-spec — frozen, not deleted** (re-wireable
> into a future optional Challenge mode).
> Further locked decisions: **motivation** is emergent player-set goals + diegetic
> recognition, **no score / no quest list** (#7); the player's hand is **placement +
> economic intent**, the town runs all **behavior** autonomously (#8, with a
> *player-operated but staffed* trading post as the clearest example); the **downside
> rule** — every problem is a throttle-to-floor, never a loss (#9); and **terrain is
> the puzzle** — clustered resources + a solvability guarantee (#10).
> Full plan + dependency order:
> [todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md](../todos/closed/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md).
> **Where this page contradicts the cozy pivot below (esp. the "fire punishes tight
> clusters / spacing-vs-density tension is intentional" note), the pivot wins** —
> that was a pressure-game stance.

> **⚠️ DECISIONS OF RECORD #11–#20 (2026-07-10 grilling session) live in [citadel-decisions.md](citadel-decisions.md).** Four of them **reverse** earlier commitments — MP is now a real feature (not "a future mode"), the cozy contract extends to MP, cozy MP drops armies entirely, and Challenge mode owns every sharp system. A "mode" is a call-site preset, never sim state (#19). **They win over the 2026-06-28 text above and over anything below.**

## Packages

- [`@citadel/sim-core`](../../games/citadel/sim-core/) — the deterministic Citadel sim (systems, world/terrain, entities, snapshot). Imports `@engine/core`; never imports a renderer or the Farm packages.
- [`@citadel/client`](../../games/citadel/client/) — the browser client (Vite, port 5174). Unlike Farm Valley (which runs its sim server-side), **Citadel runs the sim in an in-browser Web Worker** ([sim-worker.ts](../../games/citadel/client/src/worker/sim-worker.ts)) and posts snapshots to the main thread over `postMessage`.
- [`@tool/citadel-sim`](../../tools/citadel-sim/) — headless Citadel sim runner (`npm run sim:citadel`). Drives `bootstrapSim()` directly (no Worker). Ships several scenarios via the `SCENARIO` env var: `grow` (default), `starve`, `siege`, `sack`, `fire`, `disease`.

## Sim systems

Registered in [sim-bootstrap.ts](../../games/citadel/sim-core/src/sim-bootstrap.ts). The system files live in [systems/](../../games/citadel/sim-core/src/systems/):

- **Economy / population**: `production`, `villager-system`, `immigration`, `needs-happiness`, `trader`, `tiers` (settlement-tier progression with thresholds + locks), `road-connectivity`, `day-clock`.
- **Threats**: `raid-spawn`, `raider-movement`, `siege-resolution`, `fire-system`, `disease-system`. **Cozy-demoted (2026-07-01, Phase D):** under the default `cozyThreats:true` bootstrap option, fire smoulders→extinguishes (never razes), disease slows→recovers (never kills), raids pilfer stockpile goods→leave (never sack/gameOver), and each threat dents *local happiness* (→ the Phase-B productivity floor) instead of destroying. The destructive path is **frozen behind `cozyThreats:false`** (byte-identical) for a future Challenge/MP mode. **Cozy cold-open (2026-07-01, Phase C):** solo also passes `deferThreatsUntilBuildings:6`, so fire ignition / disease onset / raid scheduling are suppressed until the town owns ≥6 non-road buildings (the seed is 5) — the forgiving opening. Default 0 = off (headless/MP/baseline unchanged); the gate short-circuits before any RNG draw.

> **Build cost (2026-06-30, cozy economy).** Placing a building can cost materials —
> `BUILD_COST` per type in [building.ts](../../games/citadel/sim-core/src/entities/building.ts)
> (cold-open buildings cheap + **wood-only**; stone/tools only on late refiners/defence; roads/
> gates/walls/bridges free). `placeOne` checks affordability up front (rejecting `"cost"`) and
> **debits only on success**. **Opt-in** like `enforceTerritory`: `bootstrapSim({ chargeBuildCost,
> startingStock })` — default OFF, so headless/tests/the determinism baseline are unchanged; the
> **solo client** turns it ON (worker bootstrap) with a founding `{ wood: 40 }` grant, and the build
> bar shows the cost on hover + greys unaffordable buttons live (`!useServer` only — MP placement
> stays free). The save persists both options so save→replay stays identical.

Terrain + walkability come from [world/terrain.ts](../../games/citadel/sim-core/src/world/terrain.ts) (`generateTerrain`, `isWalkable`, `TerrainType`); villagers are defined in [entities/villager.ts](../../games/citadel/sim-core/src/entities/villager.ts).

## Shared invariants

Citadel obeys the same engine-level rules as Farm Valley:
- **Determinism** via the seeded [`Rng`](../../engine/core/src/runtime/rng.ts) — no `Math.random`/`Date.now` in sim code; tick output depends only on tick count. `bootstrapSim()` stays transport-agnostic (Worker, headless).
- **EDG32 palette** enforced by the same guard test (it now walks `engine/`, `games/`, `tools/`).

## Status notes (verified 2026-06-21)

First real-GPU solo playtest (prior reviews were headless): **WebGPU renders correctly**
(terrain + sub-tile dither, building/villager sprites, HUD, day/night) and the full v1
loop works — spaced, road-connected economy → founder → bread chain → immigration →
stable growth (verified to Day 199). Three solo-blocking bugs were fixed (see the
2026-06-21 log entry): Well/Healer were missing from the toolbar (the only fire/disease
mitigation, unbuildable); placement commands were dropped while paused; speed buttons
didn't resume. **Plan-while-paused** now works via `CitadelSimResult.applyCommands(ctx)`
(off-tick, determinism-safe). Two gotchas remain for players (not bugs): bootstrap is
**founding-window-gated** (place a connected economy early or deadlock), and **fire
punishes tight clusters** by design — space buildings ~5–8 tiles and connect with roads
(roads are firebreaks). MP-RTS live wiring holes from [todo 38](../todos/closed/2026-06-19-citadel-38-implementation-review-problems.md)
are still open (solo is unaffected).

> **⚠️ MP renders only a 96×96 corner of its 256×256 world** (found live 2026-07-10,
> [brief 108](../briefs/game/done/108-citadel-live-mp-verification.md)). The server runs 256×256
> but the *client* is hardcoded to 96×96 — `main.ts` calls `generateTerrain(SEED)` with no size
> args, and `iso.ts`'s `ISO_ORIGIN_X`/`ISO_WORLD_W`/`ISO_WORLD_H` are compile-time consts. Players
> are silently confined to the top-left corner by the placement bounds check; anything the sim puts
> outside it (raiders spawn at the true map edges) lands off-canvas. Consequently `shouldWindow` is
> always false, so briefs 21/22's windowed bake **never executes** in production. **Solo is 96×96
> and entirely correct — every symptom is MP-only.** Fix is [brief 110](../briefs/game/done/110-citadel-client-world-size.md);
> don't trust MP render behaviour until it lands.
>
> Mode-dependent sim rules must read the bootstrap-time `multiplayer` option, **not**
> `state.players.length` — a room is founded by one peer and grows, so a live count misclassifies
> the founder. That mistake made the founder's town-hall skip the raid anchor (brief 108).

> **⚠️ The "founding-window-gated cold open" gotcha above is RESOLVED by cozy-pivot Phase C
> (2026-07-01).** Solo now **opts into `seedTown:true`** (a pre-seeded connected alive core placed
> at bootstrap) so the town is alive from tick 0 — the founding deadlock is structurally
> impossible, no early connected-economy race. Solo also passes `deferThreatsUntilBuildings:6`, so
> fire/disease/raids stay off until the town grows past the 5-building seed. Both flags default OFF
> (headless/MP/baseline unchanged). See the Phase C log entry.

## HUD, overlays & rendering

Split out on 2026-07-09 to keep this page navigable:

- [citadel-hud-and-overlays.md](citadel-hud-and-overlays.md) — HUD bar, goods strip, build bar, inspect panel, minimap, notifications.
- [citadel-rendering.md](citadel-rendering.md) — the WebGPU render path, sprite batching, terrain baking, road/bridge networks.

## Briefs & todos

There is no Farm-Valley-style "done brief" archive for Citadel yet; work is tracked as todos. See [briefs/citadel-apr.md](../briefs/citadel-apr.md) and the `corpus/todos/*citadel-*` files (e.g. the `citadel-00-BUILD-ORDER` epic and the 21–33 series: windowed-grid render, incremental build queue, PlayerState refactor, territory/influence, PvP armies, per-player PvE). Fold durable Citadel findings into this page as the design settles.

> **⛔ SUPERSEDED by the 2026-06-28 cozy pivot.** The two notes below describe the
> **pressure-game** design and its tuning. The pivot reframes both — kept here for
> history, but **do not treat them as current intent.** Current design of record:
> [todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md](../todos/closed/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md).

**~~Design — spacing-vs-density tension is intentional (2026-06-22).~~** *(SUPERSEDED —
**shipped 2026-07-01, Phase D:** fire is now gentle texture — a building smoulders and dents
nearby-house mood, then **extinguishes; it never razes** (gated by `cozyThreats:true`,
default). Density is no longer punished; the placement puzzle's tension now rests on
**terrain** (decision #10, Phase I — not yet built), not on fire. See the Phase D log entry +
decision #5.)* Fire
"punishes tight clusters" (space wooden buildings ≥5 tiles, connect with roads as
firebreaks), while happiness service-radius (8) and road-connectivity reward
keeping buildings *close*. These pressures pull against each other **by design** —
managing that tradeoff (spread for fire-safety, but not so far that coverage/
connectivity break, and use wells) is core to the game, not a bug to tune away.
The `playtest-citadel` skill's default build plan is laid out with this in mind
(≥6-tile grid + wells). Legibility of *where* coverage fails is still a fair
ask (see the playtest-findings P2 todo).

**The two-way service loop (brief 100, 2026-07-10 — both halves now exist).** A producer's
per-cycle output is scaled by **one curve**, `bufferServiceFactor(buffer, cap, serviceEma)`
in [production.ts](../../games/citadel/sim-core/src/systems/production.ts), not by a throttle
and a bonus fighting each other. Above the 0.6 fill knee it *is* the Phase-H stockpile-pressure
throttle, ramping down toward the `0.6` floor as goods back up at the door. Below the knee, a
building whose rolling service EWMA (`serviceEma`, sampled once per **emitted** cycle) clears
`SERVICE_BONUS_BAND = 0.75` ramps up to `PRODUCTIVITY_BONUS_CEIL = 1.25`. Thriving outproduces
starved by `1.25 / 0.6 ≈ 2.08×`; nothing ever returns 0 (downside rule #9). Service coverage also
re-weights the immigration roll (`arrivalFactor`), so a stocked-but-stagnant town stops attracting
people — happiness alone now tops out at `0.9`, and service carries the last `0.1`.

Two facts worth not re-deriving. **The EWMA is sampled at the emit, never at the cycle timer** —
a starved converter's buffer is empty *because it never produced*, and sampling early let a
flourless bakery read as perfectly served. **The remainder carry is scoped to the service factor
only**: floating all four multipliers and flooring once was measured to move `grow` population
9–10 → 14 by itself, dwarfing the mechanic and silently re-tuning happiness / town-hall / seasonal
grain. Scoped, the same run lands at 12 and `outputRemainder` stays 0 for any building not earning
the bonus. Legibility: `BuildingSnapshot.wellServed` → a breathing cream ground pool
(`wellServedGlowQuads`), day and night.

**~~Economy — load-bearing facts (verified 2026-06-22).~~** *(SUPERSEDED by pivot Phase
H: buildings go **single-slot** (no wasted-mouth trap), winter grain is floored ~×0.5
(**never 0**), and unhappiness throttles output to a ~60–70% floor (**never 0**) — the
old "death-spiral" framings below no longer apply. The per-building / one-bakery-caps-food
facts are still accurate to the **current** code until Phase H ships.)* Production output is
**per-building, gated only on `workerCount > 0`** — a building's *second* worker
slot adds a population mouth with **zero extra output**, so growth tracks the
number of *staffed buildings*, not filled slots. One bakery caps the food supply
at **6 bread/day** (feeds ~6); to grow past that, build *more bakeries* (the mill
already out-produces one bakery). Worker assignment (`villager-system.ts`) staffs
**goods-producing buildings before pure services** (chapel/market/watchpost have a
worker slot but no `inputGood`/`outputGood`) — otherwise services starve the bread
chain of labour and the town death-spirals. Founding spawns one worker **per
unstaffed connected building**; the per-founder `+5` bread ration is load-bearing
for bootstrap (the 3-building bread chain produces nothing until all three are
staffed). See the 2026-06-22 fix log entry.

**Playtest/UX todos (2026-06-22):**
- [playtest-findings](../todos/2026-06-22-citadel-playtest-findings.md) **(partial)**
  — growth death-spiral, silent placement rejects, and tier-lock cold-open spam are
  **fixed**; `grow` now holds pop 10–11/12 through a full year. Root cause was
  goods-vs-service worker priority (above), *not* the service-range hypothesis.
  Still open: zero-coverage service feedback (P2) and disease counterplay (P3).
- [road-routing-around-buildings](../todos/closed/2026-06-22-citadel-road-routing-around-buildings.md)
  **(done)** — road drag now detours around footprints via a bounded A*
  (`routeRoadPath`), treats water as bridge-passable, falls back to L + toast.
- [minimap-rotate-viewport-rectangle](../todos/closed/2026-06-22-citadel-minimap-rotate-viewport-rectangle.md)
  **(done)** — minimap redrawn in iso world-px; the camera viewport is now an
  upright rectangle.
