import { describe, it, expect, afterEach } from "vitest";
import {
  deliberateShrineVisit,
  deliberateTavernGather,
  deliberateFestivalGather,
} from "./social";
import { _resetComponentMap } from "../../world/connectivity";
import type { GameEntity } from "../../components";
import { SHRINE_REGION_ID, getRegion } from "../../world/regions";
import { SHRINE_COOLDOWN_DAYS } from "../../systems/ap";

// Reset the lazy connectivity singleton between tests.
afterEach(() => {
  _resetComponentMap();
});

// Village center — known walkable tile on the main land mass.
const VILLAGE = getRegion("village").center;
// Shrine center — walkable, same component as village.
const SHRINE = getRegion(SHRINE_REGION_ID).center;

/** Build a minimal farmer entity. */
function makeFarmer(overrides: {
  region?: string;
  tx?: number;
  ty?: number;
  day?: number;
  phase?: string;
  ap?: number;
  apMax?: number;
  aboard?: boolean;
  id?: number;
}): GameEntity {
  const tx = overrides.tx ?? VILLAGE.x;
  const ty = overrides.ty ?? VILLAGE.y;
  return {
    id: overrides.id ?? 1,
    transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
    farmer: {
      name: "Tester",
      currentRegion: (overrides.region ?? "village") as ReturnType<typeof getRegion>["id"],
      aboard: overrides.aboard ?? false,
    },
    beliefs: {
      data: {
        currentDay: overrides.day ?? 5,
        phase: overrides.phase ?? "morning",
        // festivalToday is set by individual tests
      },
      revision: 0,
    },
    intentions: { queue: [] },
    ap: { current: overrides.ap ?? 30, max: overrides.apMax ?? 100, penaltyPending: false, penaltyCapacity: 0, away: false },
    inventory: { gold: 100, crops: {} as never, seeds: {} as never },
  };
}

// ─── deliberateShrineVisit ───────────────────────────────────────────────────

describe("deliberateShrineVisit — reachability guard", () => {
  it("queues pray-at-shrine for a connected, on-foot farmer with low AP", () => {
    const farmer = makeFarmer({ tx: VILLAGE.x, ty: VILLAGE.y });
    deliberateShrineVisit(farmer, 10);
    const intent = farmer.intentions!.queue.find((i) => i.kind === "pray-at-shrine");
    expect(intent).toBeDefined();
  });

  it("does NOT queue pray-at-shrine when farmer is aboard (mid-boat-trip)", () => {
    const farmer = makeFarmer({ tx: VILLAGE.x, ty: VILLAGE.y, aboard: true });
    deliberateShrineVisit(farmer, 10);
    const intent = farmer.intentions!.queue.find((i) => i.kind === "pray-at-shrine");
    expect(intent).toBeUndefined();
  });

  it("does NOT queue pray-at-shrine when farmer is on a non-walkable / ocean tile", () => {
    // (0,0) is ocean — sameComponent returns false
    const farmer = makeFarmer({ tx: 0, ty: 0 });
    deliberateShrineVisit(farmer, 10);
    const intent = farmer.intentions!.queue.find((i) => i.kind === "pray-at-shrine");
    expect(intent).toBeUndefined();
  });

  it("queues travel + pray-at-shrine for a connected farmer NOT yet at shrine", () => {
    // Farmer is at village (main component, not shrine region).
    const farmer = makeFarmer({ region: "village", tx: VILLAGE.x, ty: VILLAGE.y });
    deliberateShrineVisit(farmer, 10);
    const travel = farmer.intentions!.queue.find(
      (i) => i.kind === "travel" && i.data.targetRegionId === SHRINE_REGION_ID,
    );
    const pray = farmer.intentions!.queue.find((i) => i.kind === "pray-at-shrine");
    expect(travel).toBeDefined();
    expect(pray).toBeDefined();
  });

  it("skips entirely when AP is above 55% (existing cooldown check is unaffected by guard)", () => {
    const farmer = makeFarmer({ ap: 60, apMax: 100 }); // 60% — above threshold
    deliberateShrineVisit(farmer, 10);
    expect(farmer.intentions!.queue).toHaveLength(0);
  });
});

