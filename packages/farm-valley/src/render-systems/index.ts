/**
 * render-systems/index.ts — barrel re-exporting the full public API of the
 * original render-systems.ts so all existing consumers continue to work
 * unchanged.
 */

export {
  frameToAtlasId,
  pickFarmerFrame,
  FOAM_FRAMES,
  FISHING_SPOT_FRAMES,
  FORGE_FIRE_FRAMES,
  FORGE_OVEN_TILE,
  FORGE_SMOKE_FRAMES,
  FORGE_CHIMNEY_PX,
  WATERFALL_FRAMES,
} from "./frames";

export {
  OCEAN_TILES,
  COASTLINE_BUBBLE_TILES,
} from "./geometry";

export {
  iterStaticSprites,
  buildStaticLayerSprites,
} from "./static-layer";

export { pushSnapshotSprites } from "./snapshot-sprites";
