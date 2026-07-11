import type { GameEntity } from "../../components";
import { recordReason } from "../../components";
import { totalProductCount, totalFruitCount } from "../../economy";
import type { MarketOffer } from "../../protocols/market";

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
 * Liquidation run-in (brief 98): stock listed on the wall is held in escrow, so
 * anything still unsold when the run ends is value the farmer never banks. Once
 * the clock is nearly out, pull your own listings back off the wall
 * (`sell-from-wall` → CANCEL_OFFER → the wall refunds the escrow) so the crops
 * land back in inventory and the normal sell path can turn them into gold.
 * Requires the seller to be in the village (the wall's cancel gate).
 */
export function deliberateWallLiquidation(
  farmer: GameEntity,
  withinDays: number,
  priority: number,
): void {
  if (!farmer.intentions || !farmer.beliefs || !farmer.farmer) return;
  const daysRemaining = farmer.beliefs.data.daysRemaining as number | undefined;
  if (daysRemaining === undefined || daysRemaining > withinDays) return;

  const offers = farmer.beliefs.data.marketOffers as MarketOffer[] | undefined;
  if (!offers || offers.length === 0) return;

  const mine = offers.filter((o) => o.sellerId === farmer.id);
  if (mine.length === 0) return;

  if (
    farmer.farmer.currentRegion !== "village" &&
    !farmer.intentions.queue.some(
      (i) => i.kind === "travel" && i.data.targetRegionId === "village",
    )
  ) {
    farmer.intentions.queue.push({
      kind: "travel",
      data: { targetRegionId: "village" },
      priority,
    });
  }

  for (const offer of mine) {
    if (
      farmer.intentions.queue.some(
        (i) => i.kind === "sell-from-wall" && i.data.offerId === offer.offerId,
      )
    ) {
      continue;
    }
    farmer.intentions.queue.push({
      kind: "sell-from-wall",
      data: { offerId: offer.offerId },
      priority,
    });
    recordReason(
      farmer,
      `pull ${offer.crop} x${offer.quantity} off the wall: ${daysRemaining}d left`,
    );
  }
}

export function deliberatePeriodicMarketVisit(
  farmer: GameEntity,
  period: number,
  priority: number,
): void {
  if (!farmer.intentions || !farmer.beliefs || !farmer.farmer) return;
  const day = (farmer.beliefs.data.currentDay as number | undefined) ?? 0;
  if (day === 0) return; 
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
