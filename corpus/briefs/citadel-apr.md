# APR — "Citadel" (medieval city/fortress builder)

> **⛔ SUPERSEDED as design-of-record by the 2026-06-28 cozy pivot.** This APR is the
> **original pressure-game** spec (note "No win; fail = collapse" in decision #3 — the
> *opposite* of the current cozy contract). It remains an accurate record of how Citadel
> was first built and is still useful for the **mechanical substrate** (command queue,
> road connectivity, job-driven walkers, footprints — all unchanged). But for **design
> intent / what Citadel is for**, the current design of record is
> [todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md](../todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md).
> Where they disagree (fail-states, threats-as-bite, player decree levers), the pivot wins.

**Status:** ~~Agreed plan of record~~ → **superseded design-of-record** (see banner). Date: 2026-06-18. Owner: gandolh.
**One-liner:** A medieval *player-planner* city/fortress builder on the existing TS ECS engine. You start with a bounded plot and grow a citadel in real time — lay roads, place multi-tile buildings, run a food+materials economy, keep people happy, and survive periodic sieges.

This is **not** Farm Valley. Farm Valley is an observer sim (you watch BDI agents). Citadel is the inverse: **you** are the omniscient planner; villagers are simulated labor, not competitors.

---

## Locked design decisions (from the grilling)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Agency model | **Player-planner** (true Cities:Skylines). BDI deliberation engine is optional/unused. |
| 2 | Core loop | **All three layered** — logistics + population needs + defense (phased, not all at once). |
| 3 | Pacing & goal | **Open-ended real-time sandbox.** Pause + speed controls (engine has these). No win; fail = collapse. |
| 4 | Command channel | **Command queue into the worker.** Generic deterministic command protocol; the command log *is* the save/replay format and the MP-sync substrate. |
| 5 | Grid & footprints | 16px tiles; **multi-tile building footprints** on a **fixed bounded plot** (start ~64×64–96×96). Walls = 1-wide segments. |
| 6 | Connectivity | **Roads required.** Buildings must be road-connected to function; villagers/carts path along roads (WASM pathfinder). |
| 7 | Villager model | **Job-driven walkers.** Real moving entities with a job + FSM (home→work→haul→home). No BDI deliberation. |
| 8 | Economy spine | **Food + materials + happiness + threat** — four interlocking pressures, phased in. |
| 9 | Defense fidelity | **Spatial siege, abstract resolution.** Raiders path to the citadel; walls/gates reshape routes; clash resolved by deterministic strength calc (no RTS unit micro). |
| 10 | Art | **EDG32 pixel-art via existing atlas pipeline.** Build with **placeholder EDG32 rectangles first**; authored sprites are a later polish workstream. |
| 11 | Packaging | **New sibling packages** (`citadel` client + `citadel-sim-core`), depending only on `@engine/*` — never on farm-valley. Promote genuinely-generic substrate UP into `@engine/*`. |
| 12 | MVP bar | Food+materials loop + roads + footprints + placeholder art. Happiness, then threat/siege, then real sprites are later phases. |
| 13 | Determinism | **Keep it load-bearing.** Commands = replay/save log. No `Math.random`/`Date.now` in sim. Future-proofs save + multiplayer. |

---

## What the engine gives us for free (verified)

REUSE AS-IS: ECS (`@engine/core/ecs`), Scheduler + MessageBus (`/sim`), deterministic Rng (`/runtime`), Camera2D (pan + 0.5–6× zoom), Canvas2D renderer with static-layer baking + culling, atlas loader, **WASM A\* pathfinder** + Perlin noise, animation system, keyboard input, **Worker/snapshot/interpolation architecture**, Vite + npm-workspaces tooling.

INHERIT PATTERN (rebuild semantics): region/grid world model, walkable-grid build, snapshot format, player-control/input layer, feature-collision (→ footprint placement), world generation (RNG+seed).

