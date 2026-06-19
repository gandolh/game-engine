import type { GameEntity } from "../../components";
import { recordReason } from "../../components";
import type { HarborContract } from "../../protocols/harbor";

export function deliberateHarborContract(
  farmer: GameEntity,
  openContracts: HarborContract[],
  riskTolerance: number,
  reserve: number,
  priority: number,
  travelPriority?: number,
): void {
  if (!farmer.intentions || !farmer.inventory || !farmer.farmer) return;

  const committed = farmer.farmer?.committedContract;
  if (committed !== undefined) {
    deliberateDeliverContract(farmer, committed, priority, travelPriority);
    return;
  }
  if (openContracts.length === 0) return;

  const day = (farmer.beliefs?.data.currentDay as number | undefined) ?? 0;
  const rep = farmer.farmer.harborReputation ?? 0;

  if (farmer.intentions.queue.some(i => i.kind === "commit-contract")) return;

  const eligible = openContracts.filter((c) => {
    if (c.minReputation > rep) return false;
    const daysLeft = c.deadlineDay - day;
    if (daysLeft <= 0) return false;

    const { crop, quantity } = c.goods;
    const have = farmer.inventory!.crops[crop] ?? 0;

    if (have >= quantity) return true; 

    if (riskTolerance >= 1.0) {

      return daysLeft >= 3;
    }
    if (riskTolerance >= 0.5) {

      return daysLeft >= 8;
    }
    return false; 
  });

  if (eligible.length === 0) return;

  const scored = eligible.map((c) => {
    const daysLeft = Math.max(1, c.deadlineDay - day);
    return { contract: c, score: c.reward / daysLeft };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return;
  const pick = best.contract;

  const atHarbor = farmer.farmer.currentRegion === "harbor";
  if (!atHarbor) {
    const existing = farmer.intentions.queue.find(i => i.kind === "travel" && i.data.targetRegionId === "harbor");
    const wanted = travelPriority ?? priority + 1;
    if (existing) {
      if (wanted < existing.priority) existing.priority = wanted;
    } else {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetRegionId: "harbor" },
        priority: wanted,
      });
    }
  }
  farmer.intentions.queue.push({
    kind: "commit-contract",
    data: { contractId: pick.id },
    priority,
  });
  recordReason(
    farmer,
    `commit to contract ${pick.id}: ${pick.goods.quantity}× ${pick.goods.crop} for ${pick.reward}g (deadline day ${pick.deadlineDay})`,
  );
}

export function deliberateDeliverContract(
  farmer: GameEntity,
  contract: HarborContract,
  priority: number,
  travelPriority?: number,
): void {
  if (!farmer.intentions || !farmer.farmer) return;

  const day = (farmer.beliefs?.data.currentDay as number | undefined) ?? 0;
  const daysLeft = contract.deadlineDay - day;
  if (daysLeft <= 0) return; 

  const { crop, quantity } = contract.goods;
  const have = farmer.inventory?.crops[crop] ?? 0;
  const hasGoods = have >= quantity;

  const atHarbor = farmer.farmer.currentRegion === "harbor";

  const shouldTravelHarbor = hasGoods || daysLeft <= 1;

  if (!atHarbor && shouldTravelHarbor) {
    const existing = farmer.intentions.queue.find(i => i.kind === "travel" && i.data.targetRegionId === "harbor");

    const wanted = hasGoods && travelPriority !== undefined ? travelPriority : (travelPriority ?? priority + 1);
    if (existing) {
      if (wanted < existing.priority) existing.priority = wanted;
    } else {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetRegionId: "harbor" },
        priority: wanted,
      });
    }
  }

  if (hasGoods || atHarbor) {
    if (!farmer.intentions.queue.some(i => i.kind === "deliver-contract")) {
      farmer.intentions.queue.push({
        kind: "deliver-contract",
        data: { contractId: contract.id },
        priority,
      });
    }
  }

  recordReason(
    farmer,
    `deliver contract ${contract.id}: need ${quantity}× ${crop}, have ${have} (deadline day ${contract.deadlineDay}, daysLeft=${daysLeft})`,
  );
}
