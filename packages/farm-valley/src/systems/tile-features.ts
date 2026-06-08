/**
 * TileFeatureSystem — manages trees and stones on farms and dedicated zones.
 *
 * Spawn rates by region type:
 *   farm tiles:     2% tree / 1.5% stone per empty tile per day, cap 6
 *   forest-north/south (tree zones): 25% tree only, cap 20
 *   quarry-north/south (stone zones): 20% stone only, cap 20
 *
 * Forest zones always spawn trees; quarry zones always spawn stones. Farm
 * tiles can spawn either. Each zone's spawned features are attributed to the
 * nearest farm (by center distance) as a pathfinding-priority hint; any farmer
 * can chop/mine in any zone.
 */

import type { SimContext, System, World, MessageBus, Rng } from "@engine/core";
import type { GameEntity } from "../components";
import { ONT_SIMULATION } from "../protocols";
import { REGIONS } from "../world/regions";

// Farm-tile rates (features supplement the dedicated zones)
const FARM_TREE_CHANCE  = 0.02;
const FARM_STONE_CHANCE = 0.015;
const MAX_PER_FARM = 6;

// Dedicated zone rates and caps
const ZONE_TREE_CHANCE  = 0.25;
const ZONE_STONE_CHANCE = 0.20;
const MAX_PER_ZONE = 20;

export class TileFeatureSystem implements System {
  readonly name = "TileFeatureSystem";
  private lastDayProcessed = -1;

  constructor(
    private readonly world: World<GameEntity>,
    private readonly rng: Rng,
    private readonly bus?: MessageBus,
  ) {}

  run(ctx: SimContext): void {
    // Trigger once per new day.
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

    // --- Build occupied-tile sets per region ---
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

    // --- Collect primary owner id per farm region ---
    const farmOwnerByRegion = new Map<string, number>();
    for (const e of this.world.query("farmer")) {
      const rid = e.farmer.homeRegion;
      if (rid && e.id !== undefined) farmOwnerByRegion.set(rid, e.id);
    }

    // --- Spawn loop over farms and resource zones ---
    for (const def of REGIONS) {
      const isForest = def.id === "forest-north" || def.id === "forest-south";
      const isQuarry = def.id === "quarry-north" || def.id === "quarry-south";
      const isFarm   = def.kind === "farm";

      if (!isFarm && !isForest && !isQuarry) continue;

      // Determine owner id: for zones, pick the nearest farm by center distance
      // (ownership is only a pathfinding-priority hint — any farmer may gather
      // anywhere). Generalizes the old hardcoded N/S corner pairs to any farm.
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

      // Gather empty candidate tiles.
      const candidates: Array<{ x: number; y: number }> = [];
      for (let ty = def.bounds.minY; ty <= def.bounds.maxY; ty++) {
        for (let tx = def.bounds.minX; tx <= def.bounds.maxX; tx++) {
          if (!occupied.has(`${tx},${ty}`)) candidates.push({ x: tx, y: ty });
        }
      }

      // Fisher-Yates shuffle (deterministic via Rng).
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng.nextFloat() * (i + 1));
        const a = candidates[i]!;
        const b = candidates[j]!;
        candidates[i] = b;
        candidates[j] = a;
      }

      let spawned = currentCount;
      for (const { x, y } of candidates) {
        if (spawned >= maxFeatures) break;

        const r = this.rng.nextFloat();
        let kind: "tree" | "stone" | null = null;

        if (isForest) {
          // Forest zone: trees only
          if (r < ZONE_TREE_CHANCE) kind = "tree";
        } else if (isQuarry) {
          // Quarry zone: stones only
          if (r < ZONE_STONE_CHANCE) kind = "stone";
        } else {
          // Farm tile: mixed low-rate spawns
          if (r < FARM_TREE_CHANCE) kind = "tree";
          else if (r < FARM_TREE_CHANCE + FARM_STONE_CHANCE) kind = "stone";
        }

        if (kind === null) continue;

        const frame = kind === "tree" ? "structure/tree" : "structure/stone";
        this.world.spawn({
          transform: { x, y, prevX: x, prevY: y, rotation: 0 },
          sprite: { atlasId: "main", frame, layer: 30, tintRgba: 0xffffffff },
          tileFeature: { kind, tileX: x, tileY: y, regionId: rid, ownerId },
        });
        occupied.add(`${x},${y}`);
        spawned++;
      }
    }
  }
}
