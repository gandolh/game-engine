/** Dwelling meshes: the reference house + the taller apothecary healer. */
import { box, gable, translate, merge } from "../geometry";
import type { MeshModel } from "../types";

/** Plain reference dwelling: a plaster box body under a terracotta gable roof. */
export function house(): MeshModel {
  const body = translate(box([1.6, 1.6, 1.0], "plaster"), [0.2, 0.2, 0]);
  const roof = translate(gable([1.9, 1.9, 0.65], "x", "tile"), [0.05, 0.05, 1.0]);
  return { name: "bld/house", footprintW: 2, footprintD: 2, heightTiles: 1, mesh: merge(body, roof) };
}

/** Healer: a tall two-storey apothecary hall, mossy GREEN roof + a red cross on top. */
export function healer(): MeshModel {
  const body = translate(box([1.6, 1.6, 2.7], "plaster"), [0.2, 0.2, 0]);
  const roof = translate(gable([1.9, 1.9, 0.9], "x", "greenroof"), [0.05, 0.05, 2.7]);
  // Red cross straddling the ridge.
  const crossV = translate(box([0.09, 0.09, 0.5], "signal"), [0.955, 0.95, 3.6]);
  const crossH = translate(box([0.34, 0.09, 0.1], "signal"), [0.83, 0.95, 3.85]);
  return { name: "bld/healer", footprintW: 2, footprintD: 2, heightTiles: 2, mesh: merge(body, roof, crossV, crossH) };
}
