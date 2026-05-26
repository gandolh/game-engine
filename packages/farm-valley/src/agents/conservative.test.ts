import { describe, expect, it } from "vitest";
import { deliberateConservative } from "./conservative";
import type { GameEntity, CropKind } from "../components";
import type { RegionId } from "../world/regions";

function makeFarmer(overrides: {
  gold?: number;
  crops?: Partial<Record<CropKind, number>>;
  seeds?: Partial<Record<CropKind, number>>;
  reserve?: number;
  region?: RegionId;
}): GameEntity {
  const ZERO: Record<CropKind, number> = { radish: 0, wheat: 0, pumpkin: 0 };
  return {
    id: 1,
    farmer: { name: "C", currentRegion: overrides.region ?? "village" },
    beliefs: { data: { currentDay: 1 }, revision: 0 },
    desires: { data: { minGoldReserve: overrides.reserve ?? 30 } },
    intentions: { queue: [] },
    inventory: {
      gold: overrides.gold ?? 100,
      crops: { ...ZERO, ...overrides.crops },
      seeds: { ...ZERO, ...overrides.seeds },
    },
  };
}

describe("deliberateConservative", () => {
  it("prepends a travel intent before sell-shopkeeper when not in village", () => {
    const f = makeFarmer({
      crops: { radish: 3 },
      region: "farm-cora",
    });
    deliberateConservative(f);
    const queue = f.intentions!.queue;
    const sellIdx = queue.findIndex((i) => i.kind === "sell-shopkeeper");
    const travelIdx = queue.findIndex(
      (i) => i.kind === "travel" && i.data["targetRegionId"] === "village",
    );
    expect(sellIdx).toBeGreaterThan(-1);
    expect(travelIdx).toBeGreaterThan(-1);
    expect(travelIdx).toBeLessThan(sellIdx);
  });

  it("does not prepend travel when already in village", () => {
    const f = makeFarmer({ crops: { radish: 3 }, region: "village" });
    deliberateConservative(f);
    const queue = f.intentions!.queue;
    expect(queue.some((i) => i.kind === "travel")).toBe(false);
    expect(queue.some((i) => i.kind === "sell-shopkeeper")).toBe(true);
  });
});
