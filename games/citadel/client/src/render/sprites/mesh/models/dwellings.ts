/** Dwelling meshes: the reference house + the taller apothecary healer. */
import { box, gable, translate, merge, windowPane } from "../geometry";
import type { MeshModel } from "../types";

/**
 * Plain reference dwelling: a plaster box body under a terracotta gable roof,
 * with a shuttered-looking window set into each camera-facing wall (dark by
 * day; the `@lit` companion in ./lit remaps these to warm lamplight).
 */
export function house(): MeshModel {
  const body = translate(box([1.6, 1.6, 1.0], "plaster"), [0.2, 0.2, 0]);
  const roof = translate(gable([1.9, 1.9, 0.65], "x", "tile"), [0.05, 0.05, 1.0]);
  const winE = windowPane("x", 1.8, 0.55, 0.85, 0.35, 0.65, "window"); // +x wall
  const winS = windowPane("y", 1.8, 0.95, 1.25, 0.35, 0.65, "window"); // +y wall
  return { name: "bld/house", footprintW: 2, footprintD: 2, heightTiles: 1, mesh: merge(body, roof, winE, winS) };
}

/**
 * Healer: a tall two-storey apothecary hall, mossy GREEN roof + a red cross on
 * top, with a window on each floor of each camera-facing wall.
 */
export function healer(): MeshModel {
  const body = translate(box([1.6, 1.6, 2.7], "plaster"), [0.2, 0.2, 0]);
  const roof = translate(gable([1.9, 1.9, 0.9], "x", "greenroof"), [0.05, 0.05, 2.7]);
  // Red cross straddling the ridge.
  const crossV = translate(box([0.09, 0.09, 0.5], "signal"), [0.955, 0.95, 3.6]);
  const crossH = translate(box([0.34, 0.09, 0.1], "signal"), [0.83, 0.95, 3.85]);
  // Ground + upper floor windows on both camera-facing walls (2 tiles tall).
  const winE1 = windowPane("x", 1.8, 0.55, 0.85, 0.4, 0.75, "window");
  const winS1 = windowPane("y", 1.8, 0.95, 1.25, 0.4, 0.75, "window");
  const winE2 = windowPane("x", 1.8, 0.55, 0.85, 1.6, 1.95, "window");
  const winS2 = windowPane("y", 1.8, 0.95, 1.25, 1.6, 1.95, "window");
  return {
    name: "bld/healer", footprintW: 2, footprintD: 2, heightTiles: 2,
    mesh: merge(body, roof, crossV, crossH, winE1, winS1, winE2, winS2),
  };
}
