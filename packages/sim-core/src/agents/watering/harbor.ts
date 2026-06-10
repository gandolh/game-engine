import type { GameEntity } from "../../components";
import { recordReason } from "../../components";
import type { HarborContract } from "../../protocols/harbor";

/**
 * Evaluate all open harbor contracts and commit to the best affordable one
 * that this farmer can realistically fill before the deadline.
 *
 * The farmer evaluates:
 *  1. Reputation gate (minReputation ≤ their reputation).
 *  2. They don't already have a committed contract.
 *  3. For the goods: do they already have the crop + quantity in inventory
 *     (immediate delivery), OR can they plant + harvest in time given the
 *     deadline and current day?
 *  4. The contract reward is "better than just selling to the shop"
 *     (CONTRACT_REWARD_MULT guarantees ≥2× shop price).
 *
 * `riskTolerance`:
 *   0.0 = conservative: only commit if goods are ALREADY in inventory.
 *   0.5 = moderate:     commit if goods can be gathered in time (days-to-deadline ≥ growthDays).
 *   1.0 = aggressive:   commit speculatively (may miss deadline).
 *
 * `travelPriority`: winning travel priority for the harbor excursion when
 * committing to a delivery. undefined = non-committal (priority + 1).
 */
export function deliberateHarborContract(
  farmer: GameEntity,
  openContracts: HarborContract[],
  riskTolerance: number,
  reserve: number,
  priority: number,
  travelPriority?: number,
): void {
  if (!farmer.intentions || !farmer.inventory || !farmer.farmer) return;
  // Already committed? Just prioritize delivery.
  const committed = farmer.farmer?.committedContract;
  if (committed !== undefined) {
    deliberateDeliverContract(farmer, committed, priority, travelPriority);
    return;
  }
  if (openContracts.length === 0) return;

  const day = (farmer.beliefs?.data.currentDay as number | undefined) ?? 0;
  const rep = farmer.farmer.harborReputation ?? 0;

  // Don't double-queue.
  if (farmer.intentions.queue.some(i => i.kind === "commit-contract")) return;

  // Filter eligible contracts.
  const eligible = openContracts.filter((c) => {
    if (c.minReputation > rep) return false;
    const daysLeft = c.deadlineDay - day;
    if (daysLeft <= 0) return false;

    const { crop, quantity } = c.goods;
    const have = farmer.inventory!.crops[crop] ?? 0;

    if (have >= quantity) return true; // already in stock

    // Grow-then-deliver speculative commits. Min crop cycle is ~5 days
    // (radish) but includes plant + harvest + travel → safe floor is 8.
    // A 6-day normal contract is too tight for grow-then-deliver; only
    // silver (8d) / gold (10d) contracts are viable for speculation.
    if (riskTolerance >= 1.0) {
      // Aggressive: speculate on any deadline > 3 days (short turnaround ok).
      return daysLeft >= 3;
    }
    if (riskTolerance >= 0.5) {
      // Moderate: grow-then-deliver only if deadline is long enough.
      return daysLeft >= 8;
    }
    return false; // conservative / default: only if already have goods
  });

  if (eligible.length === 0) return;

  // Pick the best contract (highest reward per day remaining, as a tiebreak).
  const scored = eligible.map((c) => {
    const daysLeft = Math.max(1, c.deadlineDay - day);
    return { contract: c, score: c.reward / daysLeft };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return;
  const pick = best.contract;

  // Check we're at the harbor (or commit to travel there).
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

/**
 * Queue a deliver-contract intent when the farmer has a committed contract and
 * has or can get the goods. The delivery itself is handled by HarborSystem
 * (every tick when farmer is at harbor with goods). This helper ensures the
 * farmer PRIORITISES traveling to the harbor when committed, overriding
 * discretionary activities — the "committed excursion wins" pattern from
 * brief 42/43.
 *
 * `travelPriority`: winning harbor-travel priority (undefined = non-committal).
 */
export function deliberateDeliverContract(
  farmer: GameEntity,
  contract: HarborContract,
  priority: number,
  travelPriority?: number,
): void {
  if (!farmer.intentions || !farmer.farmer) return;

  const day = (farmer.beliefs?.data.currentDay as number | undefined) ?? 0;
  const daysLeft = contract.deadlineDay - day;
  if (daysLeft <= 0) return; // too late — HarborSystem will penalize on next DAY_START

  const { crop, quantity } = contract.goods;
  const have = farmer.inventory?.crops[crop] ?? 0;
  const hasGoods = have >= quantity;

  const atHarbor = farmer.farmer.currentRegion === "harbor";

  // Only route to harbor when the farmer has the goods (or is already there).
  // When the farmer lacks goods, don't pre-empt farming — let them grow first,
  // then the next deliberation will detect goods and route to harbor.
  // Exception: rush to harbor when only 1 day remains (last-ditch attempt).
  const shouldTravelHarbor = hasGoods || daysLeft <= 1;

  if (!atHarbor && shouldTravelHarbor) {
    const existing = farmer.intentions.queue.find(i => i.kind === "travel" && i.data.targetRegionId === "harbor");
    // committed delivery WINS travel on the day the farmer has the goods
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
  // Queue deliver intent only when we have goods (or at harbor) to avoid
  // burning AP on a futile deliver action.
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
