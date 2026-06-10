import { ZERO_CROPS } from "../economy";
import { describe, expect, it } from "vitest";
import { deliberateConservative } from "./conservative";
import type { GameEntity, CropKind } from "../components";
import type { RegionId } from "../world/regions";

// Farmer transform (0,0); tile (0,0) is always within Chebyshev reach.
const EMPTY_PLOT_IN_REACH = [{ tileX: 0, tileY: 0 }];

function makeFarmer(overrides: {
  gold?: number;
  crops?: Partial<Record<CropKind, number>>;
  seeds?: Partial<Record<CropKind, number>>;
  reserve?: number;
  region?: RegionId;
}): GameEntity {
  const ZERO: Record<CropKind, number> = { ...ZERO_CROPS };
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
    expect(
      queue.some((i) => i.kind === "travel" && i.data["targetRegionId"] === "village"),
    ).toBe(false);
    expect(queue.some((i) => i.kind === "sell-shopkeeper")).toBe(true);
  });

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

  it("commits a coop build (build-pen + carpentry travel) given surplus gold + spare AP", () => {
    const f = makeFarmer({ gold: 300, reserve: 30, region: "farm-cora" });
    f.beliefs!.data["currentDay"] = 20;
    f.beliefs!.data["hasPen_coop"] = false;
    f.beliefs!.data["penCount_chicken"] = 0;
    f.beliefs!.data["orchardCount"] = 1;
    f.beliefs!.data["occupiedTiles"] = [];
    // Greenhouse takes priority over livestock on a quiet day; mark it built so coop excursion fires.
    f.beliefs!.data["hasGreenhouse"] = true;
    f.beliefs!.data["greenhouseEmptyPlots"] = [];
    f.ap = { current: 80, max: 80, away: false, unrested: false, penaltyPending: false, penaltyCapacity: 0 };
    f.resources = { wood: 0, stone: 0, ironOre: 0, geodes: 0 };

    deliberateConservative(f);
    const queue = f.intentions!.queue;

    const buildIdx = queue.findIndex((i) => i.kind === "build-pen" && i.data["penKind"] === "coop");
    const carpTravel = queue.find(
      (i) => i.kind === "travel" && i.data["targetRegionId"] === "carpentry",
    );
    expect(buildIdx).toBeGreaterThan(-1);
    expect(carpTravel).toBeDefined();
    expect(carpTravel!.priority).toBeLessThan(0); // committed: wins queue[0]
    expect(
      f.decisionTrace!.reasons.some((r) => r.startsWith("building coop")),
    ).toBe(true);
  });

  it("commits a greenhouse build (build-greenhouse + carpentry travel) given a large surplus", () => {
    const f = makeFarmer({ gold: 500, reserve: 30, region: "farm-cora" });
    f.beliefs!.data["currentDay"] = 30;
    f.beliefs!.data["hasGreenhouse"] = false;
    f.beliefs!.data["occupiedTiles"] = [];
    f.ap = { current: 80, max: 80, away: false, unrested: false, penaltyPending: false, penaltyCapacity: 0 };
    f.resources = { wood: 0, stone: 0, ironOre: 0, geodes: 0 };

    deliberateConservative(f);
    const queue = f.intentions!.queue;

    const buildIdx = queue.findIndex((i) => i.kind === "build-greenhouse");
    const carpTravel = queue.find(
      (i) => i.kind === "travel" && i.data["targetRegionId"] === "carpentry",
    );
    expect(buildIdx).toBeGreaterThan(-1);
    expect(carpTravel).toBeDefined();
    expect(carpTravel!.priority).toBeLessThan(0); // committed: wins queue[0]
    expect(
      f.decisionTrace!.reasons.some((r) => r.startsWith("build greenhouse")),
    ).toBe(true);
  });

  it("does NOT commit a greenhouse build when gold can't cover cost + reserve", () => {
    const f = makeFarmer({ gold: 150, reserve: 30, region: "farm-cora" });
    f.beliefs!.data["currentDay"] = 30;
    f.beliefs!.data["hasGreenhouse"] = false;
    f.beliefs!.data["occupiedTiles"] = [];
    f.ap = { current: 80, max: 80, away: false, unrested: false, penaltyPending: false, penaltyCapacity: 0 };
    f.resources = { wood: 0, stone: 0, ironOre: 0, geodes: 0 }; // gold-only: 150−140=10 < reserve 30

    deliberateConservative(f);
    expect(
      f.intentions!.queue.some((i) => i.kind === "build-greenhouse"),
    ).toBe(false);
  });

  it("does NOT commit a coop build when gold is below the surplus cushion", () => {
    const f = makeFarmer({ gold: 60, reserve: 30, region: "farm-cora" });
    f.beliefs!.data["currentDay"] = 20;
    f.beliefs!.data["hasPen_coop"] = false;
    f.beliefs!.data["penCount_chicken"] = 0;
    f.beliefs!.data["orchardCount"] = 1;
    f.beliefs!.data["occupiedTiles"] = [];
    f.ap = { current: 80, max: 80, away: false, unrested: false, penaltyPending: false, penaltyCapacity: 0 };
    f.resources = { wood: 0, stone: 0, ironOre: 0, geodes: 0 };

    deliberateConservative(f);
    // gold 60 with reserve 30 is below reserve+cost → no committed build trip.
    expect(
      f.intentions!.queue.some((i) => i.kind === "build-pen"),
    ).toBe(false);
  });
});
