import type { GameEntity } from "../components";
import { recordReason, DECORATION_RECIPE, MAX_DECORATION_BOOST, TOOL_PRICE } from "../components";
import type { DecorationKind, FarmDecoration, ToolKind, FruitKind } from "../components";
import type { PlotWaterSense } from "../systems/plot-sense";
import { REGIONS, isFishingIsle } from "../world/regions";
import { seasonForDay, type Season } from "../protocols/weather";
import { isWithinReach } from "../systems/proximity";
import {
  PEN_BUILD_COST,
  ANIMAL_BUY_COST,
  TREE_PLANT_COST,
  FRUIT_SEASON,
  totalProductCount,
  totalFruitCount,
  GREENHOUSE_BUILD_COST,
} from "../economy";

/**
 * brief 29 — survival-reflex watering, shared by all four personalities and
 * called from each `deliberate*`. Watering is a baseline priority (a crop dies
 * after DRY_DEATH_GRACE_DAYS=2 dry days), so every personality waters its due
 * plots BEFORE discretionary actions. Personality flavors only the *timing*:
 *
 *   dryThreshold — water a due plot once its dryness reaches this many days.
 *     0 = water every day (never risk the grace window; conservative/hoarder).
 *     1 = wait a day before watering, banking AP (opportunist; aggressive who
 *         may let a marginal plot slip).
 *   maxWaterPerDay — cap on watering actions queued (aggressive over-plants and
 *     won't tend every plot). undefined = water all due plots.
 *
 * Watering intents get a high-importance (low number) priority so the AP pruner
 * keeps them over discretionary actions. Each `water` intent tends one plot
 * (ActSystem waters the most-dry due plot), so we queue up to `due` of them.
 */
export interface WateringStyle {
  dryThreshold: number;
  maxWaterPerDay?: number;
}

/** Water sources where a `refill-can` action succeeds (see ActSystem). */
const WELL_REGIONS = ["well-north", "well-south"] as const;

/**
 * Check if the watering can needs a refill and queue a refill-can intent if so.
 * Must be called BEFORE deliberateWatering so the refill lands before water actions.
 *
 * brief (proximity) — prefers traveling to the fountain TILE (so the farmer is
 * adjacent to the fountain when the refill executes). Falls back to region travel
 * if the fountain tile isn't in beliefs.
 */
export function deliberateRefillCan(farmer: GameEntity, planWaterCount: number): void {
  const can = farmer.inventory?.wateringCan;
  if (!can || !farmer.intentions || !farmer.farmer) return;
  // If we plan to water more plots than remaining charges, refill first.
  if (can.charges >= planWaterCount && can.charges !== 0) return;

  // Resolve the nearest water-source TILE (home fountain or well center).
  const sense = farmer.beliefs?.data.plotWater as PlotWaterSense | undefined;
  const fountainTile = sense?.fountainTile;

  // Compute the nearest water-source tile: home fountain tile (from beliefs if
  // available) or the nearest well/home region center (fallback).
  let nearestSourceTile: { x: number; y: number } | undefined;
  if (fountainTile) {
    nearestSourceTile = fountainTile;
  } else {
    // Fallback: use the nearest water source region center (home or well).
    const sourceRegionId = nearestWaterSource(farmer);
    if (sourceRegionId) {
      const def = REGIONS.find(r => r.id === sourceRegionId);
      if (def) nearestSourceTile = def.center;
    }
  }

  if (!nearestSourceTile) return; // no water source known — skip

  const nearSource = isWithinReach(farmer.transform, nearestSourceTile.x, nearestSourceTile.y);

  if (!nearSource) {
    // Not adjacent to any water source — travel to the fountain tile; act next cycle.
    if (!farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetTile)) {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetTile: { x: nearestSourceTile.x, y: nearestSourceTile.y } },
        priority: -1,
      });
    }
    recordReason(farmer, `travel to refill (${can.charges}/${can.maxCharges} charges)`);
    return;
  }

  // Adjacent to a water source — queue the refill action.
  farmer.intentions.queue.push({
    kind: "refill-can",
    data: {},
    priority: 0, // same as water — survival
  });
  recordReason(farmer, `refill can (${can.charges}/${can.maxCharges} charges)`);
}

/**
 * Pick the nearest water source region to the farmer: their home farm (fountain)
 * or a well, by Manhattan distance from the farmer's current tile to each
 * region center. Returns the home region as a safe default.
 */
function nearestWaterSource(farmer: GameEntity): string | undefined {
  const home = farmer.farmer?.homeRegion;
  const t = farmer.transform;
  if (!t) return home;
  const candidates: string[] = [...WELL_REGIONS];
  if (home) candidates.push(home);
  let best: string | undefined = home;
  let bestDist = Infinity;
  for (const id of candidates) {
    const def = REGIONS.find(r => r.id === id);
    if (!def) continue;
    const d = Math.abs(def.center.x - t.x) + Math.abs(def.center.y - t.y);
    if (d < bestDist) {
      bestDist = d;
      best = id;
    }
  }
  return best;
}

/**
 * Queue a buy-tool intent when the farmer has no usable tool of the given kind
 * and can afford a wooden replacement. Travels to village if needed.
 * Called before deliberateTill so a broken hoe is replaced before tilling fires.
 */
