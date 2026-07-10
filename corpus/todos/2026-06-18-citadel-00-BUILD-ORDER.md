---
title: "Build order + dependency graph for Citadel (medieval city/fortress builder)"
created: 2026-06-18
status: reference
tags: [planning, citadel]
---

# Build order — Citadel

New game on the existing engine. Full design of record: [briefs/citadel-apr.md](../briefs/citadel-apr.md).
Grilled to zero open questions on 2026-06-18 (all decisions in the APR + each todo's
"Decisions (grilled 2026-06-18)" section).

**Premise:** player-planner medieval city/fortress builder. You grow a citadel on a
~96×96 plot in real time: lay roads, place multi-tile buildings, run a food+materials
economy, keep people happy, survive sieges. Open-ended sandbox. Single-player v1,
MP-ready substrate. Determinism load-bearing — command log = save/replay/MP-sync.

## Strictly sequential phases (each gates the next)

Revised 2026-06-18 (third grilling — feature additions folded in: terrain, bread chain,
seasons, decrees, trader, fire/disease, settlement tiers).

- **[Phase 0 — Skeleton + terrain](2026-06-18-citadel-01-phase0-skeleton.md)** — new `citadel` +
  `citadel-sim-core` packages on `@engine/*` only; **seeded varied terrain** (water/forest/
  stone/rough via engine Perlin); 96×96 plot renders; camera pan/zoom; pause+speed;
  deterministic 20Hz worker loop; placeholder-rectangle render. *Gates everything.*
- **[Phase 1 — Command queue + placement](2026-06-18-citadel-02-phase1-commands-placement.md)**
  — engine command-queue substrate (main→worker, drained per tick, deterministic);
  footprint placement + **terrain-aware** validity + walkable-grid rebuild; ghost-preview
  click-to-place. *First playable interaction. Gates Phase 2.*
- **[Phase 2 — Economy MVP (v1 PLAYABLE)](2026-06-18-citadel-03-phase2-economy-mvp.md)**
  — terrain resource nodes; **Farm→Mill→Bakery bread chain**; Woodcutter-near-forest; road
  laying + connectivity validation; job-driven walkers (auto-assign); physical hauling;
  pull-model immigration; starvation spiral; **winter-bite seasons**. 7 buildings:
  House/Farm/Mill/Bakery/Woodcutter/Storehouse/Road. **← the MVP bar.** *Gates Phase 3.*
- **[Phase 3 — Happiness + governance](2026-06-18-citadel-04-phase3-happiness.md)** — needs
  (faith/safety/goods), happiness, unrest/leaving; services (chapel, market); **decrees/
  policies** (rationing/conscription/tithe/work-hours); **barter trader / Trading Post**.
  *Builds on Phase 2 economy.*
- **[Phase 4 — Threat/siege layer](2026-06-18-citadel-05-phase4-siege.md)** — Quarry→stone,
  Sawmill→planks, Smith→tools; walls (1-wide) / gates / towers / garrison / keep; raider
  spawn + pathing; deterministic siege resolution; fail-by-sack. *Builds on Phase 2 roads/pathfinding.*
- **[Phase 4.5 — Hazards (fire + disease)](2026-06-18-citadel-055-phase45-hazards.md)** —
  fire spreads through dense wooden packing (wells/spacing mitigate); disease spreads in
  crowded/unhappy pop (healer/sanitation mitigate). *Spatial threats; builds on Phase 3 happiness + grid proximity.*
- **[Phase 5 — Tiers + art + polish](2026-06-18-citadel-06-phase5-art-polish.md)** —
  **settlement tiers** (Hamlet→Village→Town→Citadel→Fortress-City) as the progression spine;
  authored EDG32 sprites swapped for placeholders; save/load via command log.
  *Last; non-blocking for "is it a game".*

## Substrate to promote into `@engine/*` (not game-specific)

Identified during Phases 1–2; promote up so the game stays thin and Farm Valley could
later adopt them:
- **Command-queue protocol** (Phase 1) — deterministic main→worker commands; log = save/replay/MP.
- **Footprint placement system** (Phase 1) — multi-tile occupancy, validity, walkable rebuild.
- **Road-connectivity validation** (Phase 2) — reachability recompute + disconnected-flagging.

