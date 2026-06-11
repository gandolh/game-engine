# Brief 77 — Building 3D depth (weather-station + others) and farm-island houses

**Status:** Todo · **Area:** `tools/atlas-builder` (pixel recipes) + `packages/sim-core` (placement) · **Drafted:** 2026-06-11 · **Type:** render/asset-only (no sim, no determinism impact)

Two related art/placement asks:

1. The **weather-station house reads flat** — it looks like a painted rectangle on the ground, not a building with volume.
2. **Farm islands want a house.** Named/owned farms already get one; the *procedural* farm islands have none.

This is research + a plan only. All changes are pixel recipes baked into the atlas + static placements — **the sim worker, scheduler, and seeded RNG are untouched**, so determinism is unaffected (still re-verify with the fast 3-day/3-seed `EXPORT=json` diff after, out of caution).

## Read first

- [tools/atlas-builder/src/recipes/assets/structure/weather-station.ts](../../../../tools/atlas-builder/src/recipes/assets/structure/weather-station.ts) — the flat building (48×32 px, 3×2 tiles).
- [tools/atlas-builder/src/recipes/assets/structure/forge-house.ts](../../../../tools/atlas-builder/src/recipes/assets/structure/forge-house.ts) — the **gold standard for depth** (32×48 px): pitched roof + tall front-wall elevation. This is the look to copy.
- [tools/atlas-builder/src/recipes/assets/structure/carpenter-workshop.ts](../../../../tools/atlas-builder/src/recipes/assets/structure/carpenter-workshop.ts) — the other tall building; same depth recipe as forge-house.
- [tools/atlas-builder/src/recipes/assets/structure/home.ts](../../../../tools/atlas-builder/src/recipes/assets/structure/home.ts) — the existing farmer house (16×16 px), a tiny near-top-down cottage; minimal depth.
- [tools/atlas-builder/src/recipes/palette.ts](../../../../tools/atlas-builder/src/recipes/palette.ts) — the swatch char → EDG32 RGBA map every recipe draws from. **No literal hex; only these chars.**
- [packages/sim-core/src/render-systems/geometry.ts:410-423](../../../../packages/sim-core/src/render-systems/geometry.ts#L410-L423) — `BIG_STRUCTURES`: where tall buildings are placed, **bottom-anchored** at `baseTileY` (the building rises *up* from its footprint, which is what sells the elevation).
- [packages/sim-core/src/render-systems/static-layer.ts:187-199](../../../../packages/sim-core/src/render-systems/static-layer.ts#L187-L199) — `iterStaticSprites()` emits each `BIG_STRUCTURES` entry into the baked static layer (`layer: 5`, center computed so the sprite's bottom edge sits at the tile bottom).
- [packages/sim-core/src/world/region-setup/setup.ts:93-101](../../../../packages/sim-core/src/world/region-setup/setup.ts#L93-L101) — the per-farm home spawn: **only runs `if (ownerId !== undefined)`**, placed at the farm's `(maxX-1, maxY-1)` corner with `frame: "structure/home"`, `layer: 40`.
- Root [CLAUDE.md](../../../../CLAUDE.md) — EDG32 palette enforced (guard test scans source for off-palette literals); re-run `npm run build-wasm` is **not** needed (this is the atlas builder, not wasm), but the atlas must be rebuilt so the new pixels bake in.

## Diagnosis — why the weather-station looks flat (and forge-house doesn't)

The depth cue in this game is entirely **silhouette + top-left directional shading**, drawn into the sprite itself (there is no isometric projection, no runtime side-face, no drop-shadow geometry). A building reads as 3D when its sprite has **two visually distinct planes**: a *roof plane* on top and a *front-wall plane* below it, with the wall taller than one tile so the eye reads a vertical face.

- **forge-house** ([forge-house.ts:10-51](../../../../tools/atlas-builder/src/recipes/assets/structure/forge-house.ts#L10-L51)) does exactly this: rows 5–13 are a **pitched roof** that widens downward in structure-blue (`S`) with a lit top edge (`s`) and a chimney; rows 14–41 are a **tall front wall** (`Q`/`q`/`d`/`D`) with framed edges, door, and lit windows. 48 px tall, bottom-anchored → it visibly *stands up* off the ground.
- **weather-station** ([weather-station.ts:11-44](../../../../tools/atlas-builder/src/recipes/assets/structure/weather-station.ts#L11-L44)) is the opposite: a **flat roof slab** (rows 2–10, a solid `S` rectangle with one `N` shadow pixel) sitting directly on a **flat wall band** (rows 11–28), only 32 px tall and 48 wide. A wide, short, flat-topped rectangle reads as a *rug*, not a roof. The single bottom-right shadow pixel (`N`) is the only depth cue and it's lost at this size.

So "more 3D" = give the weather-station (and optionally the small `home`) the **forge-house treatment**: a pitched/hipped roof on top, a taller front wall, lit upper-left edge, shadowed lower-right edge, and an eave overhang line where roof meets wall.

## Palette vocabulary for depth (chars from [recipes/palette.ts](../../../../tools/atlas-builder/src/recipes/palette.ts))

All EDG32. Use the light/dark pairs to fake a light source from the upper-left:

| role | light | mid | dark |
|---|---|---|---|
| stone (walls/roof) | `q` #c0cbdc | `Q`/`S` #8b9bb4 / #5a6988 | `N` #262b44, `k` #181425 |
| wood (trim/door) | `d` #b86f50 | `H` #c28569 | `D` #733e39, `M` #3e2731 |
| roof red (cottage) | `r` #be4a2f | — | `x` #a22633 (shadow side of red) |
| warm highlight | `h` #e8b796 / `w` #ead4aa | — | — |
| windows lit | `o` #feae34 / `y` #fee761 | — | `k` frame |

Depth pattern in the existing recipes: lit edge = `q`/`s`/`h` on top & upper-left; body = `Q`/`S`/`d`; shadow edge = `N` then `k` on lower-right & undersides. Reuse `N` (cool shadow navy, softer than `k`) for the wall's right face and the eave underside.

## Tasks

- [ ] **1. Redraw `weather-station` with a pitched roof + tall elevation.** Rework [weather-station.ts](../../../../tools/atlas-builder/src/recipes/assets/structure/weather-station.ts) so the top ~40% is a pitched (or hipped) roof that widens downward — lit ridge (`s`/`q`) up top, body `S`, shaded lower-right (`N`) — and the bottom ~60% is a front wall taller than one tile with: framed door (`kDDk` → keep), the two windows lit (`o`/`y` inside a `k` frame, like forge-house rows 18–22), a lit upper-left wall edge (`q`), and a shadowed lower-right edge (`N`/`k`). Add a 1–2 px **eave line** (`k`) where roof meets wall to separate the two planes. Likely needs **more height**: bump to `height: 48` (3×3 footprint) so the elevation has room — see task 4 for the placement consequence. Keep the antenna mast ([weather-antenna.ts](../../../../tools/atlas-builder/src/recipes/assets/structure/weather-antenna.ts)) as-is; just confirm it still lines up beside the taller building.
- [ ] **2. (Optional, recommended) Add depth to the small farmer `home`.** [home.ts](../../../../tools/atlas-builder/src/recipes/assets/structure/home.ts) is 16×16 and very flat. Either (a) add a lit roof-ridge + a shadowed right wall face + an eave line within 16 px, or (b) author a **new taller cottage recipe** (e.g. 32×32 `structure/cottage`, red `r`/`x` pitched roof + cream `w` wall + wood `D`/`d` door, forge-house shading) and use it for farms — decide in task 3. A taller cottage is the bigger visual win and matches the "more 3D" ask, but changes the farm footprint; the small `home` upgrade is lower-risk.
- [ ] **3. Decide the farm-house asset + which farms get one.** Today only farms with an `ownerId` get a `home` ([setup.ts:93-101](../../../../packages/sim-core/src/world/region-setup/setup.ts#L93-L101)) — i.e. the **named** farms (pip/atticus/hannah/otto/cora). The **procedural** farms (`farm-0…15`, `farmer === undefined`) get **no house** — these are the "islands of the farms" with nothing on them. Plan: drop the `ownerId !== undefined` gate (or add an `else` branch) so *every* `kind === "farm"` region gets a house at its `(maxX-1, maxY-1)` corner. Owned farms could keep the owner-coloured/named home; unowned ones get a generic cottage. Confirm the corner tile is walkable-adjacent and doesn't collide with plots/fences/fountain already placed in that region (the plot loop + fountain run just above at [setup.ts:60-91](../../../../packages/sim-core/src/world/region-setup/setup.ts#L60-L91)).
- [ ] **4. Placement / anchor math for any resized building.** If the weather-station grows to 48×48 (task 1) update its `BIG_STRUCTURES` entry ([geometry.ts:421](../../../../packages/sim-core/src/render-systems/geometry.ts#L421)) `hPx`/`wPx`; it is **bottom-anchored** at `baseTileY` so a taller sprite extends *upward* — verify it doesn't overlap the antenna or run off the island's north edge (weather-station island bounds in [regions.ts:185-233](../../../../packages/sim-core/src/world/regions.ts#L185-L233)). If a new tall farm cottage is used instead of the 16px `home`, it should move into `BIG_STRUCTURES` too (bottom-anchored, baked) rather than the per-region `world.spawn` at `layer:40`, so its elevation occludes correctly — **or** confirm the spawn-based path renders acceptably; note the trade-off.
- [ ] **5. Rebuild the atlas and eyeball it.** Re-run the atlas build (the cached per-asset build from brief 71 — `npm run build` / the atlas-builder step) so the new pixels bake into `packages/farm-valley/public/wasm`-adjacent atlas sheets, then `npm run dev` and look at: the weather-station island, a named farm, and a procedural farm. Confirm each building reads as a 3D structure (roof plane visibly distinct from wall plane) and nothing clips into water/plots.
- [ ] **6. Guards.** `npm run test` (palette guard must stay green — every new pixel char maps through [recipes/palette.ts](../../../../tools/atlas-builder/src/recipes/palette.ts), and any HTML/canvas color stays `EDG.*`), `npm run typecheck`. Because this is asset + static-placement only, the sim output should be byte-identical — run the **fast 3-day/3-seed `EXPORT=json` diff** (per the determinism-check resource rule) to confirm, not a full 100-day `CHECK_DETERMINISM`.

## Acceptance

- The weather-station building reads as a 3D structure — a distinct roof plane above a taller front-wall plane with top-left lighting — not a flat slab.
- Every farm island (named **and** procedural) has a visible house; placement collides with nothing (plots, fences, fountain, island edge).
- All colors are EDG32 swatch chars / `EDG.*`; palette guard + typecheck green.
- 3-day/3-seed sim diff is MATCH (asset/placement change must not move the sim baseline).

## Risks / notes

- **Depth is faked in the sprite, not projected.** There's no isometric camera or runtime side-face — "3D" means drawing a roof plane + a tall shaded wall plane into the pixel recipe (the forge-house recipe is the template). Don't over-scope into engine render changes.
- **Bottom-anchored baked structures vs. layer-40 spawns.** `BIG_STRUCTURES` buildings bake into the static layer bottom-anchored (correct elevation); the small `home` is a `world.spawn` at `layer:40`. A tall new cottage probably belongs in `BIG_STRUCTURES`; mixing approaches risks bad occlusion — pick one per task 4.
- **Footprint creep.** Making buildings taller adds upward pixels (fine) but a wider footprint can overrun small islands or plot tiles. Keep the *tile footprint* the same where possible; add height, not width.
- **Atlas rebuild required.** Pixel-recipe edits do nothing until the atlas is rebuilt (brief 71 made builds cached/per-asset). A stale atlas will make it look like the change didn't take.
- **Palette guard is strict.** Any new swatch char must already exist in [recipes/palette.ts](../../../../tools/atlas-builder/src/recipes/palette.ts) (all are EDG32); introducing a raw hex anywhere fails [palette.test.ts](../../../../packages/engine/src/render/palette.test.ts).
- **Determinism caution.** Even though this is render-only, the resource rule says **ask before any determinism check** and prefer the fast 3-day/3-seed diff over a full run.