export function deliberateBuyTool(
  farmer: GameEntity,
  toolKind: ToolKind,
  priority: number,
): void {
  if (!farmer.intentions || !farmer.inventory || !farmer.farmer) return;
  const tools = farmer.inventory.tools ?? [];
  const hasUsable = tools.some(t => t.kind === toolKind && t.durability > 0);
  if (hasUsable) return;

  const price = TOOL_PRICE["wooden"];
  if (farmer.inventory.gold < price) return;

  // Don't double-queue.
  if (farmer.intentions.queue.some(i => i.kind === "buy-tool" && i.data.toolKind === toolKind)) return;

  const inVillage = farmer.farmer.currentRegion === "village";
  if (!inVillage) {
    if (!farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetRegionId === "village")) {
      // Travel must precede the purchase: the queue is sorted ascending by
      // priority (lower = sooner) and TravelSystem only acts on queue[0], so
      // the travel intent needs the LOWER number to be popped first.
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetRegionId: "village" },
        priority: priority - 1,
      });
    }
  }
  farmer.intentions.queue.push({
    kind: "buy-tool",
    data: { toolKind },
    priority,
  });
  recordReason(farmer, `buy replacement ${toolKind} (broken, gold: ${farmer.inventory.gold})`);
}

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
  crop: import("../components").CropKind,
  priority: number,
): boolean {
  if (!farmer.intentions) return false;
  const sense = farmer.beliefs?.data.plotWater as PlotWaterSense | undefined;
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
 * Queue till intents to expand the farm up to maxNewPlots new plots this day.
 * Picks the closest unused tiles inside the farmer's farm region.
 *
 * brief (proximity) — only enqueues till for tiles within reach; travels to
 * the nearest candidate otherwise (or in addition if some are reachable).
 */
export function deliberateTill(
  farmer: GameEntity,
  occupiedTiles: Set<string>,
  maxNewPlots: number,
  priority: number,
): void {
  if (!farmer.farmer?.homeRegion || !farmer.intentions || farmer.id === undefined) return;
  const hoe = (farmer.inventory?.tools ?? []).find(t => t.kind === "hoe" && t.durability > 0);
  if (!hoe) return; // no usable hoe

  const farmDef = REGIONS.find(r => r.id === farmer.farmer!.homeRegion);
  if (!farmDef || farmDef.kind !== "farm") return;

  // Collect all candidate tiles (unoccupied, inside farm), sorted (tileY, tileX).
  const candidates: Array<{ tileX: number; tileY: number }> = [];
  outer: for (let ty = farmDef.bounds.minY; ty <= farmDef.bounds.maxY; ty++) {
    for (let tx = farmDef.bounds.minX; tx <= farmDef.bounds.maxX; tx++) {
      const key = `${tx},${ty}`;
      if (occupiedTiles.has(key)) continue;
      candidates.push({ tileX: tx, tileY: ty });
      if (candidates.length >= maxNewPlots * 3) break outer; // collect some extras for proximity selection
    }
  }
  if (candidates.length === 0) return;

  const transform = farmer.transform;
  const inReach = candidates.filter(p => isWithinReach(transform, p.tileX, p.tileY));
  const outOfReach = candidates.filter(p => !isWithinReach(transform, p.tileX, p.tileY));

  if (inReach.length === 0) {
    // No candidate is within reach — travel to the nearest one; act next cycle.
    const nearest = nearestTile(transform, candidates);
    if (nearest && !farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetTile)) {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetTile: { x: nearest.tileX, y: nearest.tileY } },
        priority: -1,
      });
    }
    return;
  }

  // Enqueue till intents for all in-reach tiles (up to maxNewPlots).
  let count = 0;
  for (const p of inReach) {
    if (count >= maxNewPlots) break;
    farmer.intentions.queue.push({
      kind: "till",
      data: { tileX: p.tileX, tileY: p.tileY, regionId: farmer.farmer.homeRegion },
      priority,
    });
    occupiedTiles.add(`${p.tileX},${p.tileY}`);
    count++;
  }

  // If there are still out-of-reach candidates, queue travel toward the nearest
  // to chain tilling across the farm in subsequent deliberation cycles.
  if (outOfReach.length > 0) {
    const nearestOut = nearestTile(transform, outOfReach);
    if (nearestOut && !farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetTile)) {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetTile: { x: nearestOut.tileX, y: nearestOut.tileY } },
        priority: -1,
      });
    }
  }

  if (count > 0) recordReason(farmer, `till ${count} new plot${count > 1 ? "s" : ""}`);
}

/**
 * Queue chop/mine intents for visible tile features on the farmer's farm.
 *
 * brief (proximity) — only enqueues gather for features within reach; travels
 * to the nearest gatherable feature otherwise.
 */
export function deliberateResourceGather(
  farmer: GameEntity,
  tileFeatures: Array<{ kind: "tree" | "stone"; tileX: number; tileY: number; ownerId: number }>,
  maxActions: number,
  priority: number,
): void {
  if (!farmer.intentions || farmer.id === undefined) return;
  const tools = farmer.inventory?.tools ?? [];
  const hasAxe    = tools.some(t => t.kind === "axe"     && t.durability > 0);
  const hasPick   = tools.some(t => t.kind === "pickaxe" && t.durability > 0);

  // Tool-break recovery: if the farmer owns features it can't gather because the
  // matching tool is broken/gone, queue a replacement purchase (same fix as the
  // hoe path — a broken axe/pickaxe would otherwise permanently stall gathering).
  const ownFeatures = tileFeatures.filter((f) => f.ownerId === farmer.id);
  if (!hasAxe && ownFeatures.some((f) => f.kind === "tree")) {
    deliberateBuyTool(farmer, "axe", priority - 1);
  }
  if (!hasPick && ownFeatures.some((f) => f.kind === "stone")) {
    deliberateBuyTool(farmer, "pickaxe", priority - 1);
  }

  // Filter to features the farmer can actually gather with current tools,
  // sorted (tileY, tileX) for determinism.
  const gatherable = ownFeatures
    .filter(f => (f.kind === "tree" && hasAxe) || (f.kind === "stone" && hasPick))
    .slice()
    .sort((a, b) => a.tileY !== b.tileY ? a.tileY - b.tileY : a.tileX - b.tileX);

  if (gatherable.length === 0) return;

  const transform = farmer.transform;
  const inReach    = gatherable.filter(f => isWithinReach(transform, f.tileX, f.tileY));
  const outOfReach = gatherable.filter(f => !isWithinReach(transform, f.tileX, f.tileY));

  if (inReach.length === 0) {
    // No gatherable feature is within reach — travel to the nearest one; act next cycle.
    const nearest = nearestTile(transform, gatherable);
    if (nearest && !farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetTile)) {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetTile: { x: nearest.tileX, y: nearest.tileY } },
        priority: -1,
      });
    }
    return;
  }

  // Enqueue gather intents for all in-reach features (up to maxActions).
  let count = 0;
  for (const feat of inReach) {
    if (count >= maxActions) break;
    farmer.intentions.queue.push({
      kind: feat.kind === "tree" ? "chop-tree" : "mine-stone",
      data: { tileX: feat.tileX, tileY: feat.tileY },
      priority,
    });
    count++;
  }

  // If there are still out-of-reach features, queue travel toward the nearest
  // to chain gathering in subsequent deliberation cycles.
  if (outOfReach.length > 0) {
    const nearest = nearestTile(transform, outOfReach);
    if (nearest && !farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetTile)) {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetTile: { x: nearest.tileX, y: nearest.tileY } },
        priority: -1,
      });
    }
  }
  if (count > 0) recordReason(farmer, `gather resources (${count} actions)`);
}

