/**
 * Draw data that only changes when a snapshot's content does (corpus brief 24). The ground is one fixed
 * instance, and the territory tint is one tile instance per territory tile: both were rebuilt and packed on
 * every frame, although territory changes at most when a snapshot arrives (about 20 a second, against 60
 * frames).
 *
 * Territory is keyed on exactly what the instances depend on: each community's id (its tint) and every tile's
 * `gx`/`gy` in order (its position; the height comes from the fixed terrain). A new snapshot is compared to
 * the last key without allocating, and the packed buffer is rebuilt only if they differ. The same snapshot
 * object seen again on the next frame skips even the comparison.
 */
import { packInstances, translation, identity, type InstanceInput } from "@engine/core/render3d";
import type { HollowSnapshot } from "@hollow/sim-core/sim-bootstrap";
import { territoryTintColor, WHITE_TINT } from "./materials";
import { TERRITORY_TINT_Z_OFFSET } from "./world-meshes";
import { groundHeightAt } from "./terrain";

/** The ground's single packed instance, built once. */
export function packGroundInstance(): Float32Array {
  return packInstances([{ model: identity(), tint: WHITE_TINT }]);
}

export interface TerritoryInstances {
  /** The packed instance rows; the same array until the territory changes. */
  readonly instances: Float32Array;
  readonly count: number;
}

export class TerritoryInstanceCache {
  private key = new Int32Array(0);
  private keyLength = -1;
  private scratch = new Int32Array(0);
  private lastSnapshot: HollowSnapshot | null = null;
  private current: TerritoryInstances | null = null;
  /** How many times the instances were built; tests read it. */
  builds = 0;

  /** The territory instances for `snapshot`, or `null` when no community owns a tile. */
  get(snapshot: HollowSnapshot): TerritoryInstances | null {
    if (snapshot === this.lastSnapshot) return this.current;
    this.lastSnapshot = snapshot;

    // Write the snapshot's territory key into the scratch array (grown, never shrunk).
    let needed = 0;
    for (const community of snapshot.communities) needed += 2 + community.territory.length * 2;
    if (this.scratch.length < needed) this.scratch = new Int32Array(needed * 2);
    const scratch = this.scratch;
    let n = 0;
    for (const community of snapshot.communities) {
      scratch[n++] = community.id;
      scratch[n++] = community.territory.length;
      for (const tile of community.territory) {
        scratch[n++] = tile.gx;
        scratch[n++] = tile.gy;
      }
    }

    if (n === this.keyLength) {
      let same = true;
      for (let i = 0; i < n; i++) {
        if (scratch[i] !== this.key[i]) {
          same = false;
          break;
        }
      }
      if (same) return this.current;
    }

    // Changed: keep the scratch as the new key, and give the old key array back as the next scratch.
    const old = this.key;
    this.key = scratch;
    this.scratch = old;
    this.keyLength = n;
    this.current = this.build(snapshot);
    return this.current;
  }

  private build(snapshot: HollowSnapshot): TerritoryInstances | null {
    this.builds += 1;
    const list: InstanceInput[] = [];
    for (const community of snapshot.communities) {
      const tint = territoryTintColor(community.id);
      for (const tile of community.territory) {
        const z = groundHeightAt(tile.gx, tile.gy) + TERRITORY_TINT_Z_OFFSET;
        list.push({ model: translation([tile.gx, tile.gy, z]), tint });
      }
    }
    return list.length > 0 ? { instances: packInstances(list), count: list.length } : null;
  }
}
