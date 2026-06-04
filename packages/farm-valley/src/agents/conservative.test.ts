import { describe, expect, it } from "vitest";
import { deliberateConservative } from "./conservative";
import type { GameEntity, CropKind } from "../components";
import type { RegionId } from "../world/regions";

// proximity (brief): deliberatePlantNearby requires an empty plot within reach in
// beliefs.data.plotWater.emptyPlots. Farmer transform is (0,0); the nearest
// empty plot tile at (0,0) is Chebyshev ≤ 1 — always in reach.
const EMPTY_PLOT_IN_REACH = [{ tileX: 0, tileY: 0 }];

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
    transform: { x: 0, y: 0, prevX: 0, prevY: 0, rotation: 0 },
    farmer: { name: "C", currentRegion: overrides.region ?? "village" },
    beliefs: {
      data: {
        currentDay: 1,
        plotWater: { planted: 0, due: 0, maxDrySoFar: 0, duePlots: [], emptyPlots: EMPTY_PLOT_IN_REACH },
      },
      revision: 0,
    },
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

  it("does not prepend a travel-to-village when already in village", () => {
    const f = makeFarmer({ crops: { radish: 3 }, region: "village" });
    deliberateConservative(f);
    const queue = f.intentions!.queue;
    // The sell path must not add a redundant travel to the village (the farmer
    // is already there). A resource-zone travel (e.g. forest-south when the
    // farm has no features to gather) is a separate concern and is allowed.
    expect(
      queue.some((i) => i.kind === "travel" && i.data["targetRegionId"] === "village"),
    ).toBe(false);
    expect(queue.some((i) => i.kind === "sell-shopkeeper")).toBe(true);
  });

  // brief 19 — decision rationale trace
  it("records a plant reason referencing gold and reserve", () => {
    const f = makeFarmer({ gold: 100, seeds: { radish: 1 }, reserve: 30 });
    deliberateConservative(f);
    expect(f.decisionTrace).toBeDefined();
    expect(
      f.decisionTrace!.reasons.some((r) => r.startsWith("plant radish:")),
    ).toBe(true);
  });

  it("resets the reason buffer each deliberation tick (no carryover)", () => {
    const f = makeFarmer({ gold: 100, seeds: { radish: 1 }, reserve: 30 });
    deliberateConservative(f);
    const firstLen = f.decisionTrace!.reasons.length;
    expect(firstLen).toBeGreaterThan(0);
    deliberateConservative(f);
    expect(f.decisionTrace!.reasons.length).toBe(firstLen);
  });
});