/**
 * Queue a trip to the mill to process a surplus crop into gold at a premium.
 * Fires when the farmer holds at least `minStock` units of any crop and isn't
 * already heading there. Travel runs first (lower priority number), then the
 * process-crop action resolves at the mill (ActSystem gates on region === mill).
 * This is what makes the mill an actual economic choice for the agents.
 */
export function deliberateMillVisit(
  farmer: GameEntity,
  minStock: number,
  priority: number,
): void {
  if (!farmer.intentions || !farmer.inventory) return;
  const crops = farmer.inventory.crops;
  // Pick the crop with the largest stock at/above the threshold.
  let best: { crop: import("../components").CropKind; qty: number } | null = null;
  // brief 41 — check all 8 crop kinds for mill surplus.
  for (const crop of ["grape", "pumpkin", "corn", "tomato", "winter-squash", "wheat", "carrot", "radish"] as const) {
    const qty = crops[crop];
    if (qty >= minStock && (!best || qty > best.qty)) best = { crop, qty };
  }
  if (!best) return;

  // Don't double-queue a mill trip.
  if (farmer.intentions.queue.some(i => i.kind === "process-crop")) return;

  if (farmer.farmer?.currentRegion !== "mill") {
    if (!farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetRegionId === "mill")) {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetRegionId: "mill" },
        priority: priority - 1,
      });
    }
  }
  farmer.intentions.queue.push({
    kind: "process-crop",
    data: { crop: best.crop },
    priority,
  });
  recordReason(farmer, `mill ${best.crop} x${best.qty} for premium`);
}

/** Seasonal forage zones and the season each is productive in. */
const FORAGE_ZONES: Array<{ region: string; season: Season }> = [
  { region: "mushroom-grove", season: "autumn" },
  { region: "ice-pond",       season: "winter" },
];

/**
 * Queue a trip to a seasonal forage zone when it's in season — the mushroom
 * grove (autumn) or ice pond (winter). Foraging there yields gold (ActSystem
 * gates the reward on both region AND season). Out of season this is a no-op,
 * which is what makes the zones a seasonal opportunity rather than a prop.
 */
export function deliberateSeasonalForage(
  farmer: GameEntity,
  priority: number,
): void {
  if (!farmer.intentions || !farmer.farmer) return;
  const day = (farmer.beliefs?.data.currentDay as number | undefined) ?? 0;
  const season = seasonForDay(day);
  const zone = FORAGE_ZONES.find((z) => z.season === season);
  if (!zone) return; // no zone is in season right now

  // Don't double-queue a forage trip.
  if (farmer.intentions.queue.some(i => i.kind === "forage")) return;

  if (farmer.farmer.currentRegion !== zone.region) {
    if (!farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetRegionId === zone.region)) {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetRegionId: zone.region },
        priority: priority - 1,
      });
    }
  }
  farmer.intentions.queue.push({
    kind: "forage",
    data: {},
    priority,
  });
  recordReason(farmer, `forage ${zone.region} (in season: ${season})`);
}

/**
 * Queue a craft-decoration intent if the farmer has enough wood and hasn't
 * capped their farm's decoration boost yet. Picks the best decoration the
 * farmer can currently afford in wood.
 */
export function deliberateDecoration(
  farmer: GameEntity,
  existingDecorations: FarmDecoration[],
  priority: number,
): void {
  if (!farmer.intentions || !farmer.resources || !farmer.farmer?.homeRegion) return;

  // Check current total boost for this farmer.
  let totalBoost = 0;
  for (const d of existingDecorations) {
    if (d.ownerId === farmer.id) totalBoost += DECORATION_RECIPE[d.kind]?.yieldBoost ?? 0;
  }
  if (totalBoost >= MAX_DECORATION_BOOST) return;

  const wood = farmer.resources.wood;
  if (wood <= 0) return;

  // Pick the best affordable decoration (highest yieldBoost per wood).
  const affordable = (Object.entries(DECORATION_RECIPE) as [DecorationKind, { woodCost: number; yieldBoost: number }][])
    .filter(([, r]) => wood >= r.woodCost)
    .sort((a, b) => b[1].yieldBoost / b[1].woodCost - a[1].yieldBoost / a[1].woodCost);

  if (affordable.length === 0) return;
  const best = affordable[0];
  if (!best) return;
  const [kind] = best;

  // Must be at carpentry to craft. If not there, travel first.
  const inCarpentry = farmer.farmer.currentRegion === "carpentry";
  if (!inCarpentry) {
    farmer.intentions.queue.push({
      kind: "travel",
      data: { targetRegionId: "carpentry" },
      priority: priority + 1,
    });
  }
  farmer.intentions.queue.push({
    kind: "craft-decoration",
    data: { kind },
    priority,
  });
  recordReason(farmer, `craft ${kind} decoration (wood: ${wood})`);
}

/**
 * Queue a visit to the village on the very first day if the farmer hasn't been
 * yet. This gets everyone walking on day 1 — they'll read market offers and
 * be in position to sell anything that matures on day 2.
 */
export function deliberateEarlyVillageVisit(farmer: GameEntity, priority: number): void {
  if (!farmer.intentions || !farmer.farmer) return;
  const day = (farmer.beliefs?.data.currentDay as number | undefined) ?? 0;
  // Only on day 0-1 and only when not already in/heading to village.
  if (day > 1) return;
  if (farmer.farmer.currentRegion === "village") return;
  // Don't add if travel to village already queued.
  if (farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetRegionId === "village")) return;

  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetRegionId: "village" },
    priority,
  });
  farmer.intentions.queue.push({
    kind: "read-offers",
    data: {},
    priority: priority + 1,
  });
  recordReason(farmer, "early village visit: scout market");
}

