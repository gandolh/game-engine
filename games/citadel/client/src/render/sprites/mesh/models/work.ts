/** Workshop meshes: bakery, woodcutter, sawmill, smith. All 2×2, height 1. */
import { box, cylinder, cone, gable, disc, rotateX, rotateY, translate, merge } from "../geometry";
import type { Mesh, MeshModel, Vec3 } from "../types";

/** A short horizontal log (a cylinder laid along +x). Centre at origin; translate. */
function log(len: number, r: number): Mesh {
  return translate(rotateY(cylinder(r, len, 8, "timber"), Math.PI / 2), [len, 0, 0]);
}

/** A small stacked log pile at `at` (front prop shared by woodcutter + sawmill). */
function logPile(at: Vec3): Mesh {
  const l = 0.7, r = 0.1;
  return merge(
    translate(log(l, r), [at[0], at[1], at[2] + r]),
    translate(log(l, r), [at[0], at[1] + 0.22, at[2] + r]),
    translate(log(l, r), [at[0], at[1] + 0.11, at[2] + 0.21]),
  );
}

/** Squat cottage with a ROUND oven dome bulging through the near wall + chimney. */
export function bakery(): MeshModel {
  const body = translate(box([1.4, 1.35, 0.8], "plaster"), [0.25, 0.4, 0]);
  const roof = translate(gable([1.6, 1.65, 0.55], "x", "tile"), [0.1, 0.25, 0.8]);
  const ovenAt: Vec3 = [1.55, 1.2, 0];
  const drum = translate(cylinder(0.34, 0.42, 14, "oven"), ovenAt);
  const dome = translate(cone(0.34, 0.3, 14, "oven"), [ovenAt[0], ovenAt[1], 0.42]);
  const chimney = translate(cylinder(0.12, 0.85, 10, "stone"), [0.5, 0.62, 0.75]);
  return { name: "bld/bakery", footprintW: 2, footprintD: 2, heightTiles: 1, mesh: merge(body, roof, drum, dome, chimney) };
}

/** A small compact cabin + a stacked log pile + a chopping block (reads as a little hut). */
export function woodcutter(): MeshModel {
  const cabin = translate(box([1.0, 1.0, 0.78], "timber"), [0.35, 0.35, 0]);
  const roof = translate(gable([1.2, 1.2, 0.5], "x", "darkwood"), [0.25, 0.25, 0.78]);
  const pile = logPile([1.35, 1.15, 0]);
  const block = translate(cylinder(0.16, 0.3, 10, "timber"), [0.55, 1.55, 0]);
  return { name: "bld/woodcutter", footprintW: 2, footprintD: 2, heightTiles: 1, mesh: merge(cabin, roof, pile, block) };
}

/** Timber shed + a round WATER WHEEL disc on the east side + a log pile. */
export function sawmill(): MeshModel {
  const shed = translate(box([1.1, 1.3, 0.85], "timber"), [0.25, 0.25, 0]);
  const roof = translate(gable([1.3, 1.4, 0.45], "y", "darkwood"), [0.15, 0.2, 0.85]);
  // Vertical water wheel on the +x (east) face (lighter rim, dark hub + spokes
  // for contrast so it reads as a wheel, not a blob).
  const wheel = translate(disc(0.55, 0.14, 16, "timber"), [1.5, 1.0, 0.64]);
  const hub = translate(disc(0.12, 0.18, 8, "darkwood"), [1.5, 1.0, 0.64]);
  const spokeV = translate(box([0.14, 0.08, 1.02], "darkwood"), [1.48, 0.96, 0.13]);
  const spokeH = translate(box([0.14, 1.02, 0.08], "darkwood"), [1.48, 0.49, 0.6]);
  const pile = logPile([0.35, 1.55, 0]);
  return { name: "bld/sawmill", footprintW: 2, footprintD: 2, heightTiles: 1, mesh: merge(shed, roof, wheel, spokeV, spokeH, hub, pile) };
}

/**
 * OPEN-SIDED forge: a mono-pitch lean-to roof on posts (open front + sides), a
 * glowing hearth set into the low back wall, a chimney, and an anvil out front.
 * The open canopy + glow read as a workshop, clearly not a cottage (contrast the
 * bakery's closed gable + oven bulge).
 */
export function smith(): MeshModel {
  // A tall back forge mass: stone wall + hood + a prominent CHIMNEY (the vertical
  // that anchors the smithy read), with a glowing hearth facing the open front.
  const backWall = translate(box([1.5, 0.4, 1.2], "stone"), [0.25, 0.2, 0]);
  const hearth = translate(box([0.75, 0.5, 0.95], "oven"), [0.6, 0.5, 0]);
  // The glow: a bright red mouth on the hearth's +y (front) face.
  const ember = translate(box([0.53, 0.14, 0.6], "signal"), [0.71, 0.98, 0.2]);
  const hood = translate(box([0.9, 0.55, 0.4], "stone"), [0.55, 0.42, 0.95]);
  const chimney = translate(cylinder(0.15, 0.95, 8, "stone"), [1.0, 0.42, 1.35]);
  // A SMALL steep awning on two tall posts over the working area — an open
  // lean-to shelter, not a full roof (so it never reads as a closed box/table).
  const roof = translate(rotateX(box([1.3, 0.6, 0.12], "darkwood"), -0.55), [0.35, 0.55, 1.28]);
  const postL = translate(cylinder(0.06, 1.15, 6, "timber"), [0.42, 1.15, 0]);
  const postR = translate(cylinder(0.06, 1.15, 6, "timber"), [1.58, 1.15, 0]);
  // An anvil standing in the open front: a stubby dark post + a wider top block.
  const anvilPost = translate(box([0.16, 0.16, 0.26], "darkwood"), [1.3, 1.66, 0]);
  const anvilTop = translate(box([0.36, 0.17, 0.11], "stone"), [1.2, 1.64, 0.26]);
  return {
    name: "bld/smith", footprintW: 2, footprintD: 2, heightTiles: 1,
    mesh: merge(backWall, hearth, ember, hood, chimney, postL, postR, roof, anvilPost, anvilTop),
  };
}
