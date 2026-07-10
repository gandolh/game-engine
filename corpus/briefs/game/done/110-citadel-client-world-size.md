# Brief 110 — The solo world grows to 192×192 (and windowing goes live)

> ✅ **DONE 2026-07-10.** Part 1 `8e930f3`, part 2 `0fd66c0`. Browser-verified on a real WebGPU
> GPU (11/12 checks; the 12th is a missing `favicon.ico` 404). See **Closeout** at the bottom —
> three bugs surfaced that no test could see, and `N` for decision #25 was *measured*, not assumed.

status: **done.** Part 1 landed 2026-07-10 (`8e930f3`); part 2 is this document.
⚠️ **Reshaped 2026-07-10 (second grilling session).** This brief was *"the client must adopt the
server's 256×256 world"*. Decision **#21** deprecated multiplayer, which removed the server as a
consumer; decision **#22** grows the **solo** world to 192×192 instead. The MP-specific half of the
original scope (ship the terrain grid from server to client — decision #14) is **parked with MP**.
source: the [brief 108](../done/108-citadel-live-mp-verification.md) live-MP pass found the original
bug; the second grilling session decided what to do about it.

## What part 1 already did (`8e930f3`)

- `makeIso(worldTilesW, worldTilesH)` returns an `IsoProjection` bound to runtime dims. No module-level
  origin survives to be imported by accident. Threaded through `transform`, `terrain-dither`,
  `window-controller`, `minimap`, `citadel-renderer`, `showcase`, `placement-state`, `main.ts`.
- **Findings item 35 fixed** (it was latent behind the size bug): `visibleTileWindow` divided each iso
  axis by `tileSize` independently — valid only in axis-aligned space. A viewport rect's preimage under
  an iso camera is a *rotated* square; the tile bounds are the bbox of its four inverted corners.
  `windowRegion` now returns the iso bbox of the window's diamonds rather than an axis-aligned
  `tile × TILE_SIZE` rect.
- `shouldWindow` measures **iso** extents (the texture actually allocated). Threshold `2048²` → `4096²`.
- `placement-state` packs tile keys against runtime dims, not the compile-time `WORLD_WIDTH`.

**What part 1 did not do:** nothing generates a world larger than 96×96 in solo, so `shouldWindow` is
still false in practice and the windowed bake is still dead code. That is what this part fixes.

## Why 192×192

Per **#22**. It is the smallest size that crosses the `4096²` iso-pixel windowing threshold, so briefs
21/22's windowed bake and part 1's iso-correct windowing stop being unreachable:

| Solo size | Tiles vs 96 | Iso texture | RGBA | Windows? |
|---|---|---|---|---|
| 96×96 | 1.0× | 3072×1552 | 19 MB | no |
| 160×160 | 2.8× | 5120×2576 | 53 MB | no |
| **192×192** | **4.0×** | **6144×3088** | **76 MB** | **yes** |
| 256×256 | 7.1× | 8192×4112 | 135 MB | yes — width *is* the 8192 GPU cap |

256 was rejected for sitting exactly on WebGPU's default `maxTextureDimension2D` with zero margin.

## Scope

1. **Solo generates a 192×192 world.** `main.ts:1127` calls `generateTerrain(SEED)` with no size args.
   Thread the dims. Consider whether `WORLD_WIDTH`/`WORLD_HEIGHT` should stop being *exported
   constants* at all — an exported constant is what let the client silently disagree with the sim for
   this long. A `WorldDims` value threaded from bootstrap makes the drift unrepresentable.

2. **Replace the remaining compile-time `WORLD_WIDTH` tile-key packing + bounds checks** with runtime
   dims. Part 1 did `placement-state`; still outstanding:
   - [autotile.ts:68](../../../../games/citadel/client/src/render/autotile.ts) — `ty * WORLD_WIDTH + tx`
     is not injective over a wider grid.
   - [coverage.ts:76-103](../../../../games/citadel/client/src/render/coverage.ts) — bounds checks.
   - `clustering.ts` — same packed-key scheme.

3. **`repairSolvability` gains a distance bound** (decision **#25**). It currently guarantees ≥1
   *reachable* Forest and Stone by 4-connected flood-fill. On 96×96 the map bounds the distance; on
   192×192 it does not, so a guaranteed stone can sit far from the core box, across terrain the player
   must road toward with wood they do not have. **The Phase C cold open would open on a living town
   that cannot grow, and no existing test would see it.**

   Guarantee ≥1 Forest and ≥1 Stone within **N tiles of the core box**, painting a blob if absent.
   Pure function of the grid, **no RNG** — the same shape as today's guarantee, sharing `findCoreBox`.
   **Calibrate N from a measured 100-seed distribution of core-box-to-nearest-resource distance at
   192×192** — do not assume a number. Report the distribution in the closeout.

4. **Cold open + camera reframe at 192.** Phase C's `seedTown` anchors near map centre and a
   **solo-only** one-shot camera reframe opens on the *actual seed centroid* at `MAX_ZOOM`. Verify both
   still frame correctly on a 4× map. `findCoreBox` is size-generic (it full-grid scans) — confirm,
   don't assume.

5. **Windowing goes live.** With `shouldWindow` now true in solo: the windowed bake must run, the
   `IncrementalQueue` must drain at ≤ `REBAKE_BUDGET` bakes/frame while panning, and the baked window
   must register with the iso entity layer with **no drift between terrain and sprites**. This is the
   first time this path has ever executed.

6. **Guard `maxTextureDimension2D`.** Nothing in `engine/core/src/render` checks it. A world that
   overflows it should fail loudly at init, not paint black. Add the check while here.

7. **`enableArmy` default → `false`** (decision #23). Two lines, unrelated to the world work, but it
   closes the `launchAttack` trap that superseded brief 112 was going to defuse. **Gate the
   `launchAttack` handler in the same change as the flip** or you create the bug: the handler debits
   `attacker.stockpiles.tools` then pushes an `ArmyState` that an unregistered `ArmySystem` never
   resolves. `army.test.ts` + `pve-gift.test.ts` bootstrap with defaults and must pass explicit
   `enableArmy: true`. *(If this proves entangled, defer it to [brief 113](113-citadel-raid-gets-a-body.md)
   and say so.)*

## Out of scope (parked with MP, decision #21)

- Shipping the terrain grid from server to client (decision #14). **The latent bug it describes is
  real and remains**: `init` carries the *client's* hardcoded `SEED`, and only the first peer's seed
  starts the sim, so a late joiner regenerating from its own constant renders a different world.
  Unreachable while MP is deprecated. Whoever revives MP implements #14 first.
- `boot()` awaiting the server's world message; the MP "connecting…" state.
- Brief 108's carried live-MP checklist items (rival entities render, no iso drift when panning on two
  tabs, building spam hitches neither client). Items 4 and 5 have **solo analogues** that this brief
  must still satisfy — see acceptance.

## Acceptance

- Solo reports `terrain() → 192×192`, bakes terrain across the whole world, and frames it correctly.
  A hall at the world's centre sits on painted terrain, on-screen.
- Placement, hover, coverage overlays and the minimap are correct at `tx,ty ≥ 96` — **no tile-key
  collisions**. A regression test proves the old packing collided.
- `windowed` is **true**; panning re-bakes through `IncrementalQueue` at ≤ `REBAKE_BUDGET` bakes/frame;
  the baked window registers with the iso entity layer with no terrain-vs-sprite drift *(this is brief
  108 item 4 / findings 35, verified in solo)*. Heavy building spam does not hitch *(108 item 5 /
  BUILD-ORDER item 22)*.
- **Cold open holds at 192**: over 100 seeds, `seedTown` places a connected alive core and both a
  Forest and a Stone lie within N tiles of it. 100/100 solvable, 100/100 byte-identical across two runs.
- `enableArmy` defaults false; `launchAttack` is rejected, not queued; `state.armies` never populates.
- ⚠️ **Determinism baseline moves by design** — the world generates at a different size, so terrain,
  clustering, and every downstream sim output change. Prove **reproducibility** MATCH ×3, not equality
  to the old numbers. Multi-seed `EXPORT=json` for the record.
- `npm run typecheck` + `npm run test` green. **Browser-verified via `playtest-citadel`** — windowing
  has never run, so a live pan across the 192 world is the acceptance bar, not a unit test.

## Notes

- Briefs 21/22 (windowed bake, `IncrementalQueue`) have never executed in production. Expect to find
  bugs there that no test has ever had the chance to catch. That is the point of doing this.
- The original brief's six live consequences all descended from one unexamined number — `worldWidth:
  256` in the server. Nobody chose it. The lesson is in decision #22.

---

## Closeout (2026-07-10, `0fd66c0`)

Delivered as specced, plus three bugs the scope did not anticipate. All three share a shape:
**a value derived from a mutable default, or from a world size, that nothing forced to agree.**

### Bug 1 — resource density was keyed to the *mutable default* world size (worst of the three)

`generateTerrain` scaled its resource-blob counts (5 groves / 3 veins, tuned for 96×96) by
`areaScale = width·height / (WORLD_WIDTH · WORLD_HEIGHT)`. But `WORLD_WIDTH` is the **default** —
so the default world *always* scored `areaScale = 1`, however large it grew.

Growing the default to 192×192 therefore quartered resource density across the whole game,
**silently, with every test still green**. Measured over 100 seeds: the walk from the core box to
the nearest grove doubled (forest p50 17 → 41; stone p50 22 → 57, max 152).

Fixed by anchoring to a fixed `RESOURCE_DENSITY_REFERENCE_AREA = 96 * 96`. With density restored,
192×192 looks like 96×96 (forest p50 17 vs 14, p90 34 vs 39).

> This is the trap the brief's own Notes section warned about — *"an exported constant is what let
> the client silently disagree with the sim"* — landing somewhere nobody was looking for it.

### Bug 2 — `tileKey` was non-injective at the map edges, at *every* world size

`tileKey(tx, ty) = ty·WORLD_WIDTH + tx`. `neighbourMask` probes `tx±1`, so at width `W`:

```
tileKey(W,  ty) === tileKey(0,   ty+1)     // east edge sees column 0 of the NEXT row
tileKey(-1, ty) === tileKey(W-1, ty-1)     // west edge sees the last column of the PREVIOUS row
```

A road on the east-edge column reported a connection to a road on the opposite edge one row down.
Never a *visible* bug only because a centred town never touches the map edge. Now a fixed stride
(`TILE_KEY_STRIDE = 4096`) wider than any world, matching the precedent already in
[ambient-crowd.ts](../../../../games/citadel/client/src/render/ambient-crowd.ts).

**Two of the three hardcoded `const W = 96` strides in `sim-bootstrap.test.ts` were passing for the
wrong reason** — a wrong index that happened to hold the expected value. Only the third failed when
the world grew.

### Bug 3 — `launchAttack` was ungated, so the `enableArmy` flip would have *created* a leak

Decision #23 freezes `ArmySystem`. `enableArmy: false` only unregisters the **system**; the handler
still debited `attacker.stockpiles.tools` and pushed an `ArmyState` that nothing resolved or removed.

Proven empirically by removing the gate: 20 `launchAttack` commands leave `state.armies.length === 20`
and the tools gone. The default flip and the handler gate landed in one change, exactly as decision
#15 warned and #23 inherited.

### Decision #25 — the distance bound is measured, N = 70

`repairSolvability` guaranteed resources were *reachable*, not *near*. Over 100 seeds with density
held constant, the 96×96 world's nearest-resource walk distance **never exceeded 67**. So `N = 70`
makes the big world *never worse than the small world ever was*:

| | forest p50 | forest p90 | stone p50 | stone p90 | stone max |
|---|---|---|---|---|---|
| 96×96 | 14 | 39 | 22 | 48 | 67 |
| 192×192 (unbounded) | 17 | 34 | 26 | 62 | **86** |
| 192×192 (N=70) | 17 | 34 | 24 | 53 | **70** |

It repairs ~5% of stone seeds and 0% of forest, so Phase I's resource-poor maps — and the trading
post that exists to serve them — survive. The flood-fill became a BFS to carry walk distance; the
reachable *set* is unchanged, so nothing downstream moved.

### Gates

`typecheck` 0 · **2081 tests** green · Citadel determinism **MATCH ×3** (`0x1a2b3c4d`/`0xc0ffee`/`0x2a`)
· Farm determinism MATCH, untouched.

**The headless Citadel baseline did NOT move**: `pop 9/12, bread 10, gameOver=false` — identical to
the Phase-H baseline. The scripted `grow` scenario places near the core box, so a 4× map does not
shift it. (This also means the headless runner does **not** exercise the resource-distance concern;
`terrain.test.ts` does.)

### Browser verification (the acceptance bar — windowing had never executed)

Real Chrome + WebGPU, dev hook extended with `windowState()`/`camera()`/`panTo()`:

- `terrain()` → **192×192**; `windowed` → **true**.
- Seeded town frames on-screen at boot, on painted terrain (17/17 buildings on-screen).
- Panning to all four corners: **6 re-bakes**, `IncrementalQueue.pending` back to **0** after every
  pan, baked window contained the camera centre **every time**. No void, no black canvas, no hitching.
- A house placed at tile **(100,100)** — past the old 96 bound — lands and renders registered with
  its terrain (no iso-vs-axis drift). This is brief 108 item 4 / findings item 35, verified in solo.

### What did NOT get done (parked with MP, decision #21)

Shipping the terrain grid from server to client (decision #14), `boot()` awaiting the world message,
and brief 108's two-tab MP checklist items. The **late-joiner seed bug is real and still present** in
the deprecated MP path. See [citadel-mp-deprecated.md](../../../wiki/citadel-mp-deprecated.md).