/**
 * Queue a tool upgrade at the blacksmith when the farmer can afford it.
 * Queues travel → blacksmith → upgrade-tool.
 */
export function deliberateUpgrade(
  farmer: GameEntity,
  toolKind: ToolKind,
  priority: number,
): void {
  if (!farmer.intentions || !farmer.inventory || !farmer.farmer) return;
  const tools = farmer.inventory.tools ?? [];
  // Find the highest-tier owned tool of this kind.
  const tierOrder: Record<string, number> = { wooden: 0, stone: 1, iron: 2 };
  const best = tools
    .filter(t => t.kind === toolKind)
    .sort((a, b) => (tierOrder[b.tier] ?? 0) - (tierOrder[a.tier] ?? 0))[0];
  if (!best || best.tier === "iron") return; // already max

  // Cost to upgrade to next tier.
  const upgradeCost: Record<string, number> = { stone: 15, iron: 25 };
  const nextTier = best.tier === "wooden" ? "stone" : "iron";
  const cost = upgradeCost[nextTier] ?? 99;
  const reserve = (farmer.desires?.data.minGoldReserve as number | undefined) ?? 20;
  if (farmer.inventory.gold < cost + reserve) return;

  // Don't double-queue.
  if (farmer.intentions.queue.some(i => i.kind === "upgrade-tool" && i.data.toolKind === toolKind)) return;

  const inBlacksmith = farmer.farmer.currentRegion === "blacksmith";
  if (!inBlacksmith) {
    if (!farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetRegionId === "blacksmith")) {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetRegionId: "blacksmith" },
        priority: priority + 1,
      });
    }
  }
  farmer.intentions.queue.push({
    kind: "upgrade-tool",
    data: { toolKind },
    priority,
  });
  recordReason(farmer, `upgrade ${toolKind} to ${nextTier} at blacksmith (gold: ${farmer.inventory.gold})`);
}

/**
 * Queue travel to the nearest resource zone (forest or quarry) when the
 * farmer's farm has no features left to gather and there are zones nearby.
 * `preferKind` steers toward forest (trees) or quarry (stones).
 */
export function deliberateResourceZoneVisit(
  farmer: GameEntity,
  ownFarmFeatureCount: number,
  preferKind: "tree" | "stone",
  priority: number,
): void {
  if (!farmer.intentions || !farmer.farmer) return;
  // Only travel out if own farm is depleted.
  if (ownFarmFeatureCount > 0) return;

  const targetZone = preferKind === "tree"
    ? (farmer.farmer.homeRegion?.includes("cora") || farmer.farmer.homeRegion?.includes("atticus") ? "forest-north" : "forest-south")
    : (farmer.farmer.homeRegion?.includes("cora") || farmer.farmer.homeRegion?.includes("atticus") ? "quarry-north" : "quarry-south");

  if (farmer.farmer.currentRegion === targetZone) return;
  if (farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetRegionId === targetZone)) return;

  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetRegionId: targetZone },
    priority,
  });
  recordReason(farmer, `travel to ${targetZone}: no features on farm`);
}

/**
 * Queue travel home for the evening / sleep phase.
 * Always the highest priority (0) — farmers must reach home before night
 * to avoid the unrested-AP penalty.
 */
/**
 * Every PERIOD days, send the farmer to the village to check the market,
 * even if they have nothing to sell. Keeps all farmers circulating.
 */
export function deliberatePeriodicMarketVisit(
  farmer: GameEntity,
  period: number,
  priority: number,
): void {
  if (!farmer.intentions || !farmer.beliefs || !farmer.farmer) return;
  const day = (farmer.beliefs.data.currentDay as number | undefined) ?? 0;
  if (day === 0) return; // early visit already handled by deliberateEarlyVillageVisit
  if (day % period !== 0) return;
  if (farmer.farmer.currentRegion === "village") return;
  if (farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetRegionId === "village")) return;
  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetRegionId: "village" },
    priority,
  });
  farmer.intentions.queue.push({
    kind: "read-offers",
    data: {},
    priority: priority + 1,
  });
  recordReason(farmer, `periodic market visit (day ${day})`);
}

export function deliberateSleep(farmer: GameEntity): void {
  if (!farmer.intentions || !farmer.farmer) return;
  const phase = farmer.beliefs?.data.phase as string | undefined;
  // Only queue during evening (or work if already late).
  if (phase !== "evening" && phase !== "work") return;
  const homeRegion = farmer.farmer.homeRegion;
  if (!homeRegion) return;
  if (farmer.farmer.currentRegion === homeRegion && !farmer.farmer.path) return;
  // Don't double-queue home travel.
  if (farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetRegionId === homeRegion)) return;

  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetRegionId: homeRegion },
    priority: -1, // higher than everything else
  });
  recordReason(farmer, `head home (${phase})`);
}