// ─── deliberateTavernGather ──────────────────────────────────────────────────

describe("deliberateTavernGather — reachability guard", () => {
  /** day must satisfy day % TAVERN_VISIT_PERIOD === id % TAVERN_VISIT_PERIOD */
  function matchingDay(id: number): number {
    // TAVERN_VISIT_PERIOD = 12; pick day=1..100 where day%12 === id%12 and day>0
    const period = 12;
    const offset = id % period;
    // Start from 1; find first day > 0 with day%12===offset.
    return offset === 0 ? period : offset;
  }

  it("queues tavern travel for a connected, on-foot farmer on the right visit day", () => {
    const id = 1; // offset = 1 % 12 = 1
    const day = matchingDay(id);
    const farmer = makeFarmer({ id, day, tx: VILLAGE.x, ty: VILLAGE.y, ap: 50 });
    deliberateTavernGather(farmer, -2);
    const travel = farmer.intentions!.queue.find(
      (i) => i.kind === "travel" && i.data.tavernGather === true,
    );
    expect(travel).toBeDefined();
  });

  it("does NOT queue tavern travel when farmer is aboard", () => {
    const id = 1;
    const day = matchingDay(id);
    const farmer = makeFarmer({ id, day, tx: VILLAGE.x, ty: VILLAGE.y, ap: 50, aboard: true });
    deliberateTavernGather(farmer, -2);
    const travel = farmer.intentions!.queue.find((i) => i.data.tavernGather === true);
    expect(travel).toBeUndefined();
  });

  it("does NOT queue tavern travel when farmer is on a non-walkable tile", () => {
    const id = 1;
    const day = matchingDay(id);
    const farmer = makeFarmer({ id, day, tx: 0, ty: 0, ap: 50 }); // ocean
    deliberateTavernGather(farmer, -2);
    const travel = farmer.intentions!.queue.find((i) => i.data.tavernGather === true);
    expect(travel).toBeUndefined();
  });
});

// ─── deliberateFestivalGather ────────────────────────────────────────────────

describe("deliberateFestivalGather — reachability guard", () => {
  function addFestival(farmer: GameEntity): void {
    if (farmer.beliefs) {
      farmer.beliefs.data.festivalToday = { name: "Spring Planting Fair", contestCrop: "radish" };
    }
  }

  it("queues festival travel for a connected, on-foot farmer on a festival day", () => {
    // Farmer is at (75,80) — inside village but NOT within Chebyshev-1 of FESTIVAL_PODIUM_TILE (80,80).
    const farmer = makeFarmer({ tx: 75, ty: 80, ap: 50 });
    addFestival(farmer);
    deliberateFestivalGather(farmer, -2);
    const travel = farmer.intentions!.queue.find(
      (i) => i.kind === "travel" && i.data.festivalGather === true,
    );
    expect(travel).toBeDefined();
  });

  it("does NOT queue festival travel when farmer is aboard", () => {
    const farmer = makeFarmer({ tx: VILLAGE.x, ty: VILLAGE.y, ap: 50, aboard: true });
    addFestival(farmer);
    deliberateFestivalGather(farmer, -2);
    const travel = farmer.intentions!.queue.find((i) => i.data.festivalGather === true);
    expect(travel).toBeUndefined();
  });

  it("does NOT queue festival travel when farmer is on a non-walkable tile", () => {
    const farmer = makeFarmer({ tx: 0, ty: 0, ap: 50 }); // ocean
    addFestival(farmer);
    deliberateFestivalGather(farmer, -2);
    const travel = farmer.intentions!.queue.find((i) => i.data.festivalGather === true);
    expect(travel).toBeUndefined();
  });

  it("does NOT queue festival travel when no festival is active", () => {
    const farmer = makeFarmer({ tx: VILLAGE.x, ty: VILLAGE.y });
    // festivalToday not set
    deliberateFestivalGather(farmer, -2);
    expect(farmer.intentions!.queue).toHaveLength(0);
  });
});
