import type { GameEntity } from "../../components";
import { recordReason, TOOL_PRICE } from "../../components";
import type { ToolKind } from "../../components";
import { REGIONS } from "../../world/regions";
import { isWithinReach } from "../../systems/proximity";
import { nearestTile } from "./shared";

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

  if (farmer.intentions.queue.some(i => i.kind === "buy-tool" && i.data.toolKind === toolKind)) return;

  const inVillage = farmer.farmer.currentRegion === "village";
  if (!inVillage) {
    if (!farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetRegionId === "village")) {
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

export function deliberateTill(
  farmer: GameEntity,
  occupiedTiles: Set<string>,
  maxNewPlots: number,
  priority: number,
): void {
  if (!farmer.farmer?.homeRegion || !farmer.intentions || farmer.id === undefined) return;
  const hoe = (farmer.inventory?.tools ?? []).find(t => t.kind === "hoe" && t.durability > 0);
  if (!hoe) return; 

  const farmDef = REGIONS.find(r => r.id === farmer.farmer!.homeRegion);
  if (!farmDef || farmDef.kind !== "farm") return;

  const candidates: Array<{ tileX: number; tileY: number }> = [];
  outer: for (let ty = farmDef.bounds.minY; ty <= farmDef.bounds.maxY; ty++) {
    for (let tx = farmDef.bounds.minX; tx <= farmDef.bounds.maxX; tx++) {
      const key = `${tx},${ty}`;
      if (occupiedTiles.has(key)) continue;
      candidates.push({ tileX: tx, tileY: ty });
      if (candidates.length >= maxNewPlots * 3) break outer; 
    }
  }
  if (candidates.length === 0) return;

  const transform = farmer.transform;
  const inReach = candidates.filter(p => isWithinReach(transform, p.tileX, p.tileY));
  const outOfReach = candidates.filter(p => !isWithinReach(transform, p.tileX, p.tileY));

  if (inReach.length === 0) {
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

export function deliberateUpgrade(
  farmer: GameEntity,
  toolKind: ToolKind,
  priority: number,
): void {
  if (!farmer.intentions || !farmer.inventory || !farmer.farmer) return;
  const tools = farmer.inventory.tools ?? [];
  const tierOrder: Record<string, number> = { wooden: 0, stone: 1, iron: 2 };
  const best = tools
    .filter(t => t.kind === toolKind)
    .sort((a, b) => (tierOrder[b.tier] ?? 0) - (tierOrder[a.tier] ?? 0))[0];
  if (!best || best.tier === "iron") return; 

  const upgradeCost: Record<string, number> = { stone: 15, iron: 25 };
  const nextTier = best.tier === "wooden" ? "stone" : "iron";
  const cost = upgradeCost[nextTier] ?? 99;
  const reserve = (farmer.desires?.data.minGoldReserve as number | undefined) ?? 20;
  if (farmer.inventory.gold < cost + reserve) return;

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