export function deliberateWatering(farmer: GameEntity, style: WateringStyle): void {
  const sense = farmer.beliefs?.data.plotWater as PlotWaterSense | undefined;
  if (!sense || sense.due <= 0) return;
  // Only water once the driest plot has reached the personality's threshold,
  // EXCEPT always water if something is one day from wilting (grace - 1).
  const urgent = sense.maxDrySoFar >= 2; // grace is 2; at 2 dry days it's last chance
  if (!urgent && sense.maxDrySoFar < style.dryThreshold) return;

  const cap = style.maxWaterPerDay ?? sense.due;
  // duePlots is sorted (tileY, tileX) for determinism.
  const duePlots = sense.duePlots ?? [];
  const candidatePlots = duePlots.slice(0, cap);

  if (candidatePlots.length === 0) return;

  const transform = farmer.transform;

  // Split into: plots the farmer can reach NOW vs the rest.
  const inReach = candidatePlots.filter(p => isWithinReach(transform, p.tileX, p.tileY));
  const outOfReach = candidatePlots.filter(p => !isWithinReach(transform, p.tileX, p.tileY));

  if (inReach.length > 0) {
    // Enqueue a water intent for every reachable due plot so the farmer waters
    // the whole cluster in one ACT pass.
    for (const p of inReach) {
      farmer.intentions!.queue.push({
        kind: "water",
        data: { tileX: p.tileX, tileY: p.tileY },
        priority: 0,
      });
    }
    // If there are still unreachable due plots, queue travel toward the nearest one.
    if (outOfReach.length > 0) {
      const nearest = nearestTile(transform, outOfReach);
      if (nearest && !farmer.intentions!.queue.some(i => i.kind === "travel" && i.data.targetTile)) {
        farmer.intentions!.queue.push({
          kind: "travel",
          data: { targetTile: { x: nearest.tileX, y: nearest.tileY } },
          priority: -1,
        });
      }
    }
  } else {
    // No due plot is within reach — travel to the nearest one; act next cycle.
    const nearest = nearestTile(transform, candidatePlots);
    if (nearest && !farmer.intentions!.queue.some(i => i.kind === "travel" && i.data.targetTile)) {
      farmer.intentions!.queue.push({
        kind: "travel",
        data: { targetTile: { x: nearest.tileX, y: nearest.tileY } },
        priority: -1,
      });
    }
  }

  const count = inReach.length > 0 ? inReach.length : 0;
  if (count > 0 || candidatePlots.length > 0) {
    recordReason(
      farmer,
      `water ${count > 0 ? count : "→travel"}${count > 1 ? " plots" : count === 1 ? " plot" : ""}${urgent ? " (wilting!)" : ""}`,
    );
  }
}

/**
 * Pick the tile in `tiles` closest to `transform` by Manhattan distance.
 * Tie-break by (tileY, tileX) for determinism (tiles must be pre-sorted for
 * stable tie-breaking). Returns undefined if the list is empty.
 */
function nearestTile(
  transform: { x: number; y: number } | undefined,
  tiles: Array<{ tileX: number; tileY: number }>,
): { tileX: number; tileY: number } | undefined {
  if (tiles.length === 0) return undefined;
  if (!transform) return tiles[0];
  let best = tiles[0]!;
  let bestDist = Math.abs(best.tileX - transform.x) + Math.abs(best.tileY - transform.y);
  for (let i = 1; i < tiles.length; i++) {
    const t = tiles[i]!;
    const d = Math.abs(t.tileX - transform.x) + Math.abs(t.tileY - transform.y);
    if (d < bestDist || (d === bestDist && (t.tileY < best.tileY || (t.tileY === best.tileY && t.tileX < best.tileX)))) {
      best = t;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Fishing-isle cast tiles — one edge tile per isle whose west neighbour is open
 * ocean, so a farmer standing here can cast (ActSystem scans the 4-neighbours
 * for water). AI farmers travel to the nearest one, then queue `fish`.
 *   fishing-isle   (40–47×68–75): west edge (40,71), ocean at (39,71)
 *   fishing-isle-2 (22–29×68–75): west edge (22,71), ocean at (21,71)
 */
const FISHING_CAST_TILES = [
  { x: 40, y: 71 },
  { x: 22, y: 71 },
] as const;

/**
 * Discretionary fishing trip for AI farmers. Every `period` days a farmer with
 * spare AP heads to the fishing isle and casts a few times (each cast 1 AP +
 * a 5–30 s busy window, landing a fish for gold). Low priority so the AP pruner
 * drops it first when the day is busy — fishing is a "nothing better to do"
 * side income, not a core strategy. Bounded to `casts` per trip so it can't
 * monopolise the day. Deterministic: gated purely on day + region + AP.
 */
export function deliberateFishing(
  farmer: GameEntity,
  period: number,
  casts: number,
  priority: number,
): void {
  if (!farmer.intentions || !farmer.beliefs || !farmer.farmer || !farmer.ap) return;
  const day = (farmer.beliefs.data.currentDay as number | undefined) ?? 0;
  if (day === 0) return; // settle in first
  if (day % period !== 0) return;
  // Only fish with comfortable AP headroom (don't starve core farm work).
  if (farmer.ap.current < 30) return;
  // Don't double-queue a fishing trip.
  if (farmer.intentions.queue.some((i) => i.kind === "fish")) return;
  // Must hold a rod (everyone starts with one, but be defensive).
  if (!(farmer.inventory?.tools ?? []).some((t) => t.kind === "fishing-rod")) return;

  if (!isFishingIsle(farmer.farmer.currentRegion ?? null)) {
    if (!farmer.intentions.queue.some((i) => i.kind === "travel" && i.data.targetTile)) {
      // Head to whichever isle's cast tile is nearest (Manhattan).
      const t = farmer.transform;
      const cast = t
        ? [...FISHING_CAST_TILES].sort(
            (a, b) =>
              (Math.abs(a.x - t.x) + Math.abs(a.y - t.y)) -
              (Math.abs(b.x - t.x) + Math.abs(b.y - t.y)),
          )[0]!
        : FISHING_CAST_TILES[0];
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetTile: { x: cast.x, y: cast.y } },
        priority: priority - 1,
      });
    }
  }
  const n = Math.max(1, casts);
  for (let i = 0; i < n; i++) {
    farmer.intentions.queue.push({
      kind: "fish",
      data: {},
      priority: priority + i,
    });
  }
  recordReason(farmer, `fishing trip (day ${day}, ${n} casts)`);
}

// ── brief 42 — livestock + orchard deliberation helpers ───────────────────────

/**
 * Queue a `build-pen` intent if the farmer:
 *   - has no pen of the given kind yet
 *   - has enough wood + gold (above reserve)
 *   - is at (or can travel to) carpentry
 * Low priority — a slow-burn investment.
 */
