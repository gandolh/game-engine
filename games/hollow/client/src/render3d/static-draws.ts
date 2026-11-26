/**
 * Hollow's static geometry as two merged meshes, each drawn as one instance (corpus brief 31). Brief 24 first
 * built these draws once per change instead of every frame; this goes one step further and merges them, so the
 * ground, the territory, the hearth, the graveyard and the homes cost two draw calls instead of five or more.
 *
 * - The **fixed** mesh: the ground, the hearth and the graveyard. Built from the first snapshot, and rebuilt
 *   only if the hearth's or the graveyard's tile changes (or one appears or goes).
 * - The **changing** mesh: every territory tile, in its community's territory material (`materials.ts`), and
 *   every home. Rebuilt when the territory key (each community's id and tile count, then every tile's `gx` and
 *   `gy` in order) or the homes key (each household's id, its frozen position and its member count) differs
 *   from the last one. Keeping the 8,192 ground triangles out of it means a territory change never re-packs
 *   them.
 *
 * Both are placed exactly where the per-instance draws put them: tiles at `[gx, gy, groundHeightAt(gx, gy) +
 * TERRITORY_TINT_Z_OFFSET]`, the hearth and the graveyard at `[gx + 0.5, gy + 0.5, groundHeightAt(gx, gy)]`,
 * homes at `[x, y, groundHeightAt(round(x), round(y))]`. Each is drawn as one identity instance with
 * `WHITE_TINT` and culled whole by its bounding sphere.
 *
 * Keys are compared without allocating: the new key is written into a scratch array, and only a difference
 * swaps it in. A rebuild uploads the new mesh, then releases the old one (`SceneRenderer3D.releaseMesh`), all
 * timed as `static.merge`. `upload` and `release` are arguments, so tests pass fakes.
 */
import { packInstances, translate, merge, identity, type Mesh } from "@engine/core/render3d";
import type { HollowSnapshot } from "@hollow/sim-core/sim-bootstrap";
import { GRID_SIZE } from "@hollow/sim-core/world";
import { territoryMaterialKey, WHITE_TINT } from "./materials";
import { buildGroundMesh, buildTerritoryTileMesh, TERRITORY_TINT_Z_OFFSET } from "./world-meshes";
import { buildHearthMesh } from "./hearth-mesh";
import { buildGraveyardMesh } from "./graveyard-mesh";
import { homeMeshFor, type HouseholdPosition } from "./household-layout";
import { groundHeightAt } from "./terrain";

/** The one instance a merged mesh is drawn with: the identity model and a white tint. Shared, never written. */
const MERGED_INSTANCE = packInstances([{ model: identity(), tint: WHITE_TINT }]);

/** A merged mesh's draw, kept until the mesh is rebuilt. With a `MeshHandle` it is a `DrawCall3d`. */
export interface MergedDraw<H> {
  readonly mesh: H;
  readonly instances: Float32Array;
  readonly instanceCount: number;
}

/** What `static.merge` is timed with: the app's profiler. */
export interface MergeTimer {
  time<T>(key: string, fn: () => T): T;
}

/** Fixed-mesh key: whether the hearth is there and its tile, then the same for the graveyard. */
const FIXED_KEY_LENGTH = 6;
/** Homes key entries per home: the household id, its x and y, its member count. */
const HOME_KEY_STRIDE = 4;

export class StaticMeshes<H> {
  private readonly upload: (mesh: Mesh) => H;
  private readonly release: (handle: H) => void;
  private readonly timer: MergeTimer;

  private readonly ground: Mesh;
  private readonly hearth = buildHearthMesh();
  private readonly graveyard = buildGraveyardMesh();
  private readonly tileByMaterial = new Map<string, Mesh>();
  private readonly homeByMemberCount = new Map<number, Mesh>();

  private fixedKey = new Int32Array(FIXED_KEY_LENGTH);
  private fixedScratch = new Int32Array(FIXED_KEY_LENGTH);
  private fixedBuilt = false;
  private territoryKey = new Int32Array(0);
  private territoryScratch = new Int32Array(0);
  private territoryKeyLength = -1;
  private homesKey = new Float64Array(0);
  private homesScratch = new Float64Array(0);
  private homesKeyLength = -1;

  private fixed: MergedDraw<H> | null = null;
  private changing: MergedDraw<H> | null = null;

  /** How many times each mesh was built; tests read them. */
  fixedBuilds = 0;
  changingBuilds = 0;

  constructor(
    upload: (mesh: Mesh) => H,
    release: (handle: H) => void,
    timer: MergeTimer,
    ground: Mesh = buildGroundMesh(GRID_SIZE),
  ) {
    this.upload = upload;
    this.release = release;
    this.timer = timer;
    this.ground = ground;
  }

  /** The ground, hearth and graveyard draw; `null` before the first `update`. */
  get fixedDraw(): MergedDraw<H> | null {
    return this.fixed;
  }

  /** The territory and homes draw; `null` while there is neither. */
  get changingDraw(): MergedDraw<H> | null {
    return this.changing;
  }

  /**
   * Rebuilds whichever mesh `snapshot` and `homes` change. `homes` are the frozen home positions (`HomeRegistry`)
   * for this snapshot's households, and `memberCounts` their sizes (a missing count is 1, as the home meshes read).
   */
  update(
    snapshot: HollowSnapshot,
    homes: ReadonlyMap<number, HouseholdPosition>,
    memberCounts: ReadonlyMap<number, number>,
  ): void {
    if (this.fixedKeyChanged(snapshot)) {
      this.fixedBuilds += 1;
      this.fixed = this.replace(this.fixed, () => this.buildFixed(snapshot));
    }
    // Both keys are written whatever the other says, so neither falls behind.
    const territoryChanged = this.territoryKeyChanged(snapshot);
    const homesChanged = this.homesKeyChanged(homes, memberCounts);
    if (territoryChanged || homesChanged) {
      this.changingBuilds += 1;
      this.changing = this.replace(this.changing, () => this.buildChanging(snapshot, homes, memberCounts));
    }
  }

