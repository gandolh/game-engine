/**
 * Dusk-lit (`@lit`) companion frames for the four window-bearing cottages
 * (house, bakery, smith, healer) — the mesh counterpart to the old char
 * recipes' `litFrames()` (see `../../recipes/buildings.ts`), which these now
 * shadow via `MESH_OVERRIDES`.
 *
 * Anti-drift by construction: a lit frame is never a second hand-authored
 * model body. It is built by calling the EXACT SAME day-frame factory
 * (`house()`, `bakery()`, `smith()`, `healer()`) and remapping specific tri
 * MATERIALS — the day model's dark "window" panes to emissive "lampGlow",
 * and (smith only) its "signal" hearth-mouth to a hotter emissive "hotEmber"
 * — via `withLitMaterials`. Geometry can only ever come from the day factory,
 * so the two frames cannot diverge in shape, only in which materials emit.
 */
// Import from the LEAF names module, not the `../../recipes` barrel: the barrel
// derives BUILDING_SPRITE_TYPES from MESH_MODELS, so going through it here would
// close an import cycle (barrel → mesh/models → lit → barrel).
import { buildingLitFrameName } from "../../recipes/buildings";
import type { Mesh, MeshModel, MaterialKey } from "../types";
import { house, healer } from "./dwellings";
import { bakery, smith } from "./work";

/** Remap a mesh's triangle materials through `overrides` (unmapped materials pass through). */
function remapMaterials(mesh: Mesh, overrides: Partial<Record<MaterialKey, MaterialKey>>): Mesh {
  return {
    positions: mesh.positions,
    tris: mesh.tris.map((t) => ({ ...t, material: overrides[t.material] ?? t.material })),
  };
}

/** The dusk-lit companion of `model`: same footprint/mesh topology, remapped materials. */
function withLitMaterials(
  model: MeshModel,
  type: string,
  overrides: Partial<Record<MaterialKey, MaterialKey>>,
): MeshModel {
  return { ...model, name: buildingLitFrameName(type), mesh: remapMaterials(model.mesh, overrides) };
}

/** Every window pane on the day models uses the "window" material — swap it for warm lamplight. */
const WINDOW_LIT: Partial<Record<MaterialKey, MaterialKey>> = { window: "lampGlow" };

/**
 * The four `bld/<type>@lit` mesh models, one per `LIT_BUILDING_TYPES` entry.
 * Folded into `MESH_OVERRIDES` alongside `MESH_MODELS`/`MILL_ANIMATION_FRAMES`
 * (see `../index.ts`) so they shadow the char-recipe `@lit` frames.
 */
export function litMeshModels(): readonly MeshModel[] {
  return [
    withLitMaterials(house(), "house", WINDOW_LIT),
    withLitMaterials(bakery(), "bakery", WINDOW_LIT),
    // The smith's hearth-mouth ("signal" by day) also runs hotter at night.
    withLitMaterials(smith(), "smith", { window: "lampGlow", signal: "hotEmber" }),
    withLitMaterials(healer(), "healer", WINDOW_LIT),
  ];
}
