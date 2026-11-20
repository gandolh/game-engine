# Task 10: one runtime atlas page per game

**Origin:** the owner, 2026-11-20: hold at least 60 fps, follow industry practice, and revert old
decisions where that helps. This brief reverts "keep about six sheets, don't merge" in
[asset-pipeline.md](../../wiki/asset-pipeline.md), at run time only. The plan is
[frame-budget.md](../../wiki/frame-budget.md).

**Depends on:** brief 09: the cook takes a per-game config.

## Context

The WebGL2 renderer sorts the sprite queue and then draws each run of sprites that share an atlas
as one group. A change of texture ends a group (`engine/core/src/render/webgl2/renderer.ts`,
`_recordGroup`).

Farm uploads its six sheets as six textures: `characters`, `buildings`, `terrain`, `crops`, `props`
and `items-ui`. All six are 128 px wide and stack to 2,432 px tall. Packed as whole blocks they fit
one 512×1024 page: `buildings` (1024 tall) in one column, `characters` and `props` (512 each) in the
next, and the three 128 px sheets in a third. The 2026-09-19 probe (`tools/run-sim/src/probes/probe-draw-groups.ts`, seed
`0xc0ffee`) counted 49 draw groups for 419 sprites, against a floor of 4. Layer 40 alone gives 40
groups, because world dressing alternates `props` and `buildings` frames in y order
([performance-measurements.md](../../wiki/performance-measurements.md), 2026-09-19).

Studios keep authoring units small and pack them into as few runtime pages as possible, splitting
into more pages only when a page would pass the size limit. That keeps the per-sheet cache and the
small diffs, and gives the batcher one texture.

The sprites carry sheet names as their `atlasId`, and `@farm/sim-core`'s `frameToAtlasId` sets
them. Changing that would touch sim code, so the renderer does the work instead: several sheet ids
resolve to one texture, and the batcher groups by texture.

## Files you OWN

- `tools/atlas-builder/` (the page step)
- `engine/core/src/render/webgl2/` (`renderer.ts` grouping, `gl-atlas-store.ts`), `engine/core/src/assets/`
  (loading a page manifest), and their tests
- `games/farm/client/src/` boot code that loads the atlases, and `games/farm/client/public/atlas/`
  (the cooked output)
- `tools/run-sim/src/probes/probe-draw-groups.ts`: count by texture as the renderer now does
- `corpus/` pages for this brief: the outcome, `log.md`, [asset-pipeline.md](../../wiki/asset-pipeline.md),
  [performance-measurements.md](../../wiki/performance-measurements.md), and the Assets entry of
  [decisions.md](../../wiki/decisions.md)

## Files you must NOT touch

- Any `sim-core` package, including `render-systems/frames.ts`: the sheet ids in snapshots stay
  as they are.
- Recipe pixels and the palette.

## What to do

1. **Cook a page.** After the sheets, the cook packs each game's sheets as whole blocks into one
   page PNG. Use power-of-two sides, at most 2048 px. If the blocks don't fit, open a second page,
   and document the rule. The page manifest maps each sheet id to its rectangle on a page. The
   per-sheet PNGs are still cooked and cached as before. The page is rebuilt only when a sheet's
   hash changed, and its bytes stay pinned.
2. **Load the page.** The client loads the page textures. Every sheet id resolves to its page's
   texture, with the frame's rectangle offset by the sheet's place on the page. Anything that
   looks a frame up by `(atlasId, frame)` keeps working, including the CPU raster that bakes the
   static layer from atlas images.
3. **Batch by texture.** The renderer starts a new group when the texture changes, not when the
   `atlasId` string does. `lastDrawStats.atlases` counts distinct textures.
4. **Record the revert.** On [asset-pipeline.md](../../wiki/asset-pipeline.md) and in the Assets
   entry of [decisions.md](../../wiki/decisions.md): the six sheets stay as authoring and cache units,
   and the run time sees one page. The reason is that WebGL2 batches per texture, with the numbers
   from this brief.

## Acceptance

- `probe-draw-groups.ts` on seed `0xc0ffee` gives as many groups as distinct textures in the queue:
  1 for Farm's world sprites, down from 49 on the 2026-09-19 scene. Groups already run on across
  layer boundaries when the texture stays the same, which is why the old per-layer rows add up to
  52 against a total of 49. `draw.atlases` is 1 for the world pass. Put before and after in
  the outcome and on [performance-measurements.md](../../wiki/performance-measurements.md).
- Farm uploads one world atlas texture at boot instead of six, counted with the brief-05 texture
  counter, or a texture-creation count if brief 05 is not done.
- Nothing looks different. `npm run preview` writes the same world PNG byte for byte, and a
  screenshot of Farm at a fixed seed and tick matches the one taken before the change, pixel for
  pixel.
- `npm run atlas` twice: the second run reports everything cached.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- If brief 07 has run, repeat Farm's bench on both reference devices.
- Deploy: `node cli.ts farm-valley deploy` from the vps-deploy checkout (static client only).
