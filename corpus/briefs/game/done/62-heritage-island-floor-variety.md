# Brief 62 — Diversify floors on the decorative (heritage) islands

**Status:** done (merged 2026-06-10) · **Area:** atlas recipes + `packages/sim-core` (static layer) · **Drafted:** 2026-06-10

The three decorative heritage islands (brief 51) all share one floor sprite, so they read as copies. Give each its own floor material. Render-only; zero sim/determinism impact.

## Read first

- [briefs/game/done/51-heritage-sites-decorative-islands.md](../done/51-heritage-sites-decorative-islands.md) — original heritage-island brief.
- Root [CLAUDE.md](../../../../CLAUDE.md) — **EDG32 palette is enforced**; every color from `EDG.*` in [palette.ts](../../../../packages/engine/src/render/palette.ts), guard test scans the tree.

## Current state (verified against code 2026-06-10)

- The three islands are authored (not procgen) in [packages/sim-core/src/world/regions.ts](../../../../packages/sim-core/src/world/regions.ts) (~lines 97-99 bounds, 277-279 in `REGIONS`): `heritage-stones` (45-52 × 63-70, W), `heritage-ruin` (109-116 × 63-70, E), `heritage-statue` (45-52 × 93-100, SW). Each has a distinct landmark sprite (`structure/heritage-stones|ruin|statue`) spawned in [region-setup/setup.ts](../../../../packages/sim-core/src/world/region-setup/setup.ts) (~line 453).
- Floor selection is a per-region if-cascade in `backdropFrame()`, [render-systems/static-layer.ts](../../../../packages/sim-core/src/render-systems/static-layer.ts) (~lines 71-115). Lines ~101-102 collapse all three to one frame:
  `if (region === "heritage-stones" || "heritage-ruin" || "heritage-statue") return "tile/heritage-floor";`
- Floor tiles are authored in [tools/atlas-builder/src/recipes/base-recipes.ts](../../../../tools/atlas-builder/src/recipes/base-recipes.ts). 13+ floor materials already exist as precedent (`tile/forge-floor`, `tile/shrine-floor`, `tile/mushroom-floor`, `tile/ice-floor`, `tile/sand`, …).

## Design

Theme each floor to its landmark, all from EDG colors:

| Island | New frame | Material direction (suggested EDG) |
|---|---|---|
| heritage-stones | `tile/heritage-floor-stones` | mossy turf with half-buried slabs — `greenDark`/`green` over `slate` |
| heritage-ruin | `tile/heritage-floor-ruin` | cracked brick/rubble — `rust`/`clay` with `bark` cracks |
| heritage-statue | `tile/heritage-floor-statue` | weathered pale flagstone — `slate`/`steel` with sparse `cyan` lichen |

Keep contrast low (these are backdrops, layer 0) — sample the noise/texture style of the existing `tile/heritage-floor` recipe so they sit in the same family. Optionally keep `tile/heritage-floor` as a 4th variant or retire it.

## Tasks

- [ ] **1.** Author the three new tile recipes in [base-recipes.ts](../../../../tools/atlas-builder/src/recipes/base-recipes.ts), cloning the existing `tile/heritage-floor` recipe's structure. EDG colors only.
- [ ] **2.** Rebuild the atlas (find the exact script in the atlas-builder package — likely `npm run atlas` or a workspace build; verify, don't guess) and commit regenerated artifacts, matching how brief 47/51 did it.
- [ ] **3.** Split the heritage branch of `backdropFrame()` in [static-layer.ts](../../../../packages/sim-core/src/render-systems/static-layer.ts) into three per-region returns.
- [ ] **4.** If a render-systems test asserts known frames or scans baked frames ([render-systems.test.ts](../../../../packages/sim-core/src/render-systems.test.ts)), update it; the palette guard test must stay green.
- [ ] **5.** Manual check in `npm run dev` (all four seasons via the season knob if quick): each island visually distinct, shore/wall bands still align, hover labels unchanged.
- [ ] **6.** `npm run typecheck` + `npm run test`.

## Acceptance

- Three visibly distinct floors, one per heritage island, in the running game.
- Palette guard test green; no off-palette literals.
- No sim output change (render-only — `backdropFrame` is not read by sim systems; confirm nothing else consumes the old frame name).

## Risks / notes

- Smallest brief of the set; good warm-up task. The only gotcha is the atlas regeneration step — artifacts are committed, mirror brief 47's procedure.
- If `tile/heritage-floor` is retired, grep for any other consumer of that frame name first.