UNUSED: BDI deliberation registry + farmer personalities (player-planner doesn't need them).

---

## New substrate to build (and where it lives)

Promote to **`@engine/*`** (genuinely generic):
- **Command queue protocol** — main→worker `{type, payload}` commands drained at a fixed scheduler point each tick, applied deterministically. The recorded log = save/replay/MP-sync. *This is the central new engine piece.*
- **Footprint placement system** — multi-tile footprint occupancy, placement validity (fits? clear? overlap? adjacency rule?), and walkable-grid rebuild on placement/removal.
- **Road-connectivity validation** — on build/demolish, recompute reachability and flag disconnected buildings.

Game-specific in **`citadel-sim-core`**:
- Building catalog + footprints (hut, well, mill, granary, chapel, market, storehouse, wall, gate, tower, keep…).
- Job assignment + villager FSM walkers; cart hauling.
- Economy systems: production/consumption (food, materials), storage.
- Happiness/needs + unrest/leave (Phase 3).
- Threat: raider spawn, pathing, deterministic siege resolution (Phase 4).

Game-specific in **`citadel`** (client): build/zone UI, placement ghost + validity preview, HUD (population, stockpiles, happiness, threat), event feed, save/load via command log, home/loading screens.

---

## Known tensions to watch
- **Fixed plot vs open-ended growth** collide once the plot fills. Mitigation: size plot generously; revisit "claim adjacent land" as a milestone unlock if growth stalls.
- **Sandbox vs engine grain.** Farm Valley's fixed-clock scoring is load-bearing; sandbox needs arbitrary-length runs + player-injected commands. The command-queue + deterministic-replay design absorbs this cleanly.
- **"All three layered" is a scope-balloon risk.** Enforced by phasing (below).

---

## Phasing (MVP → full vision)  — revised 2026-06-18 (third grilling)

- **Phase 0 — Skeleton.** New packages wired to `@engine/*`; **terrain world-gen** (seeded plot with water/forest/stone/rough, not flat grass — engine Perlin + region masks); plot renders; camera/pan/zoom; pause+speed; placeholder rectangle rendering. Deterministic worker loop running.
- **Phase 1 — Command queue + placement.** Engine command-queue substrate; footprint placement via worker commands; **terrain-aware validity** (no building on water; resource buildings need the right node); walkable-grid rebuild. *First playable interaction.*
- **Phase 2 — Economy MVP (the v1 bar).** Terrain resource nodes; **Farm→Mill→Bakery bread chain**; Woodcutter-near-forest; road laying + connectivity validation; job-driven villager walkers; physical hauling; pull-model immigration; starvation spiral; **winter-bite seasons** (autumn stockpiling rhythm). 7 buildings: House/Farm/Mill/Bakery/Woodcutter/Storehouse/Road. **← v1 "playable".**
- **Phase 3 — Happiness + governance.** Needs (faith/safety/goods), happiness, unrest/leaving; services (chapel, market); **lightweight decrees/policies** (rationing, conscription, tithe, work hours); **barter trader / Trading Post**.
- **Phase 4 — Threat/siege layer.** Quarry→stone; wood→planks (sawmill) + ore→tools (smith) refining; walls/gates/towers/garrison/keep; raider spawn + pathing; deterministic siege resolution; fail-by-sack.
- **Phase 4.5 — Hazards (fire + disease).** FIRE spreads between close-packed wooden buildings (wells/firefighting + spacing mitigate); DISEASE spreads in crowded/unhappy pop (healer + sanitation mitigate). Spatial threats, separate mechanics from siege.
- **Phase 5 — Tiers + art + polish.** **Settlement tiers** (Hamlet→Village→Town→Citadel→Fortress-City) gated by pop/buildings/defense, each unlocking buildings/decrees + renaming/re-cresting the settlement (this is the progression spine). Authored EDG32 sprites swapped for placeholders; UI polish; save/load via command log.

---

## Resolved details (second grilling, 2026-06-18)

| # | Question | Resolution |
|---|----------|-----------|
| 12 | Plot size / expansion | **~96×96 fixed**, no expansion in v1. Revisit land-claim only if playtests show it fills too fast. |
| 13 | Tile size | **16px** (match Farm Valley). Footprint size carries legibility; zoom covers detail. |
| 14 | Multiplayer | **Single-player v1, MP-ready substrate.** Don't block MP, don't build netcode/lobby now. Generalize `@farm/server` later if wanted. |
| 15 | MVP building set | **House, Farm, Woodcutter, Storehouse, Road** — smallest set that exercises placement+jobs+haul+production+consumption+starvation. Quarry/stone deferred to Phase 4 (walls). |
| 16 | Population | **Pull-model immigration.** Open house slots + food surplus → immigrants arrive over time; deficit/unhappiness → leave/starve. House = pop-cap provider. |
| 17 | Job assignment | **Auto-assign to nearest open reachable job.** No micromanagement. Priority weights are a possible later layer. |
| 18 | Hauling | **Physical haul producer→Storehouse along roads; global pool once stored.** Road layout matters for the produce→store leg; consumers draw from the global pool instantly. |
| 19 | Fail states | **Soft recoverable death spiral; hard game-over at population 0** (and, Phase 4, keep sacked). |
| 20 | Time mapping | **20Hz tick retained; "day" = N ticks** as the balance unit. Per-day rates in briefs. Speed controls multiply tick rate. No engine change. |
| 21 | Placement UX | **Ghost preview + click-to-place; click-drag for roads/walls; demolish mode.** Ghost tinted valid/invalid = placement-validity surfaced visually. |

**No open questions remain.** All build-time decisions are pinned; remaining unknowns are tuning numbers (resolved during Phase 2 balancing).

---

## Feature additions (third grilling, 2026-06-18)

What turns the working sim into a game worth a long sandbox run. Phasing above already places each.

| # | Question | Resolution |
|---|----------|-----------|
| 22 | Terrain | **Varied terrain with resource nodes.** Seeded plot: water/forest/stone/rough ground. Woodcutter near forest, Quarry on stone, build around water. Every seed a different puzzle. (Phase 0 gen, Phase 1 validity, Phase 2 resource-locking.) |
| 23 | Production chains | **Shallow 1–2 step chains**, phased: grain→flour→bread; wood→planks; ore→tools. Banished-depth, not Anno. |
| 24 | MVP chain depth | **Full bread chain in MVP** (Farm→Mill→Bakery, 2 haul legs). The multi-step logistics puzzle IS the game → build it into v1. Phase-2 set grows to ~7 buildings. |
| 25 | Seasons | **Seasons bite:** winter halts farming → autumn stockpiling rhythm. Reuses engine 4-season + visual wash. In the MVP. Weather *events* (drought/storm) parked, not committed. |
| 26 | Threat variety | **Add fire + disease** (Phase 4.5). Spatial threats that punish dense packing / crowding — interlock with happiness + spacing, opposite of what walls reward. |
| 27 | Governance | **Lightweight decrees/policies** (rationing, conscription, tithe, work hours) — each a few modifiers on existing systems. Phase 3. |
| 28 | Coin & trade | **No coin economy.** Physical goods + a periodic **barter trader / Trading Post** as the surplus/shortfall relief valve. Phase 3. (Full coin economy explicitly declined.) |
| 29 | Progression | **Settlement tiers** (Hamlet→Village→Town→Citadel→Fortress-City) gated by pop/buildings/defense; each unlocks content + renames/re-crests the settlement. The no-win progression spine. Phase 5. Prestige-score + run-summary available as a later add (leans on Farm Valley recap tech), not committed. |

**Scope discipline:** v1 (Phase 2) MVP = terrain + bread chain + roads + villagers + winter. Everything else (happiness, decrees, trader, siege, fire/disease, tiers, real sprites) is Phase 3+. The four-pressure vision is the *target*; phasing is the *contract*.

### New tension to watch
- **Feature breadth vs. balancing in a sandbox.** Terrain + chains + seasons + decrees + trader + 2 threat families + tiers is a lot of interacting knobs. Mitigation: every addition is placed in a phase, none land before their dependencies, and tuning is deferred to in-phase balancing — not front-loaded.
