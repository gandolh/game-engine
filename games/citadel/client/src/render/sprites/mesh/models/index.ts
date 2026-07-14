/**
 * Aggregator for every Phase-2 building mesh model — all 21 base `bld/<type>`
 * frames. Grouped into category files (dwellings / work / civic / trade /
 * industry / military / land) for maintainability; this barrel flattens them
 * into the ordered list the atlas overrides.
 */
import type { MeshModel } from "../types";
import { house, healer } from "./dwellings";
import { bakery, woodcutter, sawmill, smith } from "./work";
import { chapel, market, publicSquare, townHall, well } from "./civic";
import { storehouse, tradingpost } from "./trade";
import { mill, millAnimationFrames, quarry, mine } from "./industry";
import { watchpost, tower, garrison, keep } from "./military";
import { farm } from "./land";
import { litMeshModels } from "./lit";

/** Every base building modelled as a mesh (keyed by the `bld/<type>` frame name). */
export const MESH_MODELS: readonly MeshModel[] = [
  house(), healer(),
  bakery(), woodcutter(), sawmill(), smith(),
  chapel(), market(), publicSquare(), townHall(), well(),
  storehouse(), tradingpost(),
  mill(), quarry(), mine(),
  watchpost(), tower(), garrison(), keep(),
  farm(),
];

/**
 * The mill's rotated-sail ANIMATION frames (`bld/mill@1`…`@{N-1}`). The renderer
 * cycles through these at runtime, so they must ALSO be mesh overrides (else the
 * animation falls back to the old char recipe). The base `bld/mill` is already in
 * MESH_MODELS above.
 */
export const MILL_ANIMATION_FRAMES: readonly MeshModel[] = millAnimationFrames();

/**
 * The four dusk-lit `bld/<type>@lit` companion frames (house/bakery/smith/
 * healer). Render-selected by night factor (`quads.ts`'s `LIT_BUILDING_SET`),
 * so — like the mill's animation frames — they must ALSO be mesh overrides or
 * the buildings fall back to the old char-recipe glow at night.
 */
export const LIT_MESH_MODELS: readonly MeshModel[] = litMeshModels();