## Invariants (do not violate — see CLAUDE.md + decisions.md)

- EDG32 palette enforced (placeholder rects use `EDG.*` too).
- No `.js` import suffixes; pinned versions; TS strict.
- Engine never imports game; `citadel` never imports `farm-valley`/`@farm/sim-core`.
- No `Math.random`/`Date.now` in sim — all randomness via seeded `Rng`.
- bootstrapSim stays Worker-agnostic (headless run-sim + tests drive it directly).

## ✅ STATUS (updated 2026-06-19): depth pass + render wave SHIPPED

All 17 actionable post-v1 briefs are **Done** and merged to main (07/08/09/10/14 + 11/12/13/15/16/17/18/19/20/24/25/27) — closed in [todos/closed/](closed/), logged in [../log.md](../log.md). **20** was satisfied by construction (27 already routes every draw through the sprite-batch); **24** shipped only its render-only fire-soot slice (full WGSL wear shader + sim age field deferred). Verified: `@citadel/sim-core` 120/120, `citadel` 124/124, palette 6/6, typecheck + `build -w citadel` clean. **⚠️ Render visuals are unverified — WebGPU can't render headless here; a real-GPU eyeball is pending (per-brief lists in the closed briefs).**

### Multiplayer RTS epic (grilled 2026-06-19) — briefs 28–37 + 21/22

A grilling pass (2026-06-19) turned the old narrow brief 26 (presence/bots/emotes) into a **competitive/co-op RTS multiplayer mode** for Citadel. 26 is **superseded** (→ closed/); **23** is **WON'T-DO** (→ closed/, Canvas2D micro-opt moot under WebGPU); **21/22** are now **UN-PARKED** (the committed 256×256 MP world is the consumer). Locked design: server-authoritative single sim + multi-writer command-log; `PlayerState[]` refactor (`ownerId` on entities); 256×256 world + town-hall anchor + influence-radius territory; launch-attack PvP armies on the shipped raider/siege math (town-hall sack = elimination); one-way gift transfers (no formal alliances); PvE (NPC raiders + hazards) stays on per-player; presence + emotes + seeded lobby bots. Decomposed into an ordered, dependency-aware backlog:

- **Spine:** A(28) → B(29) → {C(30), D(31), H(35)} → {E(32), F(33), G(34), I(36), K(21/22)} → J(37).
- [28 PlayerState[] refactor](2026-06-19-citadel-28-playerstate-refactor.md) *(A — gates all)* · [29 world-256 + town-hall](2026-06-19-citadel-29-world-256-townhall.md) *(B)* · [30 territory influence](2026-06-19-citadel-30-territory-influence.md) *(C)* · [31 pathfinder perf](2026-06-19-citadel-31-pathfinder-perf.md) *(D — NEW, surfaced by 256²+PvE)* · [32 PvP armies](2026-06-19-citadel-32-pvp-armies.md) *(E)* · [33 per-player PvE](2026-06-19-citadel-33-per-player-pve.md) *(F)* · [34 gift/transfer](2026-06-19-citadel-34-gift-transfer.md) *(G)* · [35 @citadel/server multi-writer](2026-06-19-citadel-35-citadel-server-multiwriter.md) *(H — netcode)* · [36 presence + roster + emotes](2026-06-19-citadel-36-presence-roster-emotes.md) *(I)* · [37 NPC lobby bots](2026-06-19-citadel-37-npc-lobby-bots.md) *(J)* · [21 render-windowed](2026-06-19-citadel-21-render-windowed-grid.md) + [22 incremental build queue](2026-06-19-citadel-22-incremental-build-queue.md) *(K — now un-parked)*.

## Depth pass — post-v1 (2026-06-19)

Citadel is feature-complete (Phases 0–5). This **depth pass** was scoped by grilling
(2026-06-19) after mining ideas from `jasonkneen/tiny-world-builder`. Direction: **depth-first**.
Sequence: **07 → 08**, then **09 + 10 in parallel**. Every brief is sim-touching → each gates
on a fast multi-seed `EXPORT=json` determinism re-proof (run only with user OK).

