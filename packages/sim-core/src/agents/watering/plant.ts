import type { GameEntity } from "../../components";
import { recordReason } from "../../components";
import type { FruitKind } from "../../components";
import { REGIONS } from "../../world/regions";
import { TREE_PLANT_COST, GREENHOUSE_BUILD_COST } from "../../economy";
import { isWithinReach } from "../../systems/proximity";
import { nearestTile } from "./shared";

/**
 * brief (proximity) — proximity-aware plant helper.
 *
 * Picks the first empty plot near the farmer and enqueues a plant intent for it,
 * OR travels to the nearest empty plot tile if none is within reach.
 *
 * Call this INSTEAD of pushing a raw `plant` intent in a personality, passing
 * the already-decided crop and priority. Returns true if a plant (or travel toward
 * a planting spot) was enqueued, false if no empty plots exist.
 */
export function deliberatePlantNearby(
  farmer: GameEntity,
  crop: import("../../components").CropKind,
  priority: number,
): boolean {
  if (!farmer.intentions) return false;
  const sense = farmer.beliefs?.data.plotWater as import("../../systems/plot-sense").PlotWaterSense | undefined;
  const emptyPlots = sense?.emptyPlots ?? [];
  if (emptyPlots.length === 0) return false;

  const transform = farmer.transform;
  const inReach = emptyPlots.filter(p => isWithinReach(transform, p.tileX, p.tileY));

  if (inReach.length > 0) {
    // Plant on the first empty plot within reach (already sorted tileY, tileX).
    const target = inReach[0]!;
    farmer.intentions.queue.push({
      kind: "plant",
      data: { crop, tileX: target.tileX, tileY: target.tileY },
      priority,
    });
    return true;
  }

  // No empty plot within reach — travel to the nearest one.
  const nearest = nearestTile(transform, emptyPlots);
  if (nearest && !farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetTile)) {
    farmer.intentions.queue.push({
      kind: "travel",
      data: { targetTile: { x: nearest.tileX, y: nearest.tileY } },
      priority: -1,
    });
  }
  return false;
}

/**
 * Queue a `plant-tree` intent on a free farm tile if the farmer:
 *   - can afford the tree (above reserve)
 *   - has fewer than maxTrees orchards on their farm
 *   - is at (or near) their farm
 */
export function deliberatePlantOrchard(
  farmer: GameEntity,
  kind: FruitKind,
  maxTrees: number,
  reserve: number,
  priority: number,
  /** Winning travel priority to reach the planting tile on an invest day (see deliberateBuildPen). */
  travelPriority?: number,
): void {
  if (!farmer.intentions || !farmer.inventory || !farmer.farmer || farmer.id === undefined) return;
  const cost = TREE_PLANT_COST[kind];
  if (farmer.inventory.gold - cost < reserve) return;

  const treeCount = farmer.beliefs?.data["orchardCount"] as number | undefined ?? 0;
  if (treeCount >= maxTrees) return;

  if (farmer.intentions.queue.some(i => i.kind === "plant-tree" && i.data.kind === kind)) return;

  // Find a free tile on the farm (from beliefs occupiedTiles).
  const homeRegion = farmer.farmer.homeRegion;
  const farmDef = homeRegion ? REGIONS.find(r => r.id === homeRegion) : undefined;
  if (!farmDef || farmDef.kind !== "farm") return;

  const occupied = new Set<string>((farmer.beliefs?.data["occupiedTiles"] as string[] | undefined) ?? []);

  // Collect ALL free tiles, then pick the one NEAREST the farmer so the tree
  // goes on a tile she can plant without a long cross-farm hop. At low ticks/day
  // walking is expensive, and the old top-left-first pick frequently chose a tile
  // far from her current position — so the plant trip never finished and the
  // orchard stayed unplanted. Proximity selection makes planting land same-day.
  const free: Array<{ tileX: number; tileY: number }> = [];
  for (let ty = farmDef.bounds.minY; ty <= farmDef.bounds.maxY; ty++) {
    for (let tx = farmDef.bounds.minX; tx <= farmDef.bounds.maxX; tx++) {
      if (!occupied.has(`${tx},${ty}`)) free.push({ tileX: tx, tileY: ty });
    }
  }
  // `free` is built in (tileY, tileX) order, the deterministic tie-break nearestTile expects.
  const near = nearestTile(farmer.transform, free);
  const target: { x: number; y: number } | null = near ? { x: near.tileX, y: near.tileY } : null;
  if (!target) return;

  const inReach = isWithinReach(farmer.transform, target.x, target.y);
  if (!inReach) {
    const wanted = travelPriority ?? -1;
    const existing = farmer.intentions.queue.find(i => i.kind === "travel" && i.data.targetTile);
    if (existing) {
      // A watering/till hop to a tile may already be queued. When COMMITTING the
      // planting, retarget+upgrade it to the free orchard tile so the trip lands
      // here (the tree is what matters this quiet day); otherwise leave it.
      if (wanted < existing.priority) {
        existing.priority = wanted;
        existing.data = { targetTile: { x: target.x, y: target.y } };
      }
    } else {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetTile: { x: target.x, y: target.y } },
        priority: wanted,
      });
    }
    return;
  }

  farmer.intentions.queue.push({
    kind: "plant-tree",
    data: { kind, tileX: target.x, tileY: target.y },
    priority,
  });
  recordReason(farmer, `plant ${kind} tree (orchards: ${treeCount}/${maxTrees})`);
}

