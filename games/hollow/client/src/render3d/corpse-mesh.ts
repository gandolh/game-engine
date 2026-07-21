/**
 * The corpse mesh (chunk hollow-15) — a dead villager's body left in the
 * world (`HollowSnapshot.corpses`, `@hollow/sim-core`'s `Corpse` component):
 * a small, low, prone shrouded-body mound — an elongated flat slab (the
 * body) plus a smaller slab at one end (the head) — reusing the SAME
 * neutral-material-plus-per-instance-tint idiom `materials.ts`'s
 * `"territoryTile"` (and `humanoid.ts`'s per-agent tint) already establish:
 * a rotting corpse is a TINT variant of this SAME uploaded mesh (see
 * `corpseTint` below), not a second mesh.
 *
 * Local-origin mesh (base centered at `(0, 0)`, resting on `z = 0`, lying
 * along local +x) — `app.ts` uploads it ONCE and translates/tints one
 * instance per live `HollowCorpseSnapshot` to its current
 * `[gx + 0.5, gy + 0.5, groundHeightAt(...)]`. A CARRIED corpse's `gx`/`gy`
 * already track its carrier's tile every tick (see sim-core's
 * `HollowCorpseSystem`'s CARRY-FOLLOW step + `Corpse.carriedBy`'s doc), so
 * this module and `app.ts`'s draw loop need no carry-specific logic at
 * all — they just draw wherever the snapshot says, same as every other
 * position-only prop in this app.
 *
 * Pure + deterministic: no RNG, a fixed hand-placed two-slab layout.
 */
import { box, merge, translate, type Mesh } from "@engine/core/render3d";
import { WHITE_TINT } from "./materials";
import { sicklyTint } from "./disease-tint";

const BODY_LEN = 0.85;
const BODY_WIDTH = 0.38;
const BODY_HEIGHT = 0.16;

const HEAD_LEN = 0.28;
const HEAD_WIDTH = 0.3;
const HEAD_HEIGHT = 0.13;
/** How far the head slab sits beyond the body slab's own end, along local
 *  +x — a small overlap so the two read as one continuous prone shape
 *  rather than two disjoint boxes. */
const HEAD_OVERLAP = 0.85;

/** Builds the corpse's static mesh — upload ONCE (see this module's header);
 *  the app instances/tints it once per live corpse. */
export function buildCorpseMesh(): Mesh {
  const body = translate(box([BODY_LEN, BODY_WIDTH, BODY_HEIGHT], "corpseShroud"), [
    -BODY_LEN / 2,
    -BODY_WIDTH / 2,
    0,
  ]);
  const head = translate(box([HEAD_LEN, HEAD_WIDTH, HEAD_HEIGHT], "corpseShroud"), [
    -BODY_LEN / 2 - HEAD_LEN * HEAD_OVERLAP,
    -HEAD_WIDTH / 2,
    0,
  ]);
  return merge(body, head);
}

/**
 * The per-instance tint for one corpse instance: the shroud material's own
 * color, unmodified, for a fresh body; a desaturated sickly-green multiplier
 * (`disease-tint.ts`'s `sicklyTint`, the SAME cue a diseased agent's
 * humanoid gets) once `rotting` — a rotting, unburied corpse is precisely
 * the thing spreading the disease (see sim-core's `HollowCorpseSystem`), so
 * sharing the visual cue is deliberate, not incidental. Pure.
 */
export function corpseTint(rotting: boolean): readonly [number, number, number, number] {
  return rotting ? sicklyTint(WHITE_TINT) : WHITE_TINT;
}
