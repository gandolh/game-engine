/** Military meshes: watchpost, tower, garrison, keep. Crenellated + bannered. */
import { box, cylinder, gable, banner, merlonRim, merlonRing, translate, merge } from "../geometry";
import type { Mesh, MeshModel, Vec3 } from "../types";

/**
 * Raised guard LOOKOUT (height 2): four tall stilt legs, a railed deck, an
 * ENCLOSED cabin with a window slit, and a pitched gable roof. The railing +
 * enclosed cabin stop it reading as a table.
 */
export function watchpost(): MeshModel {
  const legAt: Vec3[] = [[0.3, 0.3, 0], [1.7, 0.3, 0], [0.3, 1.7, 0], [1.7, 1.7, 0]];
  const legs = legAt.map((p) => translate(cylinder(0.12, 2.3, 8, "timber"), p));
  const deck = translate(box([1.3, 1.3, 0.16], "darkwood"), [0.35, 0.35, 2.3]);
  const rail = translate(merlonRim(1.3, 1.3, 2.46, 0.1, 0.24, "timber"), [0.35, 0.35, 0]);
  const cabin = translate(box([1.0, 1.0, 0.85], "plaster"), [0.5, 0.5, 2.46]);
  // A dark window slit on the +y (front) wall.
  const window = translate(box([0.36, 0.06, 0.26], "stone"), [0.82, 1.47, 2.78]);
  const roof = translate(gable([1.16, 1.16, 0.6], "x", "tile"), [0.42, 0.42, 3.31]);
  return {
    name: "bld/watchpost", footprintW: 2, footprintD: 2, heightTiles: 2,
    mesh: merge(...legs, deck, rail, cabin, window, roof),
  };
}

/** Tall round CRENELLATED stone tower + banner (height 3 — should loom). */
export function tower(): MeshModel {
  const body = translate(cylinder(0.6, 4.6, 16, "stone"), [1.0, 1.0, 0]);
  const battlement = translate(merlonRing(0.6, 4.6, 10, 0.16, 0.36, "stone"), [1.0, 1.0, 0]);
  const flag = translate(banner(1.0, "signal"), [1.0, 1.0, 4.6]);
  return { name: "bld/tower", footprintW: 2, footprintD: 2, heightTiles: 3, mesh: merge(body, battlement, flag) };
}

/** Long fortified stone hall + a raised crenellated gatehouse + banner (3×2, h2). */
export function garrison(): MeshModel {
  const hall = translate(box([2.6, 1.6, 2.3], "stone"), [0.2, 0.2, 0]);
  const hallRim = translate(merlonRim(2.6, 1.6, 2.3, 0.22, 0.3, "stone"), [0.2, 0.2, 0]);
  const gate = translate(box([0.9, 0.7, 3.4], "stone"), [1.05, 1.3, 0]);
  const gateRim = translate(merlonRim(0.9, 0.7, 3.4, 0.18, 0.26, "stone"), [1.05, 1.3, 0]);
  const flag = translate(banner(0.85, "signal"), [1.5, 1.6, 3.4]);
  return { name: "bld/garrison", footprintW: 3, footprintD: 2, heightTiles: 2, mesh: merge(hall, hallRim, gate, gateRim, flag) };
}

/** The big blocky CRENELLATED donjon: battlements + four corner turrets + banner (3×3, h3). */
export function keep(): MeshModel {
  const body = translate(box([2.5, 2.5, 4.0], "stone"), [0.25, 0.25, 0]);
  const bodyRim = translate(merlonRim(2.5, 2.5, 4.0, 0.25, 0.4, "stone"), [0.25, 0.25, 0]);
  const turretAt: Vec3[] = [[0.08, 0.08, 0], [2.37, 0.08, 0], [0.08, 2.37, 0], [2.37, 2.37, 0]];
  const turrets: Mesh[] = [];
  for (const p of turretAt) {
    turrets.push(translate(box([0.55, 0.55, 4.9], "stone"), p));
    turrets.push(translate(merlonRim(0.55, 0.55, 4.9, 0.14, 0.24, "stone"), p));
  }
  const flag = translate(banner(1.1, "signal"), [1.5, 1.5, 4.0]);
  return { name: "bld/keep", footprintW: 3, footprintD: 3, heightTiles: 3, mesh: merge(body, bodyRim, ...turrets, flag) };
}
