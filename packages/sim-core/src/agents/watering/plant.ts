import type { GameEntity } from "../../components";
import { recordReason } from "../../components";
import type { FruitKind } from "../../components";
import { REGIONS } from "../../world/regions";
import { TREE_PLANT_COST, GREENHOUSE_BUILD_COST } from "../../economy";
import { isWithinReach } from "../../systems/proximity";
import { nearestTile } from "./shared";

/** Queue a plant intent on the nearest empty plot, or travel to it. Returns false if no empty plots. */
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
    const target = inReach[0]!;
    farmer.intentions.queue.push({
      kind: "plant",
      data: { crop, tileX: target.tileX, tileY: target.tileY },
      priority,
    });
    return true;
  }

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

/** Queue plant-tree on a free farm tile when affordable (above reserve) and under maxTrees. */
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

  const homeRegion = farmer.farmer.homeRegion;
  const farmDef = homeRegion ? REGIONS.find(r => r.id === homeRegion) : undefined;
  if (!farmDef || farmDef.kind !== "farm") return;

  const occupied = new Set<string>((farmer.beliefs?.data["occupiedTiles"] as string[] | undefined) ?? []);

  // Pick the nearest free tile (not top-left-first) so the plant trip lands same-day at low ticks.
  const free: Array<{ tileX: number; tileY: number }> = [];
  for (let ty = farmDef.bounds.minY; ty <= farmDef.bounds.maxY; ty++) {
    for (let tx = farmDef.bounds.minX; tx <= farmDef.bounds.maxX; tx++) {
      if (!occupied.has(`${tx},${ty}`)) free.push({ tileX: tx, tileY: ty });
    }
  }
  const near = nearestTile(farmer.transform, free);
  const target: { x: number; y: number } | null = near ? { x: near.tileX, y: near.tileY } : null;
  if (!target) return;

  const inReach = isWithinReach(farmer.transform, target.x, target.y);
  if (!inReach) {
    const wanted = travelPriority ?? -1;
    const existing = farmer.intentions.queue.find(i => i.kind === "travel" && i.data.targetTile);
    if (existing) {
      // On a commit day, retarget+upgrade any existing tile-travel to the orchard tile.
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

/** Queue harvest-fruit for any ready trees on the farmer's farm. */
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
 * Plant a premium crop in an empty greenhouse plot (season-immune; grows at full rate year-round).
 * Buys seed first if not on hand; one plot per call; travels to the greenhouse tile when out of reach.
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
    if (farmer.inventory.gold - seedCost < reserve) return;
    if (!farmer.intentions.queue.some(i => i.kind === "buy-seed" && i.data.crop === crop)) {
      farmer.intentions.queue.push({ kind: "buy-seed", data: { crop, quantity: 1 }, priority: priority + 1 });
      recordReason(farmer, `buy ${crop} seed for greenhouse`);
    }
    return;
  }

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
 * Queue build-greenhouse at the carpenter. Gold-funded; wood+stone are an optional discount.
 * `travelPriority` — winning carpentry-travel priority; undefined = non-committal (priority + 1).
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

  const recipe = GREENHOUSE_BUILD_COST;
  const wood = farmer.resources?.wood ?? 0;
  const stone = farmer.resources?.stone ?? 0;
  const useMaterials = wood >= recipe.woodCost && stone >= recipe.stoneCost;
  const goldDue = useMaterials ? recipe.goldCost - recipe.goldDiscount : recipe.goldCost;
  if (farmer.inventory.gold - goldDue < reserve) return;

  if (farmer.intentions.queue.some(i => i.kind === "build-greenhouse")) return;

  const inCarpentry = farmer.farmer.currentRegion === "carpentry";
  if (!inCarpentry) {
    const wanted = travelPriority ?? priority + 1;
    const existing = farmer.intentions.queue.find(i => i.kind === "travel" && i.data.targetRegionId === "carpentry");
    if (existing) {
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
