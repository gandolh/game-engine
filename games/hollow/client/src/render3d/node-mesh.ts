/**
 * Resource-node meshes (chunk hollow-09a) — "readable resource nodes... as
 * DISTINCT primitive meshes by kind" (only "food" and "material" actually
 * appear in `resourceNodes[].kind` — see `world/resources.ts`'s
 * `ResourceKind` — there is no well/workshop/forage kind in the sim yet), and
 * the node visibly reflects its `stock/maxStock` fullness via scale. Pure +
 * deterministic — no RNG (the cluster of "bushes"/berries below is a fixed
 * hand-placed layout, not randomized per node).
 */
import { box, cone, cylinder, merge, scale as scaleMesh, translate, type Mesh } from "@engine/core/render3d";

/** Stock fraction, clamped to `[0, 1]` (defensive against a degenerate
 *  `maxStock <= 0`). Pure. */
export function resourceNodeFullness(stock: number, maxStock: number): number {
  if (maxStock <= 0) return 0;
  const f = stock / maxStock;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

/** A near-empty node never fully vanishes (still readable as "a node", just
 *  a shrunken one) — scale ranges `[MIN_NODE_SCALE, 1]` over the fullness
 *  fraction. Exported so the app's per-tick instance transform (scaling the
 *  ALREADY-uploaded base mesh via the model matrix, not re-uploading
 *  geometry every tick) reuses the exact same curve `nodeMeshFor` bakes in
 *  for its own tests. */
export const MIN_NODE_SCALE = 0.35;

export function fullnessScale(fullness: number): number {
  return MIN_NODE_SCALE + (1 - MIN_NODE_SCALE) * fullness;
}

/** A low crop/bush cluster for a "food" node — three squat foliage boxes
 *  with a berry accent on top of each, fixed hand-placed layout (no RNG). */
function buildFoodNodeBaseMesh(): Mesh {
  const bush = (dx: number, dy: number, s: number): Mesh =>
    translate(scaleMesh(box([1, 1, 0.5], "cropLeaf"), [s, s, 1]), [dx, dy, 0]);
  const berry = (dx: number, dy: number, s: number): Mesh =>
    translate(cylinder(0.1 * s, 0.14, 6, "cropFruit"), [dx, dy, 0.5]);
  return merge(
    bush(-0.3, -0.2, 0.9),
    bush(0.35, -0.1, 0.7),
    bush(0, 0.35, 0.8),
    berry(-0.3, -0.2, 0.9),
    berry(0.35, -0.1, 0.7),
    berry(0, 0.35, 0.8),
  );
}

/** A rough rock/stump for a "material" node — a squat hexagonal cone. */
function buildMaterialNodeBaseMesh(): Mesh {
  return cone(0.6, 0.9, 6, "rock");
}

/** The UNSCALED mesh for a node kind — upload this ONCE per kind
 *  (`worldMaterialIndexOf`-resolved) and apply {@link fullnessScale} per
 *  INSTANCE via the model matrix at render time instead of re-uploading
 *  geometry every tick (stock changes every tick; GPU mesh uploads should
 *  not). Unrecognized kinds fall back to the material/rock mesh (defensive
 *  — every kind the sim actually emits today is "food" | "material"). */
export function baseNodeMeshFor(kind: string): Mesh {
  return kind === "food" ? buildFoodNodeBaseMesh() : buildMaterialNodeBaseMesh();
}

/** Build the mesh for one resource node, distinct by `kind` and scaled by
 *  its current `stock/maxStock` fullness — the fully self-contained,
 *  directly-testable form (`baseNodeMeshFor` + `fullnessScale` composed).
 *  The app itself uses the split form above for GPU-upload efficiency; this
 *  composed function is what this module's own tests exercise for the
 *  "distinct mesh per kind" + "monotone scale in stock" contracts. */
export function nodeMeshFor(kind: string, stock: number, maxStock: number): Mesh {
  const s = fullnessScale(resourceNodeFullness(stock, maxStock));
  return scaleMesh(baseNodeMeshFor(kind), s);
}
