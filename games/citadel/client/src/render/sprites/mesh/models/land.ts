/** Land meshes: the plowed farm field (mostly flat, minimal height). */
import { box, cylinder, translate, merge } from "../geometry";
import type { Mesh, MeshModel } from "../types";

/** A flat plowed FIELD: a low soil slab with raised green crop furrow rows. */
export function farm(): MeshModel {
  const soil = translate(box([2.9, 2.9, 0.1], "darkwood"), [0.05, 0.05, 0]);
  const rows: Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const y = 0.28 + i * 0.44;
    rows.push(translate(box([2.7, 0.22, 0.1], "greenroof"), [0.15, y, 0.1]));
  }
  // Four short corner fence posts to frame the plot.
  const postAt = [[0.12, 0.12], [2.76, 0.12], [0.12, 2.76], [2.76, 2.76]] as const;
  const posts = postAt.map(([x, y]) => translate(cylinder(0.06, 0.34, 6, "timber"), [x, y, 0]));
  return { name: "bld/farm", footprintW: 3, footprintD: 3, heightTiles: 1, mesh: merge(soil, ...rows, ...posts) };
}
