import type { GameEntity } from "../components";
import { recordReason, DECORATION_RECIPE, MAX_DECORATION_BOOST, TOOL_PRICE } from "../components";
import type { DecorationKind, FarmDecoration, ToolKind } from "../components";
import type { PlotWaterSense } from "../systems/plot-sense";
import { REGIONS } from "../world/regions";

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

/**
 * Check if the watering can needs a refill and queue a refill-can intent if so.
 * Must be called BEFORE deliberateWatering so the refill lands before water actions.
 */
export function deliberateRefillCan(farmer: GameEntity, planWaterCount: number): void {
  const can = farmer.inventory?.wateringCan;
  if (!can) return;
  // If we plan to water more plots than remaining charges, refill first.
  if (can.charges < planWaterCount || can.charges === 0) {
    farmer.intentions!.queue.push({
      kind: "refill-can",
      data: {},
      priority: 0, // same as water — survival
    });
    recordReason(farmer, `refill can (${can.charges}/${can.maxCharges} charges)`);
  }
}

/**
 * Queue till intents to expand the farm up to maxNewPlots new plots this day.
 * Picks the closest unused tiles inside the farmer's farm region.
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

  let count = 0;
  outer: for (let ty = farmDef.bounds.minY; ty <= farmDef.bounds.maxY && count < maxNewPlots; ty++) {
    for (let tx = farmDef.bounds.minX; tx <= farmDef.bounds.maxX && count < maxNewPlots; tx++) {
      const key = `${tx},${ty}`;
      if (occupiedTiles.has(key)) continue;
      farmer.intentions.queue.push({
        kind: "till",
        data: { tileX: tx, tileY: ty, regionId: farmer.farmer.homeRegion },
        priority,
      });
      occupiedTiles.add(key); // optimistically mark as occupied
      count++;
    }
  }
  if (count > 0) recordReason(farmer, `till ${count} new plot${count > 1 ? "s" : ""}`);
}

/**
 * Queue chop/mine intents for visible tile features on the farmer's farm.
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

  let count = 0;
  for (const feat of tileFeatures) {
    if (feat.ownerId !== farmer.id) continue;
    if (count >= maxActions) break;
    if (feat.kind === "tree" && hasAxe) {
      farmer.intentions.queue.push({
        kind: "chop-tree",
        data: { tileX: feat.tileX, tileY: feat.tileY },
        priority,
      });
      count++;
    } else if (feat.kind === "stone" && hasPick) {
      farmer.intentions.queue.push({
        kind: "mine-stone",
        data: { tileX: feat.tileX, tileY: feat.tileY },
        priority,
      });
      count++;
    }
  }
  if (count > 0) recordReason(farmer, `gather resources (${count} actions)`);
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
  const count = Math.min(sense.due, cap);
  for (let i = 0; i < count; i++) {
    farmer.intentions!.queue.push({
      kind: "water",
      data: {},
      priority: 0, // survival — most important, watered first
    });
  }
  if (count > 0) {
    recordReason(
      farmer,
      `water ${count} plot${count > 1 ? "s" : ""}${urgent ? " (wilting!)" : ""}`,
    );
  }
}