- **[07 — Enforce tier-lock](2026-06-19-citadel-07-tier-lock-enforcement.md)** *(do first)* — `TIER_LOCK` is dead code; Phase-5 progression is currently cosmetic. Enforce at placement + grey/tooltip palette + EDG-guard the citadel package.
- **[08 — Building upgrades](2026-06-19-citadel-08-building-upgrades.md)** *(needs 07)* — material-cost, tier-gated L1→L3 (House/production/defense). tiny-world's *stacking* mechanic; gives the refining chain a sink.
- **[09 — Interlocking decrees](2026-06-19-citadel-09-interlocking-decrees.md)** — make the `tithe`/`conscription` stubs real (goods-reserve→trade/relief; villagers→raid-defense @ production cost). No coin (APR #28).
- **[10 — Hauler rerouting](2026-06-19-citadel-10-hauler-rerouting.md)** — lazy next-step path validation + deterministic FIFO replan budget. tiny-world's *vehicle dynamic-rerouting*, recast.

## Renderer pivot + render wave (mined 2026-06-19; reshaped by a second grilling)

**Strategic decision (grilled 2026-06-19): Citadel goes WebGPU-only — drop Canvas2D.** The
foundational port **leads the render track**; the sim-side **depth pass (07–10) is
renderer-agnostic and runs in PARALLEL**. The `@engine` WebGPU stack (renderer + tint / weather /
cloud / static-layer / sprite-batch / particle-batch passes + WGSL) is consumed directly; generic
FV-side helpers (light pool, ambient layer, focus-cam, day/night controller) are **promoted up
into `@engine/*`** so both games share them (no game→game import). All render-wave briefs are
**WebGPU-native, render-only, EDG32-safe, off-sim RNG → zero determinism risk** unless noted.

**▶ FOUNDATIONAL — first on the render track:**
- **[27 — WebGPU renderer port](2026-06-19-citadel-27-webgpu-renderer-port.md)** — drop Canvas2D; render via the `@engine` WebGPU renderer; placeholder rects → quads. **Unblocks everything below.**

*Interleave with the depth pass (chosen 2026-06-19) — ride on 27:*
- **[11 — Adjacency autotiling](2026-06-19-citadel-11-adjacency-autotiling.md)** — roads/walls 4-neighbour bitmask → variant quads via `sprite-batch`. Crib FV `computeShores`/`computeWalls`.
- **[13 — Sub-tile terrain variation](2026-06-19-citadel-13-subtile-terrain-variation.md)** — bake-time dither into the `static-layer-pass` texture off the existing `SeededNoise` table.
- **[15 — Day/night wash + light pool](2026-06-19-citadel-15-daynight-wash-light-pool.md)** — engine `tint-pass` + **promote a light pool to `@engine`**; near-direct FV reuse.
- **[18 — Ambient crowd](2026-06-19-citadel-18-instanced-ambient-crowd.md)** — **promote FV `AmbientLayer` to `@engine`**; WebGPU-instanced; density by tier; NOT ECS entities.

*Backlog — ride on 27:*
- **[16 — Weather FX](2026-06-19-citadel-16-weather-particle-fx.md)** — consume engine `weather-pass` + `cloud-shadow-pass`. *(visual only — weather events stay APR-parked #25)*
- **[17 — Placement + idle easing](2026-06-19-citadel-17-placement-idle-easing.md)** — ease-in placement; smoke via `particle-batch`; sway/bob.
- **[19 — Follow-cam](2026-06-19-citadel-19-follow-cam.md)** — **promote FV focus-cam to `@engine`**; lock-follow a villager. *(first-person walk = 3D-only, scoped out)*
- **[20 — Batched sprite draws](2026-06-19-citadel-20-sprite-batch-renderer.md)** — building/villager draws via engine `sprite-batch`. *(un-gated by the WebGPU decision)*
- **[24 — Wear/decay overlay](2026-06-19-citadel-24-wear-decay-shader-overlay.md)** — engine `tint-pass` + WGSL noise; ties into fire damage. *(un-gated)*
- **[25 — Settings modal](2026-06-19-citadel-25-settings-modal.md)** — tabbed/a11y/search; toggles the render features. *(chrome; after 15/16/18)*
- **[12 — BFS building clustering](2026-06-19-citadel-12-bfs-building-clustering.md)** — adjacent houses → composite silhouette. *(speculative; low priority)*

*Sim-side (determinism re-proof) — independent of the renderer:*
- **[14 — Edge-coherent terrain](2026-06-19-citadel-14-edge-coherent-terrain.md)** — rivers read as continuing off-map (pure-coord edge fns). Touches `terrain.ts`. *(NOT infinite terrain — fixed 96×96)*

*⚠️ Parked — premature on WORLD SIZE (not the renderer); revisit only if a larger world is committed:*
- **[21 — Render-windowed sparse grid](2026-06-19-citadel-21-render-windowed-grid.md)** · **[22 — Incremental build queue](2026-06-19-citadel-22-incremental-build-queue.md)** — no consumer at 96×96.

*✖ Cut / deferred:*
- **[23 — Quantized opacity caches](2026-06-19-citadel-23-quantized-opacity-caches.md)** — **WON'T DO**: Canvas2D `globalAlpha` micro-opt, moot under WebGPU-only.
- **[26 — Multiplayer epic](2026-06-19-citadel-26-multiplayer-presence-bots-emotes.md)** — APR-deferred (#14); future epic needing its own grilling. Web3 wallet/auth out of scope.

## ✅ MP-RTS EPIC STATUS (2026-06-19) — spine 28→37 shipped; 21/22 cores

The decomposed multiplayer-RTS epic was ground end-to-end. **10 of 12 items DONE +
verified + closed**; the 2 render-perf items have their cores shipped + tested
(engine WebGPU integration is GPU-pending). Every sim-touching change was proven
behavior-preserving: solo Citadel (1-player) is **byte-identical** to the pre-epic
baseline across grow/siege/sack/fire/disease (seeds 1,7) at `TICKS_PER_DAY=20`.

- **A 28** PlayerState[] refactor + ownerId — DONE (closed). Determinism proof.
- **B 29** 256×256 configurable world + town-hall anchor — DONE (closed).
- **C 30** influence-radius territory + (opt-in) build-gating — DONE (closed).
- **D 31** pathfinder perf (persistent buffer, route-equivalent) — DONE (closed).
- **H 35** @citadel/server multi-writer netcode + client WS transport — DONE (closed).
- **E 32** PvP armies (launch-attack, siege-math resolution, town-hall sack =
  elimination) — DONE (closed).
- **F 33** per-player PvE (raiders/hazards already per-player from 28) + independent
  per-player raid/hazard RNG — DONE (closed).
- **G 34** one-way gift/transfer — DONE (closed).
- **I 36** presence/roster/emotes (ephemeral, OFF the command log) — DONE (closed).
- **J 37** seeded NPC lobby bots (join as peers; reproducible) — DONE (closed).
- **K 21/22** render-window + per-frame build-budget — **cores shipped + tested + wired**
  (`games/citadel/client/src/render/render-window.ts`, `build-budget.ts`;
  `windowController.update(camera)` now runs each frame at `main.ts:1221`), but the runtime
  is **unreachable in production**, so the GPU-runtime verification cannot be performed as
  written. Resolved 2026-07-10 by the [brief 108](../briefs/game/done/108-citadel-live-mp-verification.md)
  live-MP pass: the *client* is hardcoded to a 96×96 world, so `shouldWindow` is always false
  and the windowed path never executes — panning re-bakes nothing, because nothing is
  windowed. Both todos are in `closed/`; their remaining GPU verification is now owned by
  [brief 110](../briefs/game/todo/110-citadel-client-world-size.md), which fixes the client
  world size and makes the windowed bake iso-correct (review findings item 35).

**Verification ceiling** (updated 2026-07-10). The sim + netcode + bot logic is unit-tested +
determinism-proven headless. **Now verified live** (brief 108, two real browser tabs on `?mp`
plus a raw-WS harness): room lifecycle — join, late-join replay, owner handoff, reap grace,
fresh re-join — and per-player threat attribution, which turned up and fixed a raid-anchor bug.
**Still NOT verified:** the WebGPU render of the MP entities (armies, team colours, presence
cursors) and the 21/22 windowed-bake runtime — both blocked on brief 110, since MP currently
renders only a 96×96 corner of its 256×256 world.
