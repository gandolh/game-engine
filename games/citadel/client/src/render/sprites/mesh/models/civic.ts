/** Civic meshes: chapel, market, public-square, town-hall, well. */
import { box, cylinder, pyramid, gable, banner, translate, merge } from "../geometry";
import type { Mesh, MeshModel, MaterialKey } from "../types";

/** Stone church nave + a tall STEEPLE with a spire — the spire is the read. */
export function chapel(): MeshModel {
  const nave = translate(box([1.3, 1.5, 2.5], "plaster"), [0.35, 0.25, 0]);
  const naveRoof = translate(gable([1.5, 1.7, 0.8], "y", "stone"), [0.25, 0.15, 2.5]);
  const steeple = translate(box([0.55, 0.55, 3.9], "plaster"), [0.15, 1.35, 0]);
  const spire = translate(pyramid([0.55, 0.55], 1.0, "stone"), [0.15, 1.35, 3.9]);
  const cross = translate(box([0.06, 0.06, 0.34], "signal"), [0.4, 1.6, 4.9]);
  return { name: "bld/chapel", footprintW: 2, footprintD: 2, heightTiles: 2, mesh: merge(nave, naveRoof, steeple, spire, cross) };
}

/**
 * Open-air market: TWO small stalls, each a striped canopy floating high on four
 * thin posts with OPEN sides and goods visible underneath — the silhouette reads
 * "canopy on posts," not a closed roofed box.
 */
export function market(): MeshModel {
  const stall = (ox: number, oy: number, s: number, postH: number, canopyMat: MaterialKey, goodsMat: MaterialKey): Mesh => {
    const posts = [[ox, oy], [ox + s, oy], [ox, oy + s], [ox + s, oy + s]]
      .map(([x, y]) => translate(cylinder(0.045, postH, 6, "timber"), [x!, y!, 0]));
    // A thin striped canopy raised clear of the posts (open volume beneath).
    const canopy = translate(gable([s + 0.24, s + 0.24, 0.22], "x", canopyMat), [ox - 0.12, oy - 0.12, postH]);
    // A low goods bench + a crate sitting UNDER the open canopy.
    const bench = translate(box([s * 0.7, s * 0.5, 0.24], goodsMat), [ox + s * 0.15, oy + s * 0.1, 0]);
    const crate = translate(box([0.22, 0.22, 0.2], "timber"), [ox + s * 0.5, oy + s * 0.55, 0]);
    return merge(...posts, canopy, bench, crate);
  };
  const a = stall(0.3, 0.35, 0.72, 0.98, "signal", "oven");
  const b = stall(1.15, 1.15, 0.66, 0.86, "tile", "greenroof");
  return { name: "bld/market", footprintW: 2, footprintD: 2, heightTiles: 1, mesh: merge(a, b) };
}

/** A flat cobbled PLAZA slab + a raised dais + a festival banner pole. */
export function publicSquare(): MeshModel {
  const slab = translate(box([1.9, 1.9, 0.12], "stone"), [0.05, 0.05, 0]);
  const dais = translate(box([0.8, 0.8, 0.16], "stone"), [0.6, 0.6, 0.12]);
  const pole = translate(banner(1.5, "signal"), [1.0, 1.0, 0.28]);
  return { name: "bld/public-square", footprintW: 2, footprintD: 2, heightTiles: 1, mesh: merge(slab, dais, pole) };
}

/** Large civic hall + a cupola bell-tower + a banner (3×3, height 2). */
export function townHall(): MeshModel {
  const hall = translate(box([2.6, 2.6, 2.5], "plaster"), [0.2, 0.2, 0]);
  const roof = translate(gable([2.9, 2.9, 0.95], "x", "tile"), [0.05, 0.05, 2.5]);
  const cupola = translate(box([0.72, 0.72, 0.7], "plaster"), [1.14, 1.14, 3.45]);
  const cap = translate(pyramid([0.72, 0.72], 0.55, "tile"), [1.14, 1.14, 4.15]);
  const flag = translate(banner(0.9, "signal"), [1.5, 1.5, 4.7]);
  return { name: "bld/town-hall", footprintW: 3, footprintD: 3, heightTiles: 2, mesh: merge(hall, roof, cupola, cap, flag) };
}

/** A small round stone well-head with a roofed windlass + bucket (1×1). */
export function well(): MeshModel {
  const ring = translate(cylinder(0.3, 0.38, 12, "stone"), [0.5, 0.5, 0]);
  const postA = translate(cylinder(0.05, 0.78, 6, "timber"), [0.28, 0.5, 0.38]);
  const postB = translate(cylinder(0.05, 0.78, 6, "timber"), [0.72, 0.5, 0.38]);
  const roof = translate(gable([0.7, 0.42, 0.26], "y", "darkwood"), [0.15, 0.29, 1.16]);
  const bucket = translate(cylinder(0.09, 0.14, 8, "timber"), [0.5, 0.5, 0.5]);
  return { name: "bld/well", footprintW: 1, footprintD: 1, heightTiles: 1, mesh: merge(ring, postA, postB, roof, bucket) };
}
