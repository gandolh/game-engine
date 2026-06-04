import type { GameEntity } from "../components";
import { recordReason, DECORATION_RECIPE, MAX_DECORATION_BOOST, TOOL_PRICE } from "../components";
import type { DecorationKind, FarmDecoration, ToolKind } from "../components";
import type { PlotWaterSense } from "../systems/plot-sense";
import { REGIONS } from "../world/regions";
import { seasonForDay, type Season } from "../protocols/weather";
import { isWithinReach } from "../systems/proximity";

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
  let best: { crop: "radish" | "wheat" | "pumpkin"; qty: number } | null = null;
  for (const crop of ["pumpkin", "wheat", "radish"] as const) {
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
