/**
 * Mesh building art (Phase 1). Public surface: the renderer, the models, and a
 * name→`RasterizedRecipe` override map the atlas splices in for the three frames
 * that have migrated off the char-recipe pipeline. The other frames keep their
 * char recipes (A/B comparison).
 */
import type { RasterizedRecipe } from "../rasterize";
import { renderMeshModel } from "./render";
import { MESH_MODELS } from "./models";

export { renderMeshModel } from "./render";
export { MESH_MODELS } from "./models";
export { MATERIALS } from "./materials";
export * from "./geometry";
export type { Mesh, Tri, MeshModel, Vec3, MaterialKey } from "./types";

/**
 * The atlas frame overrides: for each migrated frame name, the mesh-rendered
 * `RasterizedRecipe` that replaces its char recipe. Rendered once at module load
 * (pure + deterministic).
 */
export const MESH_OVERRIDES: ReadonlyMap<string, RasterizedRecipe> = new Map(
  MESH_MODELS.map((m) => [m.name, renderMeshModel(m)] as const),
);
