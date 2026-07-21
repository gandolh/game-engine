/**
 * The graveyard mesh (chunk hollow-15) — the town's one authored burial
 * ground (`HollowSnapshot.graveyard`, `@hollow/sim-core/world`'s
 * `GRAVEYARD_TILE`): three hand-placed headstones inside a low four-post
 * fence, mirroring `hearth-mesh.ts`'s "one authored central world feature"
 * idiom exactly (this is the render anchor a grave-digger carries bodies
 * to — see `corpse-mesh.ts`'s header).
 *
 * Local-origin mesh (base centered at `(0, 0)`, resting on `z = 0`) — `app.ts`
 * uploads it once and translates the single instance to
 * `[graveyard.gx + 0.5, graveyard.gy + 0.5, groundHeightAt(...)]`, same
 * convention as `hearth-mesh.ts`/`node-mesh.ts`.
 *
 * One new material this chunk adds (`materials.ts`): `"headstone"`, a pale
 * stone role distinct from the hearth's darker `"rock"` base. The perimeter
 * fence reuses the existing `"woodDark"` role — no second new key needed.
 * Pure + deterministic: no RNG, a fixed hand-placed layout (three headstones
 * of slightly different height/offset + four corner posts), same
 * "hand-placed cluster" idiom `hearth-mesh.ts`'s flame cluster and
 * `node-mesh.ts`'s food-node bushes already use.
 */
import { box, merge, translate, type Mesh } from "@engine/core/render3d";

const HEADSTONE_W = 0.22;
const HEADSTONE_D = 0.1;

function headstone(dx: number, dy: number, h: number): Mesh {
  return translate(box([HEADSTONE_W, HEADSTONE_D, h], "headstone"), [dx - HEADSTONE_W / 2, dy - HEADSTONE_D / 2, 0]);
}

const FENCE_POST_SIZE = 0.12;
const FENCE_POST_H = 0.4;
/** Half-extent of the four corner posts from the plot's local origin — just
 *  wide enough to enclose the headstone cluster below. */
const FENCE_HALF_EXTENT = 1.1;

function fencePost(dx: number, dy: number): Mesh {
  return translate(
    box([FENCE_POST_SIZE, FENCE_POST_SIZE, FENCE_POST_H], "woodDark"),
    [dx - FENCE_POST_SIZE / 2, dy - FENCE_POST_SIZE / 2, 0],
  );
}

/** Builds the graveyard's static mesh — upload ONCE (see this module's
 *  header); the app instances it a single time at the graveyard tile. */
export function buildGraveyardMesh(): Mesh {
  // Three headstones, hand-offset (not RNG) so the plot doesn't read as a
  // single rigid repeated prop — same idiom as the hearth's three flames.
  const stoneA = headstone(-0.4, -0.15, 0.55);
  const stoneB = headstone(0.05, 0.25, 0.45);
  const stoneC = headstone(0.45, -0.2, 0.5);

  const postNE = fencePost(FENCE_HALF_EXTENT, FENCE_HALF_EXTENT);
  const postNW = fencePost(-FENCE_HALF_EXTENT, FENCE_HALF_EXTENT);
  const postSE = fencePost(FENCE_HALF_EXTENT, -FENCE_HALF_EXTENT);
  const postSW = fencePost(-FENCE_HALF_EXTENT, -FENCE_HALF_EXTENT);

  return merge(stoneA, stoneB, stoneC, postNE, postNW, postSE, postSW);
}
