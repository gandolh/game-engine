/** Trade meshes: storehouse, tradingpost. Both 3×2, height 1. */
import { box, cylinder, gable, translate, merge } from "../geometry";
import type { Mesh, MeshModel, Vec3 } from "../types";

/** A couple of stacked crates at `at`. */
function crates(at: Vec3): Mesh {
  return merge(
    translate(box([0.34, 0.34, 0.32], "timber"), at),
    translate(box([0.3, 0.3, 0.28], "timber"), [at[0] + 0.36, at[1] + 0.05, 0]),
    translate(box([0.28, 0.28, 0.26], "oven"), [at[0] + 0.1, at[1] + 0.02, 0.32]),
  );
}

/** Long low timber warehouse with big barn doors on the front + crates. */
export function storehouse(): MeshModel {
  const body = translate(box([2.6, 1.6, 0.95], "timber"), [0.2, 0.2, 0]);
  const roof = translate(gable([2.9, 1.8, 0.5], "x", "darkwood"), [0.05, 0.1, 0.95]);
  // Big double barn doors proud of the +y (front) wall, centred along the long axis.
  const doorL = translate(box([0.55, 0.1, 0.72], "darkwood"), [1.0, 1.74, 0]);
  const doorR = translate(box([0.55, 0.1, 0.72], "darkwood"), [1.6, 1.74, 0]);
  const props = crates([0.35, 1.5, 0]);
  return { name: "bld/storehouse", footprintW: 3, footprintD: 2, heightTiles: 1, mesh: merge(body, roof, doorL, doorR, props) };
}

/** Warehouse with a striped market CANOPY across the front + crates. */
export function tradingpost(): MeshModel {
  const body = translate(box([2.6, 1.6, 0.95], "plaster"), [0.2, 0.2, 0]);
  const roof = translate(gable([2.9, 1.8, 0.5], "x", "tile"), [0.05, 0.1, 0.95]);
  // A striped canopy slab jutting out over the front, on two posts.
  const canopy = translate(box([2.2, 0.42, 0.08], "signal"), [0.4, 1.58, 0.82]);
  const postL = translate(cylinder(0.05, 0.82, 6, "timber"), [0.5, 1.92, 0]);
  const postR = translate(cylinder(0.05, 0.82, 6, "timber"), [2.5, 1.92, 0]);
  const props = crates([0.5, 1.35, 0]);
  return { name: "bld/tradingpost", footprintW: 3, footprintD: 2, heightTiles: 1, mesh: merge(body, roof, canopy, postL, postR, props) };
}