export function deliberateBuildPen(
  farmer: GameEntity,
  penKind: "coop" | "barn",
  animal: import("../components").AnimalKind,
  reserve: number,
  priority: number,
  /**
   * brief 42 (deliberation fix) — priority for the carpentry TRAVEL leg.
   * The build only executes once the farmer is AT carpentry, but the trip there
   * competes with survival/sell travel (priority 0/-1) and so never won under
   * the original `priority + 1` scheme — the pen was perpetually queued but never
   * reached. Personalities pass a WINNING (low) travel priority on a "quiet"
   * invest day (watering satisfied + surplus gold) so the trip actually happens;
   * `undefined` falls back to the old non-committal `priority + 1`.
   */
  travelPriority?: number,
): void {
  if (!farmer.intentions || !farmer.inventory || !farmer.farmer || farmer.id === undefined) return;
  const recipe = PEN_BUILD_COST[penKind];

  // Don't build if already has one.
  const hasPen = farmer.beliefs?.data["hasPen_" + penKind] as boolean | undefined;
  if (hasPen) return;

  // brief 42 (deliberation fix) — pens are gold-funded; wood is an optional
  // discount (see PEN_BUILD_COST). Gate on the gold the farmer would actually
  // pay: discounted if they happen to hold the wood, full otherwise. This is
  // what lets a wood-poor-but-gold-rich patient farmer finally invest.
  const wood = farmer.resources?.wood ?? 0;
  const goldDue = wood >= recipe.woodCost ? recipe.goldCost - recipe.goldDiscount : recipe.goldCost;
  if (farmer.inventory.gold - goldDue < reserve) return;

  // Don't double-queue.
  if (farmer.intentions.queue.some(i => i.kind === "build-pen" && i.data.penKind === penKind)) return;

  const inCarpentry = farmer.farmer.currentRegion === "carpentry";
  if (!inCarpentry) {
    const wanted = travelPriority ?? priority + 1;
    const existing = farmer.intentions.queue.find(i => i.kind === "travel" && i.data.targetRegionId === "carpentry");
    if (existing) {
      // Another helper (e.g. decoration crafting) may have already queued a
      // carpentry trip at a worse (higher) priority. If we're COMMITTING the
      // build, upgrade that trip so it wins queue[0] instead of being shadowed
      // by an unrelated village errand — otherwise the build trip never lands.
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
    kind: "build-pen",
    data: { penKind, animal },
    priority,
  });
  recordReason(
    farmer,
    `building ${penKind} (${animal}) — surplus gold ${farmer.inventory.gold}, ${goldDue}g${wood >= recipe.woodCost ? " (wood discount)" : ""}`,
  );
}

/**
 * brief 44 — commission a decoration build at the CARPENTER (a real order the
 * CarpenterSystem validates + delivers over a build-time), using brief 42's
 * working excursion pattern. Fires on a quiet invest day when the farmer holds
 * enough WOOD for a decoration it can still benefit from (boost not maxed), and
 * commits a WINNING carpentry-travel leg so the trip actually wins queue[0] —
 * otherwise the order is queued but the farmer never reaches the carpenter and
 * the feature reads as dormant (the brief-42 lesson).
 *
 * `travelPriority` — winning carpentry-travel priority on the commit day
 * (undefined falls back to the non-committal `priority + 1`).
 */
export function deliberateCommissionBuild(
  farmer: GameEntity,
  existingDecorations: FarmDecoration[],
  priority: number,
  travelPriority?: number,
): void {
  if (!farmer.intentions || !farmer.resources || !farmer.farmer?.homeRegion) return;

  // Boost already maxed? Nothing worth commissioning.
  let totalBoost = 0;
  for (const d of existingDecorations) {
    if (d.ownerId === farmer.id) totalBoost += DECORATION_RECIPE[d.kind]?.yieldBoost ?? 0;
  }
  if (totalBoost >= MAX_DECORATION_BOOST) return;

  const wood = farmer.resources.wood;
  if (wood <= 0) return;

  // Pick the best decoration affordable in wood (highest yieldBoost per wood).
  const affordable = (Object.entries(DECORATION_RECIPE) as [DecorationKind, { woodCost: number; yieldBoost: number }][])
    .filter(([, r]) => wood >= r.woodCost)
    .sort((a, b) => b[1].yieldBoost / b[1].woodCost - a[1].yieldBoost / a[1].woodCost);
  if (affordable.length === 0) return;
  const best = affordable[0];
  if (!best) return;
  const [kind] = best;

  // Don't double-queue a commission.
  if (farmer.intentions.queue.some(i => i.kind === "commission-build")) return;

  const inCarpentry = farmer.farmer.currentRegion === "carpentry";
  if (!inCarpentry) {
    const wanted = travelPriority ?? priority + 1;
    const existing = farmer.intentions.queue.find(i => i.kind === "travel" && i.data.targetRegionId === "carpentry");
    if (existing) {
      // Upgrade a shadowing carpentry trip so the commission trip wins queue[0]
      // (same fix as the pen/greenhouse builds).
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
    kind: "commission-build",
    data: { kind },
    priority,
  });
  recordReason(farmer, `commission ${kind} at carpenter (wood: ${wood})`);
}

/**
 * brief 44 — hire a day-helper at the tavern (in the village). A gold sink +
 * catch-up mechanic: when the farmer is AP-starved (ran low today) AND gold-rich
 * (comfortable surplus over reserve + the hire cost), it pays for an AP boost
 * tomorrow. Uses the excursion pattern: commit a WINNING village-travel leg so
 * the trip actually lands. Gated so it stays a "spare gold/AP" sink, never a
 * survival need.
 *
 * `travelPriority` — winning village-travel priority on the commit day.
 */
export function deliberateHireHelp(
  farmer: GameEntity,
  reserve: number,
  priority: number,
  travelPriority?: number,
): void {
  if (!farmer.intentions || !farmer.inventory || !farmer.farmer || !farmer.ap) return;
  const day = (farmer.beliefs?.data.currentDay as number | undefined) ?? 0;
  if (day === 0) return; // settle in first

  // Already hired today? (the act gates this too, but skip the trip.)
  if (farmer.farmer.helperHiredDay === day) return;

  // AP-starved: today's AP ceiling is mostly spent (ran the budget low). This is
  // a pure read of the current AP fraction — deterministic.
  const apFraction = farmer.ap.max > 0 ? farmer.ap.current / farmer.ap.max : 1;
  if (apFraction > 0.4) return; // still has plenty of AP — no need to hire

  // Gold-rich: comfortable surplus over the reserve AND the hire cost (so it's a
  // spare-gold sink, never a survival drain).
  const HIRE_COST = 25; // mirror HIRE_HELP_GOLD_COST in act.ts
  if (farmer.inventory.gold - HIRE_COST < reserve) return;

  if (farmer.intentions.queue.some(i => i.kind === "hire-help")) return;

  // OPPORTUNISTIC: only hire when the farmer is ALREADY in the village (it came
  // to sell / buy). We deliberately do NOT make a special cross-map trip just to
  // hire — that would derail the farm loop and turn a luxury sink into a net
  // productivity LOSS (an early build hijacked a leader's whole run). "While I'm
  // here, grab a hand for tomorrow" is the intended, non-disruptive shape.
  if (farmer.farmer.currentRegion !== "village") return;
  // travelPriority is intentionally unused now (kept for call-site symmetry).
  void travelPriority;

  farmer.intentions.queue.push({
    kind: "hire-help",
    data: {},
    priority,
  });
  recordReason(farmer, `hire day-helper at tavern (AP ${farmer.ap.current}/${farmer.ap.max}, gold ${farmer.inventory.gold})`);
}