/**
 * Queue harvest-fruit intents for any ready fruit trees on the farmer's farm.
 */
export function deliberateHarvestFruit(
  farmer: GameEntity,
  priority: number,
): void {
  if (!farmer.intentions || !farmer.farmer || farmer.id === undefined) return;

  const readyTrees = farmer.beliefs?.data["orchardFruitReady"] as Array<{ tileX: number; tileY: number; kind: string }> | undefined;
  if (!readyTrees || readyTrees.length === 0) return;

  for (const tree of readyTrees) {
    if (farmer.intentions.queue.some(i => i.kind === "harvest-fruit" && i.data.tileX === tree.tileX && i.data.tileY === tree.tileY)) continue;
    const inReach = isWithinReach(farmer.transform, tree.tileX, tree.tileY);
    if (!inReach) {
      if (!farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetTile)) {
        farmer.intentions.queue.push({
          kind: "travel",
          data: { targetTile: { x: tree.tileX, y: tree.tileY } },
          priority: -1,
        });
      }
      continue;
    }
    farmer.intentions.queue.push({
      kind: "harvest-fruit",
      data: { tileX: tree.tileX, tileY: tree.tileY },
      priority,
    });
    recordReason(farmer, `harvest ${tree.kind} fruit`);
  }
}

/**
 * brief 43 — plant a HIGH-VALUE crop in any empty greenhouse plot, regardless of
 * season. This is the whole strategic point of the greenhouse: a season-immune
 * plot grows premium out-of-season crops at full rate. The farmer plants from
 * seeds on hand if possible, else buys the crop's seed (gated on reserve). One
 * plot per call (chains across deliberation cycles via the proximity walk), with
 * a travel hop to the greenhouse tile when out of reach.
 *
 * `crop` — the year-round crop to grow under glass (e.g. "grape", the priciest).
 */
