/**
 * The Phase-1 mesh models: `house`, `bakery`, `watchpost`. Each is composed from
 * the parametric generators ({@link ./geometry}) and merged into one indexed
 * mesh. Footprints + art heights mirror the recipes they override (all 2×2,
 * heightTiles 1) so the rendered sprite maps 1:1 onto the same world-px quad.
 *
 * Coordinates: tile units, x east / y south / z up; the near / camera-facing
 * side is +x/+y. Bodies are inset slightly from the footprint edge so they read
 * as sitting ON the plot.
 */
import { box, cylinder, cone, gable, translate, merge } from "./geometry";
import type { MeshModel, Vec3 } from "./types";

/** Plain reference dwelling: a plaster box body under a terracotta gable roof. */
function house(): MeshModel {
  const body = translate(box([1.6, 1.6, 1.0], "plaster"), [0.2, 0.2, 0]);
  const roof = translate(gable([1.9, 1.9, 0.65], "x", "tile"), [0.05, 0.05, 1.0]);
  return { name: "bld/house", footprintW: 2, footprintD: 2, heightTiles: 1, mesh: merge(body, roof) };
}

/**
 * Squat cottage with a ROUND bread-oven (cylinder drum + cone dome) bulging
 * through the near wall, and a round stone chimney — the curved geometry proves
 * the mesh path.
 */
function bakery(): MeshModel {
  const body = translate(box([1.4, 1.35, 0.8], "plaster"), [0.25, 0.4, 0]);
  const roof = translate(gable([1.6, 1.65, 0.55], "x", "tile"), [0.1, 0.25, 0.8]);
  // Oven: a fat cylinder drum capped by a cone dome, protruding at front-right.
  const ovenAt: Vec3 = [1.55, 1.2, 0];
  const drum = translate(cylinder(0.34, 0.42, 14, "oven"), ovenAt);
  const dome = translate(cone(0.34, 0.3, 14, "oven"), [ovenAt[0], ovenAt[1], 0.42]);
  // Round stone chimney rising past the ridge at the back.
  const chimney = translate(cylinder(0.12, 0.85, 10, "stone"), [0.5, 0.62, 0.75]);
  return {
    name: "bld/bakery",
    footprintW: 2, footprintD: 2, heightTiles: 1,
    mesh: merge(body, roof, drum, dome, chimney),
  };
}

/**
 * Raised timber lookout: four round stilt legs, a deck platform, a small cabin,
 * and a pyramidal cap — a tall stilted silhouette that never reads as a house.
 */
function watchpost(): MeshModel {
  const legAt: Vec3[] = [[0.32, 0.32, 0], [1.68, 0.32, 0], [0.32, 1.68, 0], [1.68, 1.68, 0]];
  const legs = legAt.map((p) => translate(cylinder(0.13, 1.05, 8, "timber"), p));
  const platform = translate(box([1.7, 1.7, 0.15], "darkwood"), [0.15, 0.15, 1.05]);
  // A tall, narrower cabin so its walls read below the roof eave.
  const cabin = translate(box([0.9, 0.9, 0.62], "timber"), [0.55, 0.55, 1.2]);
  // A round CONE turret cap (a watchtower read, not a house gable).
  const cap = translate(cone(0.52, 0.6, 12, "tile"), [1.0, 1.0, 1.82]);
  return {
    name: "bld/watchpost",
    footprintW: 2, footprintD: 2, heightTiles: 1,
    mesh: merge(...legs, platform, cabin, cap),
  };
}

/** Every Phase-1 mesh model, keyed by the atlas frame name it overrides. */
export const MESH_MODELS: readonly MeshModel[] = [house(), bakery(), watchpost()];
