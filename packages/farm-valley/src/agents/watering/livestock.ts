import type { GameEntity } from "../../components";
import { recordReason } from "../../components";
import type { AnimalKind } from "../../components";
import { PEN_BUILD_COST, ANIMAL_BUY_COST } from "../../economy";

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
  animal: AnimalKind,
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
 * Queue a `buy-animal` intent if the farmer has a pen but no animals yet, and
 * can afford one above reserve.
 */
export function deliberateBuyAnimal(
  farmer: GameEntity,
  animal: AnimalKind,
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
