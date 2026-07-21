/**
 * The hearth mesh (chunk hollow-14d) — the town's one authored central world
 * feature (`HollowSnapshot.hearth`, `@hollow/sim-core/world`'s `HEARTH_TILE`):
 * a squat stone fire-pit base with a cluster of glowing flame cones on top.
 * The flames use the `"hearthFire"` EMISSIVE material (materials.ts) so the
 * hearth reads as a warm beacon, especially once the day/night wash darkens
 * for the dusk GATHER phase (day-night.ts's `simDayPhaseWash`) — this is the
 * point everyone converges on at the SAME time it visibly gets dark.
 *
 * Local-origin mesh (base centered at `(0, 0)`, resting on `z = 0`) — `app.ts`
 * uploads it once and translates the single instance to
 * `[hearth.gx + 0.5, hearth.gy + 0.5, groundHeightAt(...)]`, same convention
 * as `node-mesh.ts`'s resource nodes. Pure + deterministic: no RNG, a fixed
 * hand-placed flame cluster (three cones of different height/offset, same
 * "hand-placed cluster" idiom `node-mesh.ts`'s food-node bushes already use).
 */
import { cone, cylinder, merge, translate, type Mesh } from "@engine/core/render3d";

/** Squat stone fire-pit base — reuses the existing `"rock"` world material
 *  (no new non-emissive key needed; the resource-node stumps already
 *  establish "rock" as the stone/rubble role). */
const STONE_RADIUS = 1.6;
const STONE_HEIGHT = 0.35;
const STONE_SEGS = 8;

/** The glowing flame cluster — `"hearthFire"` (materials.ts) is the ONE new
 *  emissive material key this chunk adds. Three cones (a tall core + two
 *  shorter, offset flanking flames) read as a small communal fire rather
 *  than a single stiff cone. */
const FLAME_SEGS = 6;

function flame(dx: number, dy: number, radius: number, height: number): Mesh {
  return translate(cone(radius, height, FLAME_SEGS, "hearthFire"), [dx, dy, STONE_HEIGHT]);
}

/** Builds the hearth's static mesh — upload ONCE (see this module's header);
 *  the app instances it a single time at the hearth tile. */
export function buildHearthMesh(): Mesh {
  const stoneBase = cylinder(STONE_RADIUS, STONE_HEIGHT, STONE_SEGS, "rock");
  const core = flame(0, 0, 0.55, 1.1);
  const flankA = flame(0.35, 0.2, 0.34, 0.8);
  const flankB = flame(-0.32, -0.25, 0.3, 0.7);
  return merge(stoneBase, core, flankA, flankB);
}
