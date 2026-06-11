/**
 * TileFeatureSystem — manages trees, stones, and forageable berry-bushes on farms and dedicated zones.
 *
 * Spawn rates by region type:
 *   farm tiles:     2% tree / 1.5% stone / 1% berry-bush per empty tile per day, cap 6
 *   forest-north/south (tree zones): 25% tree + 8% berry-bush (understory), cap 20
 *   quarry-north/south (stone zones): 20% stone only, cap 20
 *
 * Forest zones spawn trees + the odd berry-bush; quarry zones always spawn
 * stones; farm tiles can spawn any of the three. Berry-bushes are forageable —
 * collecting one yields a random seed (see handleGatherBush). Each zone's
 * spawned features are attributed to the nearest farm (by center distance) as a
 * pathfinding-priority hint; any farmer can chop/mine/forage in any zone.
 */

import type { SimContext, System, World, MessageBus, Rng } from "@engine/core";
import type { GameEntity, TileFeatureKind } from "../components";
import { ONT_SIMULATION } from "../protocols";
import { REGIONS } from "../world/regions";

// Farm-tile rates (features supplement the dedicated zones)
const FARM_TREE_CHANCE  = 0.02;
const FARM_STONE_CHANCE = 0.015;
const FARM_BUSH_CHANCE  = 0.01;
const MAX_PER_FARM = 6;

// Dedicated zone rates and caps
const ZONE_TREE_CHANCE  = 0.25;
const ZONE_STONE_CHANCE = 0.20;
const ZONE_BUSH_CHANCE  = 0.08; // forests carry a berry-bush understory under the trees
const MAX_PER_ZONE = 20;

export class TileFeatureSystem implements System {
  readonly name = "TileFeatureSystem";
  private lastDayProcessed = -1;

  // Dedicated rng stream for feature placement — forked so cluster draws never shift the main sim rng stream.
  private readonly cluster: Rng;

  constructor(
    private readonly world: World<GameEntity>,
    private readonly rng: Rng,
    private readonly bus?: MessageBus,
  ) {
    this.cluster = rng.fork("tile-cluster");
  }

  run(ctx: SimContext): void {
    const stations = this.world.query("weatherStation", "inbox");
    let newDay: number | null = null;
    for (const station of stations) {
      for (const msg of station.inbox.messages) {
        if (msg.ontology === ONT_SIMULATION.DAY_START) {
          const day = (msg.body as { day: number }).day;
          if (day > this.lastDayProcessed) newDay = day;
        }
      }
      break;
    }
    if (newDay === null) return;
    this.lastDayProcessed = newDay;

    const occupiedByRegion = new Map<string, Set<string>>();
    const featureCountByRegion = new Map<string, number>();

    for (const e of this.world.query("plot")) {
      const rid = e.plot.regionId;
      const key = `${e.plot.tileX},${e.plot.tileY}`;
      if (!occupiedByRegion.has(rid)) occupiedByRegion.set(rid, new Set());
      occupiedByRegion.get(rid)!.add(key);
    }
    for (const e of this.world.query("fountain")) {
      const rid = e.fountain.regionId;
      const t = e.transform;
      if (!t) continue;
      const key = `${Math.round(t.x)},${Math.round(t.y)}`;
      if (!occupiedByRegion.has(rid)) occupiedByRegion.set(rid, new Set());
      occupiedByRegion.get(rid)!.add(key);
    }
    for (const e of this.world.query("tileFeature")) {
      const rid = e.tileFeature.regionId;
      const key = `${e.tileFeature.tileX},${e.tileFeature.tileY}`;
      if (!occupiedByRegion.has(rid)) occupiedByRegion.set(rid, new Set());
      occupiedByRegion.get(rid)!.add(key);
      featureCountByRegion.set(rid, (featureCountByRegion.get(rid) ?? 0) + 1);
    }
    // Block farmer standing positions on their own farm.
    for (const e of this.world.query("farmer", "transform")) {
      const rid = e.farmer.homeRegion;
      if (!rid) continue;
      const key = `${Math.round(e.transform.x)},${Math.round(e.transform.y)}`;
      if (!occupiedByRegion.has(rid)) occupiedByRegion.set(rid, new Set());
      occupiedByRegion.get(rid)!.add(key);
    }

    const farmOwnerByRegion = new Map<string, number>();
    for (const e of this.world.query("farmer")) {
      const rid = e.farmer.homeRegion;
      if (rid && e.id !== undefined) farmOwnerByRegion.set(rid, e.id);
    }

    for (const def of REGIONS) {
      const isForest = def.id === "forest-north" || def.id === "forest-south";
      const isQuarry = def.id === "quarry-north" || def.id === "quarry-south";
      const isFarm   = def.kind === "farm";

      if (!isFarm && !isForest && !isQuarry) continue;

      // Ownership = nearest farm by center distance (pathfinding-priority hint only; any farmer may gather).
      let ownerId: number | undefined;
      if (isFarm) {
        ownerId = farmOwnerByRegion.get(def.id);
      } else {
        let bestDist = Infinity;
        for (const farmDef of REGIONS) {
          if (farmDef.kind !== "farm") continue;
          const id = farmOwnerByRegion.get(farmDef.id);
          if (id === undefined) continue;
          const dx = farmDef.center.x - def.center.x;
          const dy = farmDef.center.y - def.center.y;
          const d = dx * dx + dy * dy;
          if (d < bestDist) { bestDist = d; ownerId = id; }
        }
      }
      if (ownerId === undefined) continue;

      const rid = def.id;
      const maxFeatures = (isForest || isQuarry) ? MAX_PER_ZONE : MAX_PER_FARM;
      const currentCount = featureCountByRegion.get(rid) ?? 0;
      if (currentCount >= maxFeatures) continue;

      const occupied = occupiedByRegion.get(rid) ?? new Set<string>();

      const candidates: Array<{ x: number; y: number }> = [];
      for (let ty = def.bounds.minY; ty <= def.bounds.maxY; ty++) {
        for (let tx = def.bounds.minX; tx <= def.bounds.maxX; tx++) {
          if (!occupied.has(`${tx},${ty}`)) candidates.push({ x: tx, y: ty });
        }
      }
      if (candidates.length === 0) continue;

      // One roll per candidate (Binomial draw on the forked stream) to decide count;
      // farm tiles tag each slot tree-or-stone preserving the original tree/stone mix.
      const slots: Array<TileFeatureKind> = [];
      const room = maxFeatures - currentCount; // cap headroom (>0 here)
      for (const _candidate of candidates) {
        if (slots.length >= room) break;
        const r = this.cluster.nextFloat();
        if (isForest) {
          if (r < ZONE_TREE_CHANCE) slots.push("tree");
          else if (r < ZONE_TREE_CHANCE + ZONE_BUSH_CHANCE) slots.push("bush");
        } else if (isQuarry) {
          if (r < ZONE_STONE_CHANCE) slots.push("stone");
        } else {
          if (r < FARM_TREE_CHANCE) slots.push("tree");
          else if (r < FARM_TREE_CHANCE + FARM_STONE_CHANCE) slots.push("stone");
          else if (r < FARM_TREE_CHANCE + FARM_STONE_CHANCE + FARM_BUSH_CHANCE) slots.push("bush");
        }
      }
      if (slots.length === 0) continue;

      // Place in organic clusters: BFS outward from sqrt(count) seed centers, round-robin.
      const targetCount = slots.length;
      const centerCount = Math.max(1, Math.min(4, Math.round(Math.sqrt(targetCount))));

      const placements = this.growClusters(candidates, occupied, centerCount, targetCount);

      for (let i = 0; i < placements.length; i++) {
        const { x, y } = placements[i]!;
        const kind = slots[i]!;
        const frame =
          kind === "tree" ? "structure/tree" :
          kind === "stone" ? "structure/stone" :
          "structure/bush";
        this.world.spawn({
          transform: { x, y, prevX: x, prevY: y, rotation: 0 },
          sprite: { atlasId: "main", frame, layer: 30, tintRgba: 0xffffffff },
          tileFeature: { kind, tileX: x, tileY: y, regionId: rid, ownerId },
        });
        occupied.add(`${x},${y}`);
      }
    }
  }