export function deliberateGreenhousePlant(
  farmer: GameEntity,
  crop: import("../../components").CropKind,
  seedCost: number,
  reserve: number,
  priority: number,
): void {
  if (!farmer.intentions || !farmer.inventory) return;
  const empty = (farmer.beliefs?.data["greenhouseEmptyPlots"] as Array<{ tileX: number; tileY: number }> | undefined) ?? [];
  if (empty.length === 0) return;

  const haveSeed = farmer.inventory.seeds[crop] >= 1;
  if (!haveSeed) {
    // Buy a seed first if affordable above reserve; the plant lands next cycle.
    if (farmer.inventory.gold - seedCost < reserve) return;
    if (!farmer.intentions.queue.some(i => i.kind === "buy-seed" && i.data.crop === crop)) {
      farmer.intentions.queue.push({ kind: "buy-seed", data: { crop, quantity: 1 }, priority: priority + 1 });
      recordReason(farmer, `buy ${crop} seed for greenhouse`);
    }
    return;
  }

  // Pick the nearest empty greenhouse plot; plant if in reach, else travel.
  const target = empty[0]!;
  if (isWithinReach(farmer.transform, target.tileX, target.tileY)) {
    if (!farmer.intentions.queue.some(i => i.kind === "plant" && i.data.tileX === target.tileX && i.data.tileY === target.tileY)) {
      farmer.intentions.queue.push({ kind: "plant", data: { crop, tileX: target.tileX, tileY: target.tileY }, priority });
      recordReason(farmer, `plant ${crop} in greenhouse (year-round)`);
    }
  } else if (!farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetTile)) {
    farmer.intentions.queue.push({
      kind: "travel",
      data: { targetTile: { x: target.tileX, y: target.tileY } },
      priority: -1,
    });
  }
}

/**
 * brief 43 — queue a `build-greenhouse` intent (the run's heaviest sink) using
 * brief 42's working excursion pattern. Fires only on a quiet invest day with a
 * comfortable surplus over `reserve`, exactly like the pen build: the greenhouse
 * is built AT the carpenter, so the carpentry TRAVEL leg needs a WINNING (low)
 * priority on the commit day or the trip never wins queue[0] and the feature
 * reads as dormant. Gold-funded (wood+stone are an optional discount), so a
 * patient gold-rich farmer can commit without ever gathering materials.
 *
 * `travelPriority` — winning carpentry-travel priority on the commit day
 * (undefined falls back to the non-committal `priority + 1`).
 */
export function deliberateBuildGreenhouse(
  farmer: GameEntity,
  reserve: number,
  priority: number,
  travelPriority?: number,
): void {
  if (!farmer.intentions || !farmer.inventory || !farmer.farmer || farmer.id === undefined) return;

  // Already has one? (surfaced into beliefs by PlotSenseSystem)
  const hasGreenhouse = farmer.beliefs?.data["hasGreenhouse"] as boolean | undefined;
  if (hasGreenhouse) return;

  // Gate on the gold the farmer would actually pay (discounted only if she holds
  // BOTH materials), so a wood/stone-poor but gold-rich patient farmer can still
  // commit — same lesson as the pen build.
  const recipe = GREENHOUSE_BUILD_COST;
  const wood = farmer.resources?.wood ?? 0;
  const stone = farmer.resources?.stone ?? 0;
  const useMaterials = wood >= recipe.woodCost && stone >= recipe.stoneCost;
  const goldDue = useMaterials ? recipe.goldCost - recipe.goldDiscount : recipe.goldCost;
  if (farmer.inventory.gold - goldDue < reserve) return;

  // Don't double-queue.
  if (farmer.intentions.queue.some(i => i.kind === "build-greenhouse")) return;

  const inCarpentry = farmer.farmer.currentRegion === "carpentry";
  if (!inCarpentry) {
    const wanted = travelPriority ?? priority + 1;
    const existing = farmer.intentions.queue.find(i => i.kind === "travel" && i.data.targetRegionId === "carpentry");
    if (existing) {
      // Upgrade a shadowing carpentry trip so the build trip wins queue[0]
      // instead of being deduped out (same fix as the pen build).
      if (wanted < existing.priority) existing.priority = wanted;
    } else {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetRegionId: "carpentry" },
        priority: wanted,
      });
    }
  }
  farmer.intentions.queue.push({
    kind: "build-greenhouse",
    data: {},
    priority,
  });
  recordReason(
    farmer,
    `build greenhouse — surplus gold ${farmer.inventory.gold}, ${goldDue}g${useMaterials ? " (material discount)" : ""}`,
  );
}
