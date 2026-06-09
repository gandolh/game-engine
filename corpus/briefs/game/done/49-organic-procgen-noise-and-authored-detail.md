# Game Task 49 — Organic procgen: coherent noise + authored detail

## Context

World generation today is the **rect-based archipelago** with a purely-constant
**procedural farm band** (16 extra farms on a jittered-free grid), documented in
[world-generation.md](../../../wiki/world-generation.md). It scales the roster but
the world still reads as *placed*, not *grown*: ground texture is **hash noise**
(blocky, spatially uncorrelated — [ground-noise.ts](../../../../packages/farm-valley/src/render/ground-noise.ts)
+ the committed `noise.wasm`), islands are axis-aligned rects, and there are no
authored set-pieces to break the regularity.

A research pass (deep-research workflow, 2026-06-08; PCG-book / Red Blob Games /
Inigo Quilez / GDC, all claims adversarially verified) confirmed the techniques
worth adopting. This brief turns those findings into work. It maps onto the
existing **"research menu"** in world-generation.md — read §"Improving it further"
there first; this brief is the actionable cut of it plus the noise upgrade.

## Goal

Make the world feel grown and partly authored, **without** breaking determinism,
the EDG32 palette, or the `regionAt`/`buildWalkableGrid` model where avoidable.
Six tracks, ordered cheapest-first. Each is independently shippable.

### 1. fBm over the existing noise kernel (Model A, render-only)

Replace single-sample hash noise with **fractional Brownian motion**: sum octaves
with frequency doubling (lacunarity 2) and amplitude halving (gain/persistence
0.5) — `1·noise(f) + 0.5·noise(2f) + 0.25·noise(4f) + …`. *(Red Blob Games,
verified.)* Pure win for ground texture; render-only, no sim/walkability impact.

### 2. Domain warping for organic shapes (Model B prerequisite)

Add Inigo Quilez domain warping — `f(p) → f(g(p))`, `g(p) = p + h(p)`, recursively
`fbm(p + 4·fbm(p + 4·fbm(p)))` — to drive organic terrain outlines from a single
noise function. Fully deterministic and seed-friendly. *(Quilez, verified.)*
This is the coherent-noise source the world-generation menu's "noise-threshold
shapes (Model B)" path was blocked on.

### 3. Coherent-noise kernel: Simplex swap + octave rotation

Perlin shows grid-axis-aligned directional artifacts; **rotate the output of some
octaves, or switch to Simplex** to mitigate. For basic terrain the noise variants
are largely interchangeable, so this is a quality nicety, not a rewrite. *(Red
Blob Games, verified.)* Evaluate against the current hash kernel; do it in JS or
upgrade `noise.wasm` (the committed kernel is hash noise — see world-generation.md §2).

### 4. Constructive layout for guaranteed connectivity (Model A)

Apply **constructive generation** (PCG book Ch.3 — "Constructive generation
methods for dungeons and levels") to region/bridge layout: jittered placement →
spacing, **MST (Prim/Kruskal) over island centers** → connectivity, forced plot
core → reachability, so almost nothing needs rejection (seeded bounded-retry for
residue). Matches today's village-rooted bridge tree; see menu items 1, 3, 4.

### 5. Grammar / L-system vegetation scatter

Prototype **L-systems / grammars** (PCG book Ch.5 — "Grammars and L-systems with
applications to vegetation and levels") for tree/feature scatter, as an
alternative to the current per-tile threshold roll in `tile-features.ts`. Pairs
with the menu's "blue-noise décor scatter" variety item.

### 6. Authored set-pieces over the procedural base (hybrid)

Add **handcrafted set-pieces / prefab stamping** on top of the generated layout —
the handmade-procedural hybrid Mark Johnson covers in *"Handmade Detail in a
Procedural World"* (GDC Europe 2015), which examines balancing authored detail
against generation. Highest "feels designed" payoff; lowest algorithmic risk.

## Files in scope (verify before editing — paths may have drifted)

- [ground-noise.ts](../../../../packages/farm-valley/src/render/ground-noise.ts) — fBm + domain warp (tracks 1–2); render-only.
- [packages/wasm-modules/src/noise.ts](../../../../packages/wasm-modules/src/noise.ts) — coherent-noise / Simplex kernel (track 3); `npm run build-wasm` + commit artifacts if changed.
- [regions.ts](../../../../packages/farm-valley/src/world/regions.ts) — MST bridges / constructive placement (track 4); update `walkable-grid.test.ts` + `regions.test.ts` (they assert exact tile counts + no-adjacency — update together).
- `packages/farm-valley/src/systems/tile-features.ts` — L-system / blue-noise scatter (track 5).
- `packages/farm-valley/src/world/` — prefab/set-piece stamping (track 6); reuse the `coral.ts` deterministic open-water décor pattern.
- Floodfill: `floodfill.wasm` exists but is **unwired** (no host loader) — plain-TS BFS is simpler at this grid size; only wire it if a track needs it.

## Files you must NOT touch

- Engine source incl. the WASM/JS **pathfinder** kernels — configure cost/grid from game code.
- The `regionAt`/`buildWalkableGrid` rect model unless a track explicitly moves to **Model B** (store a generated walkability grid) — that is a flagged, separate decision (world-generation.md §"Model B").

## Determinism guarantee

Everything threads `rng.fork(label)` — **never `Math.random` / `Date.now`** (see
[project_mining_random_determinism] — raw random in ACT paths is a known
nondeterminism bomb; verify at the default `TICKS_PER_DAY`, not just 1200). fBm
and domain warping are pure functions of position + seed. Factor world-gen toward
a pure `generateWorld(seed) → {regions, roads}` so guard tests become multi-seed
property tests. `CHECK_DETERMINISM=1 npm run sim` across `0xc0ffee/1/42` + json diff.

## Acceptance

- `npm run typecheck` + `npm run test` green; palette + (if touched) atlas + walkable-grid count updated.
- Per track shipped: visible in `npm run dev` and determinism MATCHes on replay across 3 seeds.
- world-generation.md updated to reflect which menu items moved from "menu" to "implemented."

## Workflow

Opus plans the slice; Sonnet executes (see [feedback_subagent_workflow]). Tracks
are independently shippable and ordered cheapest-first — **start with tracks 1–2
(render-only fBm + domain warp), highest payoff-per-risk.** Tracks 4–6 are larger
and may each warrant their own follow-up brief once scoped. Read world-generation.md
§"Improving it further" before starting — this brief is its actionable cut, not a
replacement. Do not commit until asked.
