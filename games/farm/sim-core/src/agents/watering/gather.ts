import type { GameEntity, TileFeature } from "../../components";
import { recordReason } from "../../components";
import { seasonForDay } from "../../protocols/weather";
import { isWithinReach } from "../../systems/proximity";
import { nearestTile, FORAGE_ZONES } from "./shared";
import { deliberateBuyTool } from "./tools";
import { getRegion, nearestResourceZone, type RegionId } from "../../world/regions";

export function deliberateResourceGather(
  farmer: GameEntity,
  tileFeatures: Array<{ kind: "tree" | "stone" | "bush"; tileX: number; tileY: number; ownerId: number }>,
  maxActions: number,
  priority: number,
  /**
   * Skill-gated bias (2026-07-16): when set, gatherable features of this kind are
   * mined/gathered FIRST, so a focus farmer's action budget builds the skill it
   * is leaning into — `stone` → mining xp, `bush` → foraging xp. Undefined keeps
   * the historical y,x scan order (behaviour-preserving for existing callers).
   */
  preferKind?: "tree" | "stone" | "bush",
): void {
  if (!farmer.intentions || farmer.id === undefined) return;
  const tools = farmer.inventory?.tools ?? [];
  const hasAxe    = tools.some(t => t.kind === "axe"     && t.durability > 0);
  const hasPick   = tools.some(t => t.kind === "pickaxe" && t.durability > 0);

  const ownFeatures = tileFeatures.filter((f) => f.ownerId === farmer.id);
  if (!hasAxe && ownFeatures.some((f) => f.kind === "tree")) {
    deliberateBuyTool(farmer, "axe", priority - 1);
  }
  if (!hasPick && ownFeatures.some((f) => f.kind === "stone")) {
    deliberateBuyTool(farmer, "pickaxe", priority - 1);
  }

  const gatherable = ownFeatures

    .filter(f => (f.kind === "tree" && hasAxe) || (f.kind === "stone" && hasPick) || f.kind === "bush")
    .slice()
    .sort((a, b) => {
      if (preferKind) {
        const ap = a.kind === preferKind ? 0 : 1;
        const bp = b.kind === preferKind ? 0 : 1;
        if (ap !== bp) return ap - bp;
      }
      return a.tileY !== b.tileY ? a.tileY - b.tileY : a.tileX - b.tileX;
    });

  if (gatherable.length === 0) return;

  const transform = farmer.transform;
  const inReach    = gatherable.filter(f => isWithinReach(transform, f.tileX, f.tileY));
  const outOfReach = gatherable.filter(f => !isWithinReach(transform, f.tileX, f.tileY));

  if (inReach.length === 0) {
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

  let count = 0;
  for (const feat of inReach) {
    if (count >= maxActions) break;
    farmer.intentions.queue.push({
      kind: feat.kind === "tree" ? "chop-tree" : feat.kind === "stone" ? "mine-stone" : "gather-bush",
      data: { tileX: feat.tileX, tileY: feat.tileY },
      priority,
    });
    count++;
  }

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

export function deliberateMillVisit(
  farmer: GameEntity,
  minStock: number,
  priority: number,
): void {
  if (!farmer.intentions || !farmer.inventory) return;
  const crops = farmer.inventory.crops;
  let best: { crop: import("../../components").CropKind; qty: number } | null = null;
  for (const crop of ["grape", "pumpkin", "corn", "tomato", "winter-squash", "wheat", "carrot", "radish"] as const) {
    const qty = crops[crop];
    if (qty >= minStock && (!best || qty > best.qty)) best = { crop, qty };
  }
  if (!best) return;

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

export function deliberateSeasonalForage(
  farmer: GameEntity,
  priority: number,
): void {
  if (!farmer.intentions || !farmer.farmer) return;
  const day = (farmer.beliefs?.data.currentDay as number | undefined) ?? 0;
  const season = seasonForDay(day);
  const zone = FORAGE_ZONES.find((z) => z.season === season);
  if (!zone) return; 

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

export function deliberateResourceZoneVisit(
  farmer: GameEntity,
  ownFarmFeatures: readonly TileFeature[],
  preferKind: "tree" | "stone",
  priority: number,
  /**
   * Skill-gated (2026-07-16): a mining/forestry leaner travels to the owned zone
   * (quarry/forest, ~20 features) to work it EVEN when a stray feature sits on
   * their farm — otherwise a single farm stone suppresses the whole line. Default
   * false preserves the historical "only when the farm has none" upkeep behaviour.
   */
  force = false,
): void {
  if (!farmer.intentions || !farmer.farmer) return;
  if (!force && ownFarmFeatures.some((f) => f.kind === preferKind)) return;

  const homeRegion = farmer.farmer.homeRegion as RegionId | undefined;
  const farmCenter = homeRegion ? getRegion(homeRegion).center : { x: 0, y: 0 };
  const targetZone = nearestResourceZone(farmCenter, preferKind);

  if (farmer.farmer.currentRegion === targetZone) return;
  if (farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetRegionId === targetZone)) return;

  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetRegionId: targetZone },
    priority,
  });
  recordReason(farmer, `travel to ${targetZone}: no features on farm`);
}