/** Tavern gathering tile inside the village hub (next to the barkeep). */
const TAVERN_GATHER_TILE = { x: 44, y: 35 } as const;

/**
 * brief 44 — evening gathering beat (pure flavor; makes the hub look populated).
 *
 * Fires in the EVENING phase for a farmer who is ALREADY in the village (e.g. it
 * came in to sell / read the market) and has no pressing chores queued: it adds
 * a cheap in-village hop to the tavern tile before the night. Because the farmer
 * is already on the village island, the hop is short and lands within the
 * evening window — so the tavern genuinely fills up, rather than a farmer trying
 * (and failing) to walk a whole cross-map trip from its farm at dusk.
 *
 * Gated to the village so it never drags a farmer away from its farm at night
 * (which would cost the unrested AP penalty). Low priority + AP-free travel, so
 * it never competes with real work; deterministic (phase + region + position).
 */
export function deliberateTavernGather(farmer: GameEntity, priority: number): void {
  if (!farmer.intentions || !farmer.farmer || !farmer.beliefs || !farmer.inventory) return;
  const phase = farmer.beliefs.data.phase as string | undefined;
  // Gather during the MORNING or WORK window (plenty of day left to socialise
  // then get home before night — never the evening, which would risk stranding
  // the farmer away at nightfall for the unrested penalty).
  if (phase !== "morning" && phase !== "work") return;
  const day = (farmer.beliefs.data.currentDay as number | undefined) ?? 0;
  if (day === 0) return; // settle in first

  // Periodic gathering beat: every TAVERN_VISIT_PERIOD days a farmer makes a trip
  // to the tavern so the hub reads as populated. "Pure flavor" — AP-free travel.
  // Modelled on the periodic-market-visit excursion (a deterministic, day-gated
  // trip) rather than an idle-only hook, because the agent loop almost never
  // leaves a farmer idle in the village (it's always already en route somewhere),
  // so an idle hook would never fire. Staggered across farmers (by entity id) so
  // they arrive on different days and the tavern fills gradually over the week.
  const offset = ((farmer.id ?? 0) % TAVERN_VISIT_PERIOD);
  if (day % TAVERN_VISIT_PERIOD !== offset) return;

  // Keep it a LUXURY that never competes with real work: only when the farmer has
  // a comfortable AP cushion (won't starve farm work) and no plot is wilting.
  if ((farmer.ap?.current ?? 0) < 40) return;
  const sense = farmer.beliefs.data.plotWater as PlotWaterSense | undefined;
  if (sense && sense.maxDrySoFar >= 2) return;

  // Already at the tavern tile, or a gathering hop already queued? Don't re-queue.
  if (isWithinReach(farmer.transform, TAVERN_GATHER_TILE.x, TAVERN_GATHER_TILE.y)) return;
  if (farmer.intentions.queue.some((i) => i.kind === "travel" && i.data.targetTile && i.data.tavernGather)) return;

  // Winning priority so the short in-village hop actually executes (travel is
  // AP-free; the next arrival re-deliberation routes the farmer onward / home).
  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetTile: { x: TAVERN_GATHER_TILE.x, y: TAVERN_GATHER_TILE.y }, tavernGather: true },
    priority,
  });
  recordReason(farmer, "visit the tavern (gathering beat)");
}

/** How often (in days) a farmer makes a tavern gathering trip (a periodic luxury). */
const TAVERN_VISIT_PERIOD = 12;

/** brief 45 — the festival gathering tile: the auction podium in the town square. */
const FESTIVAL_PODIUM_TILE = { x: 43, y: 39 } as const;

/**
 * brief 45 — festival-day gathering beat. On a festival day a farmer with a
 * comfortable AP cushion (and no plot wilting) makes the excursion to the village
 * podium (the festival stage) — the spectator sees the farmers convene for the
 * harvest contest, exactly like the brief-44 tavern gather but anchored to the
 * calendar landmark instead of a periodic timer.
 *
 * The contest itself is resolved by FestivalSystem from inventory (every farmer
 * holding the contest crop is judged) — so this helper is the visible "they all
 * showed up" beat, plus a `decisionTrace` reason that surfaces festival planning.
 * Travel is AP-free; low priority so it never competes with real farm work.
 * Deterministic: gated purely on the festival-today belief + phase + AP + position.
 */
export function deliberateFestivalGather(farmer: GameEntity, priority: number): void {
  if (!farmer.intentions || !farmer.farmer || !farmer.beliefs) return;
  const festival = farmer.beliefs.data.festivalToday as
    | { name: string; contestCrop: string } | null | undefined;
  if (!festival) return; // not a festival day

  const phase = farmer.beliefs.data.phase as string | undefined;
  // Gather in the MORNING / WORK window (plenty of day to get home before night).
  if (phase !== "morning" && phase !== "work") return;

  // Keep it a LUXURY that never starves farm work (mirror the tavern gather gate).
  if ((farmer.ap?.current ?? 0) < 40) return;
  const sense = farmer.beliefs.data.plotWater as PlotWaterSense | undefined;
  if (sense && sense.maxDrySoFar >= 2) return;

  // Already at the podium, or a festival hop already queued? Don't re-queue.
  if (isWithinReach(farmer.transform, FESTIVAL_PODIUM_TILE.x, FESTIVAL_PODIUM_TILE.y)) return;
  if (farmer.intentions.queue.some((i) => i.kind === "travel" && i.data.festivalGather)) return;

  // Hold the contest crop: if the farmer would otherwise sell it today, surface
  // the intent to keep it for judging (the contest reads end-of-day inventory).
  const held = farmer.inventory?.crops[festival.contestCrop as import("../components").CropKind] ?? 0;

  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetTile: { x: FESTIVAL_PODIUM_TILE.x, y: FESTIVAL_PODIUM_TILE.y }, festivalGather: true },
    priority,
  });
  recordReason(
    farmer,
    held > 0
      ? `${festival.name}: enter ${festival.contestCrop} (holding ${held})`
      : `${festival.name}: gather at the podium`,
  );
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
  crop: import("../components").CropKind,
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

