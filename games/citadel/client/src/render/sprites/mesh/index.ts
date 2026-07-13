/**
 * Mesh building art. Public surface: the renderer, the models, and a
 * name→`RasterizedRecipe` override map the atlas splices in for every base
 * `bld/<type>` frame plus the mill's rotated-sail animation frames.
 */
import type { RasterizedRecipe } from "../rasterize";
import { renderMeshModel } from "./render";
import { MESH_MODELS, MILL_ANIMATION_FRAMES } from "./models";

export { renderMeshModel } from "./render";
export { MESH_MODELS, MILL_ANIMATION_FRAMES } from "./models";
export { MATERIALS } from "./materials";
export * from "./geometry";
export type { Mesh, Tri, MeshModel, Vec3, MaterialKey } from "./types";

/**
 * The atlas frame overrides: for each migrated frame name, the mesh-rendered
 * `RasterizedRecipe` that replaces its char recipe. Rendered once at module load
 * (pure + deterministic). Covers all 21 base buildings + the mill's `@1`…`@{N-1}`
 * animation frames — so the ANIMATED mill renders as the new mesh at every phase
 * (the base override alone never showed, since the renderer cycles the @N frames).
 */
export const MESH_OVERRIDES: ReadonlyMap<string, RasterizedRecipe> = new Map(
  [...MESH_MODELS, ...MILL_ANIMATION_FRAMES].map((m) => [m.name, renderMeshModel(m)] as const),
);
