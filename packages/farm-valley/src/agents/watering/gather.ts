import type { GameEntity } from "../../components";
import { recordReason } from "../../components";
import { seasonForDay } from "../../protocols/weather";
import { isWithinReach } from "../../systems/proximity";
import { nearestTile, FORAGE_ZONES } from "./shared";
import { deliberateBuyTool } from "./tools";

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
  let best: { crop: import("../../components").CropKind; qty: number } | null = null;
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
