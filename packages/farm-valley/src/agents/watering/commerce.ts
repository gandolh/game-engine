import type { GameEntity } from "../../components";
import { recordReason } from "../../components";
import { totalProductCount, totalFruitCount } from "../../economy";

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
