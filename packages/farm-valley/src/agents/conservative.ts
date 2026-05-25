import type { GameEntity, CropKind } from "../components";
import { registerPersonality } from "./registry";

export function deliberateConservative(farmer: GameEntity): void {
  if (!farmer.beliefs || !farmer.desires || !farmer.intentions || !farmer.inventory) return;
  const reserve = (farmer.desires.data.minGoldReserve as number | undefined) ?? 30;
  const gold = farmer.inventory.gold;
  const seeds = farmer.inventory.seeds;
  const candidate: CropKind = "radish";
  const seedCost = 5;

  farmer.intentions.queue.length = 0;

  if (gold - seedCost >= reserve && seeds[candidate] >= 1) {
    farmer.intentions.queue.push({
      kind: "plant",
      data: { crop: candidate },
      priority: 1,
    });
  } else if (gold - seedCost >= reserve) {
    farmer.intentions.queue.push({
      kind: "buy-seed",
      data: { crop: candidate, quantity: 1 },
      priority: 2,
    });
  }

  for (const crop of (["radish", "wheat", "pumpkin"] as const)) {
    if (farmer.inventory.crops[crop] > 0) {
      farmer.intentions.queue.push({
        kind: "sell-shopkeeper",
        data: { crop, quantity: farmer.inventory.crops[crop] },
        priority: 0,
      });
    }
  }

  farmer.intentions.queue.sort((a, b) => a.priority - b.priority);
}

registerPersonality("conservative", deliberateConservative);
