/** Industry meshes: mill (tower + animated sails), quarry (dug pit), mine (headframe). */
import { box, cylinder, cone, gable, disc, windmillSails, translate, merge } from "../geometry";
import { MILL_FRAME_COUNT, millFrameName } from "../../recipes";
import type { Mesh, MeshModel, Vec3, MaterialKey } from "../types";

/**
 * One mill frame: a tall round stone tower, a conical cap, and four windmill
 * SAILS mounted PROUD of the front. The sail cross lies in the view plane, so at
 * `phase` it always reads as four distinct blades facing the camera. The hub is
 * pushed forward (high x+y+z) so the whole sail plane sits at a constant depth
 * NEARER than any tower/cap surface — no arm tucks behind the cap.
 */
function millFrame(name: string, phase: number): MeshModel {
  const body = translate(cylinder(0.55, 2.2, 16, "plaster"), [1.05, 1.05, 0]);
  const cap = translate(cone(0.64, 0.62, 16, "tile"), [1.05, 1.05, 2.2]);
  const hubAt: Vec3 = [1.2, 1.25, 3.0];
  const sails = translate(windmillSails(1.2, phase, "plaster"), hubAt);
  const hub = translate(disc(0.13, 0.2, 10, "darkwood"), hubAt);
  return { name, footprintW: 2, footprintD: 2, heightTiles: 3, mesh: merge(body, cap, sails, hub) };
}

/** The base mill frame (sails at phase 0). */
export function mill(): MeshModel {
  return millFrame("bld/mill", 0);
}

/**
 * Every mill ANIMATION frame beyond the base (`bld/mill@1`…`@{N-1}`). Matches the
 * old recipe's frame count + phase mapping: the N frames sweep 90° (the sails'
 * 4-fold symmetry), so frame i uses phase `(i/N)·(π/2)` — the renderer's existing
 * `millFrameAt` cycling then spins the new mesh mill smoothly.
 */
export function millAnimationFrames(): MeshModel[] {
  const out: MeshModel[] = [];
  for (let i = 1; i < MILL_FRAME_COUNT; i++) {
    out.push(millFrame(millFrameName(i), (i / MILL_FRAME_COUNT) * (Math.PI / 2)));
  }
  return out;
}

/** A hollow square terrace RING (four wall boxes) inset from the 2×2 footprint. */
function terraceRing(inset: number, top: number, mat: MaterialKey): Mesh {
  const w = 2 - 2 * inset;
  const wall = 0.28;
  return merge(
    translate(box([w, wall, top], mat), [inset, inset, 0]),
    translate(box([w, wall, top], mat), [inset, 2 - inset - wall, 0]),
    translate(box([wall, w - 2 * wall, top], mat), [inset, inset + wall, 0]),
    translate(box([wall, w - 2 * wall, top], mat), [2 - inset - wall, inset + wall, 0]),
  );
}

/**
 * A dug quarry PIT: three concentric terraces stepping DOWN and inward (each
 * lower + darker toward the centre) to a deep shadow floor — a hole in the
 * ground — with a timber hoist crane over it and cut stone blocks on the rim.
 */
export function quarry(): MeshModel {
  const rim = terraceRing(0.0, 0.55, "stone");    // outer rim (highest)
  const step1 = terraceRing(0.3, 0.38, "stone");  // first terrace down
  const step2 = terraceRing(0.58, 0.22, "pit");   // second terrace (darker)
  const floor = translate(box([0.44, 0.44, 0.08], "pit"), [0.78, 0.78, 0]); // deep floor
  // Timber hoist crane spanning the pit.
  const postA = translate(cylinder(0.05, 1.25, 6, "timber"), [0.55, 1.0, 0]);
  const postB = translate(cylinder(0.05, 1.25, 6, "timber"), [1.45, 1.0, 0]);
  const beam = translate(box([1.05, 0.09, 0.11], "timber"), [0.48, 0.955, 1.2]);
  const rope = translate(box([0.04, 0.04, 0.55], "darkwood"), [0.98, 0.975, 0.62]);
  const hook = translate(box([0.22, 0.22, 0.16], "stone"), [0.89, 0.87, 0.46]);
  // Cut stone blocks resting on the rim.
  const blockA = translate(box([0.28, 0.28, 0.22], "stone"), [0.12, 1.58, 0.55]);
  const blockB = translate(box([0.24, 0.24, 0.18], "stone"), [1.62, 0.16, 0.55]);
  return {
    name: "bld/quarry", footprintW: 2, footprintD: 2, heightTiles: 1,
    mesh: merge(rim, step1, step2, floor, postA, postB, beam, rope, hook, blockA, blockB),
  };
}

/** Low stone pithead hut + a tall timber HEADFRAME over the shaft mouth (height 2). */
export function mine(): MeshModel {
  const hut = translate(box([1.0, 1.4, 1.5], "stone"), [0.15, 0.25, 0]);
  const hutRoof = translate(gable([1.2, 1.6, 0.55], "y", "darkwood"), [0.05, 0.05, 1.5]);
  // Headframe: a tall square timber tower over the mouth, front-right.
  const legAt: Vec3[] = [[1.2, 1.0, 0], [1.7, 1.0, 0], [1.2, 1.5, 0], [1.7, 1.5, 0]];
  const legs = legAt.map((p) => translate(cylinder(0.06, 3.0, 6, "timber"), [p[0], p[1], 0]));
  const head = translate(box([0.62, 0.62, 0.34], "timber"), [1.14, 0.94, 3.0]);
  const wheel = translate(disc(0.22, 0.1, 10, "darkwood"), [1.78, 1.25, 2.75]);
  const mouth = translate(box([0.5, 0.5, 0.16], "darkwood"), [1.2, 1.0, 0]);
  return {
    name: "bld/mine", footprintW: 2, footprintD: 2, heightTiles: 2,
    mesh: merge(hut, hutRoof, ...legs, head, wheel, mouth),
  };
}