  /**
   * Grow up to `targetCount` cluster placements over the empty `candidates` of a
   * region. Picks `centerCount` seed tiles, then expands each cluster by BFS into
   * adjacent (4-neighbour) empty in-region tiles, round-robin across clusters so
   * they fill evenly. All randomness is drawn from the forked `this.cluster`
   * stream in a fixed order, so placement is fully deterministic.
   *
   * Returns at most `targetCount` distinct tile coords (fewer only if the region
   * has fewer reachable empty tiles than requested).
   */
  private growClusters(
    candidates: ReadonlyArray<{ x: number; y: number }>,
    occupied: ReadonlySet<string>,
    centerCount: number,
    targetCount: number,
  ): Array<{ x: number; y: number }> {
    const key = (x: number, y: number) => `${x},${y}`;
    const inRegion = new Set<string>();
    for (const c of candidates) inRegion.add(key(c.x, c.y));

    const claimed = new Set<string>();
    const result: Array<{ x: number; y: number }> = [];

    const frontiers: Array<Array<{ x: number; y: number }>> = [];
    const seedPool = [...candidates];
    const seeds = Math.min(centerCount, seedPool.length);
    for (let s = 0; s < seeds; s++) {
      const idx = this.cluster.int(0, seedPool.length);
      const center = seedPool[idx]!;
      seedPool[idx] = seedPool[seedPool.length - 1]!;
      seedPool.pop();
      frontiers.push([center]);
    }

    let active = true;
    while (result.length < targetCount && active) {
      active = false;
      for (let f = 0; f < frontiers.length && result.length < targetCount; f++) {
        const frontier = frontiers[f]!;
        // Pop the next unclaimed frontier tile for this cluster.
        let placed = false;
        while (frontier.length > 0 && !placed) {
          const tile = frontier.shift()!;
          const k = key(tile.x, tile.y);
          if (claimed.has(k) || !inRegion.has(k)) continue;
          claimed.add(k);
          result.push(tile);
          placed = true;
          active = true;
          const neighbours = [
            { x: tile.x + 1, y: tile.y },
            { x: tile.x - 1, y: tile.y },
            { x: tile.x, y: tile.y + 1 },
            { x: tile.x, y: tile.y - 1 },
          ];
          for (const n of neighbours) {
            const nk = key(n.x, n.y);
            if (inRegion.has(nk) && !claimed.has(nk) && !occupied.has(nk)) {
              frontier.push(n);
            }
          }
        }
      }
    }

    // Top up from unclaimed tiles if clusters ran dry (fragmented region).
    if (result.length < targetCount) {
      for (const c of candidates) {
        if (result.length >= targetCount) break;
        const k = key(c.x, c.y);
        if (!claimed.has(k)) {
          claimed.add(k);
          result.push(c);
        }
      }
    }

    return result;
  }
}