/**
 * Queue a `buy-animal` intent if the farmer has a pen but no animals yet, and
 * can afford one above reserve.
 */
export function deliberateBuyAnimal(
  farmer: GameEntity,
  animal: import("../components").AnimalKind,
  reserve: number,
  priority: number,
  /** Winning travel priority for the village trip on an invest day (see deliberateBuildPen). */
  travelPriority?: number,
): void {
  if (!farmer.intentions || !farmer.inventory || !farmer.farmer || farmer.id === undefined) return;

  // Need a pen first.
  const hasPen = farmer.beliefs?.data["hasPen_" + (animal === "chicken" ? "coop" : "barn")] as boolean | undefined;
  if (!hasPen) return;

  const cost = ANIMAL_BUY_COST[animal];
  if (farmer.inventory.gold - cost < reserve) return;

  // Don't double-queue.
  if (farmer.intentions.queue.some(i => i.kind === "buy-animal" && i.data.animal === animal)) return;
  // Already has animals? Only buy if count < 3 (modest herd cap for agents).
  const penCount = farmer.beliefs?.data["penCount_" + animal] as number | undefined ?? 0;
  if (penCount >= 3) return;

  // brief 42 (deliberation fix) — animals can be bought at the village OR the
  // carpenter (see handleBuyAnimal). If the farmer is already at the carpenter
  // (e.g. she just built the coop there), buy on the spot — no extra trip. Else
  // travel to whichever buy-region is being committed (village).
  const atBuyRegion =
    farmer.farmer.currentRegion === "village" || farmer.farmer.currentRegion === "carpentry";
  if (!atBuyRegion) {
    if (!farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetRegionId === "village")) {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetRegionId: "village" },
        priority: travelPriority ?? priority + 1,
      });
    }
  }
  farmer.intentions.queue.push({
    kind: "buy-animal",
    data: { animal },
    priority,
  });
  recordReason(farmer, `buy ${animal} (pen count ${penCount})`);
}

/**
 * Queue a `tend` intent for each untended pen the farmer owns (low priority).
 */
export function deliberateTendPens(
  farmer: GameEntity,
  priority: number,
): void {
  if (!farmer.intentions || !farmer.farmer || farmer.id === undefined) return;

  const hasCoop = farmer.beliefs?.data["hasPen_coop"] as boolean | undefined;
  const hasBarn = farmer.beliefs?.data["hasPen_barn"] as boolean | undefined;
  if (!hasCoop && !hasBarn) return;

  const coopFed = farmer.beliefs?.data["coopFedToday"] as boolean | undefined;
  const barnFed = farmer.beliefs?.data["barnFedToday"] as boolean | undefined;

  if (hasCoop && !coopFed) {
    if (!farmer.intentions.queue.some(i => i.kind === "tend" && i.data.penKind === "coop")) {
      farmer.intentions.queue.push({
        kind: "tend",
        data: { penKind: "coop" },
        priority,
      });
      recordReason(farmer, "tend coop");
    }
  }
  if (hasBarn && !barnFed) {
    if (!farmer.intentions.queue.some(i => i.kind === "tend" && i.data.penKind === "barn")) {
      farmer.intentions.queue.push({
        kind: "tend",
        data: { penKind: "barn" },
        priority,
      });
      recordReason(farmer, "tend barn");
    }
  }
}

/**
 * Queue sell intents for any held livestock products.
 */
export function deliberateSellProducts(
  farmer: GameEntity,
  priority: number,
): void {
  if (!farmer.intentions || !farmer.inventory || !farmer.farmer) return;
  const products = farmer.inventory.products;
  if (!products) return;
  const inVillage = farmer.farmer.currentRegion === "village";

  for (const kind of ["egg", "milk", "wool"] as const) {
    const total = totalProductCount(farmer.inventory, kind);
    if (total <= 0) continue;
    if (!inVillage) {
      if (!farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetRegionId === "village")) {
        farmer.intentions.queue.push({
          kind: "travel",
          data: { targetRegionId: "village" },
          priority: priority + 1,
        });
      }
    }
    if (!farmer.intentions.queue.some(i => i.kind === "sell-product" && i.data.kind === kind)) {
      farmer.intentions.queue.push({
        kind: "sell-product",
        data: { kind },
        priority,
      });
      recordReason(farmer, `sell ${kind} x${total}`);
    }
  }
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
 * Queue sell-fruit intents for any held fruit.
 */
export function deliberateSellFruit(
  farmer: GameEntity,
  priority: number,
): void {
  if (!farmer.intentions || !farmer.inventory || !farmer.farmer) return;
  const fruit = farmer.inventory.fruit;
  if (!fruit) return;
  const inVillage = farmer.farmer.currentRegion === "village";

  for (const kind of ["apple", "cherry"] as const) {
    const total = totalFruitCount(farmer.inventory, kind);
    if (total <= 0) continue;
    if (!inVillage) {
      if (!farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetRegionId === "village")) {
        farmer.intentions.queue.push({
          kind: "travel",
          data: { targetRegionId: "village" },
          priority: priority + 1,
        });
      }
    }
    if (!farmer.intentions.queue.some(i => i.kind === "sell-fruit" && i.data.kind === kind)) {
      farmer.intentions.queue.push({
        kind: "sell-fruit",
        data: { kind },
        priority,
      });
      recordReason(farmer, `sell ${kind} x${total}`);
    }
  }
}