  /** Uploads the new mesh, then releases the old one. */
  private replace(old: MergedDraw<H> | null, build: () => Mesh | null): MergedDraw<H> | null {
    return this.timer.time("static.merge", () => {
      const mesh = build();
      const next = mesh === null ? null : { mesh: this.upload(mesh), instances: MERGED_INSTANCE, instanceCount: 1 };
      if (old !== null) this.release(old.mesh);
      return next;
    });
  }

  private buildFixed(snapshot: HollowSnapshot): Mesh {
    const parts: Mesh[] = [this.ground];
    if (snapshot.hearth) parts.push(translate(this.hearth, featureOffset(snapshot.hearth)));
    if (snapshot.graveyard) parts.push(translate(this.graveyard, featureOffset(snapshot.graveyard)));
    return merge(...parts);
  }

  private buildChanging(
    snapshot: HollowSnapshot,
    homes: ReadonlyMap<number, HouseholdPosition>,
    memberCounts: ReadonlyMap<number, number>,
  ): Mesh | null {
    const parts: Mesh[] = [];
    for (const community of snapshot.communities) {
      const tile = this.tileFor(territoryMaterialKey(community.id));
      for (const { gx, gy } of community.territory) {
        parts.push(translate(tile, [gx, gy, groundHeightAt(gx, gy) + TERRITORY_TINT_Z_OFFSET]));
      }
    }
    for (const [householdId, pos] of homes) {
      const home = this.homeFor(memberCounts.get(householdId) ?? 1);
      parts.push(translate(home, [pos.x, pos.y, groundHeightAt(Math.round(pos.x), Math.round(pos.y))]));
    }
    return parts.length > 0 ? merge(...parts) : null;
  }

  private tileFor(materialKey: string): Mesh {
    let tile = this.tileByMaterial.get(materialKey);
    if (tile === undefined) {
      tile = buildTerritoryTileMesh(materialKey);
      this.tileByMaterial.set(materialKey, tile);
    }
    return tile;
  }

  private homeFor(memberCount: number): Mesh {
    let home = this.homeByMemberCount.get(memberCount);
    if (home === undefined) {
      home = homeMeshFor(memberCount);
      this.homeByMemberCount.set(memberCount, home);
    }
    return home;
  }

  private fixedKeyChanged(snapshot: HollowSnapshot): boolean {
    const s = this.fixedScratch;
    s[0] = snapshot.hearth ? 1 : 0;
    s[1] = snapshot.hearth?.gx ?? 0;
    s[2] = snapshot.hearth?.gy ?? 0;
    s[3] = snapshot.graveyard ? 1 : 0;
    s[4] = snapshot.graveyard?.gx ?? 0;
    s[5] = snapshot.graveyard?.gy ?? 0;
    if (this.fixedBuilt && sameInts(s, this.fixedKey, FIXED_KEY_LENGTH)) return false;
    this.fixedBuilt = true;
    this.fixedScratch = this.fixedKey;
    this.fixedKey = s;
    return true;
  }

  private territoryKeyChanged(snapshot: HollowSnapshot): boolean {
    let needed = 0;
    for (const community of snapshot.communities) needed += 2 + community.territory.length * 2;
    if (this.territoryScratch.length < needed) this.territoryScratch = new Int32Array(needed * 2);
    const s = this.territoryScratch;
    let n = 0;
    for (const community of snapshot.communities) {
      s[n++] = community.id;
      s[n++] = community.territory.length;
      for (const tile of community.territory) {
        s[n++] = tile.gx;
        s[n++] = tile.gy;
      }
    }
    if (n === this.territoryKeyLength && sameInts(s, this.territoryKey, n)) return false;
    // Keep the scratch as the new key, and give the old key array back as the next scratch.
    this.territoryScratch = this.territoryKey;
    this.territoryKey = s;
    this.territoryKeyLength = n;
    return true;
  }

  private homesKeyChanged(
    homes: ReadonlyMap<number, HouseholdPosition>,
    memberCounts: ReadonlyMap<number, number>,
  ): boolean {
    const needed = homes.size * HOME_KEY_STRIDE;
    if (this.homesScratch.length < needed) this.homesScratch = new Float64Array(needed * 2);
    const s = this.homesScratch;
    let n = 0;
    for (const [householdId, pos] of homes) {
      s[n++] = householdId;
      s[n++] = pos.x;
      s[n++] = pos.y;
      s[n++] = memberCounts.get(householdId) ?? 1;
    }
    if (n === this.homesKeyLength && sameFloats(s, this.homesKey, n)) return false;
    this.homesScratch = this.homesKey;
    this.homesKey = s;
    this.homesKeyLength = n;
    return true;
  }
}

/** Where the hearth's or the graveyard's local-origin mesh goes: the centre of its tile, on the ground. */
function featureOffset(tile: { readonly gx: number; readonly gy: number }): [number, number, number] {
  return [tile.gx + 0.5, tile.gy + 0.5, groundHeightAt(tile.gx, tile.gy)];
}

function sameInts(a: Int32Array, b: Int32Array, n: number): boolean {
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return true;
}

function sameFloats(a: Float64Array, b: Float64Array, n: number): boolean {
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return true;
}
