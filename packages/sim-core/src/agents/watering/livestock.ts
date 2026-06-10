import type { GameEntity } from "../../components";
import { recordReason } from "../../components";
import type { AnimalKind } from "../../components";
import { PEN_BUILD_COST, ANIMAL_BUY_COST } from "../../economy";

/** Queue build-pen at carpentry when farmer has no pen of that kind and gold is above reserve. */
export function deliberateBuildPen(
  farmer: GameEntity,
  penKind: "coop" | "barn",
  animal: AnimalKind,
  reserve: number,
  priority: number,
  /** Winning travel priority on a quiet invest day so the carpentry trip actually lands; undefined = priority + 1. */
  travelPriority?: number,
): void {
  if (!farmer.intentions || !farmer.inventory || !farmer.farmer || farmer.id === undefined) return;
  const recipe = PEN_BUILD_COST[penKind];

  const hasPen = farmer.beliefs?.data["hasPen_" + penKind] as boolean | undefined;
  if (hasPen) return;

  // Gold-funded; wood gives optional discount so a wood-poor farmer can still invest.
  const wood = farmer.resources?.wood ?? 0;
  const goldDue = wood >= recipe.woodCost ? recipe.goldCost - recipe.goldDiscount : recipe.goldCost;
  if (farmer.inventory.gold - goldDue < reserve) return;

  if (farmer.intentions.queue.some(i => i.kind === "build-pen" && i.data.penKind === penKind)) return;

  const inCarpentry = farmer.farmer.currentRegion === "carpentry";
  if (!inCarpentry) {
    const wanted = travelPriority ?? priority + 1;
    const existing = farmer.intentions.queue.find(i => i.kind === "travel" && i.data.targetRegionId === "carpentry");
    if (existing) {
      // On a commit day, upgrade a shadowing carpentry trip so the build wins queue[0].
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

/** Queue buy-animal when pen exists and herd count is below 3. */
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
  const penCount = farmer.beliefs?.data["penCount_" + animal] as number | undefined ?? 0;
  if (penCount >= 3) return;

  // Animals can be bought at village OR carpenter (buy on the spot if already there).
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

/** Queue a tend intent for each untended pen the farmer owns. */
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
