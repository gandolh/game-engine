import { describe, it, expect, afterEach } from "vitest";
import {
  deliberateShrineVisit,
  deliberateTavernGather,
  deliberateFestivalGather,
  FESTIVAL_FRONT_PRIORITY,
} from "./social";
import { _resetComponentMap } from "../../world/connectivity";
import type { GameEntity } from "../../components";
import { SHRINE_REGION_ID, getRegion } from "../../world/regions";
import { SHRINE_COOLDOWN_DAYS } from "../../systems/economy/ap";

afterEach(() => {
  _resetComponentMap();
});

const VILLAGE = getRegion("village").center;

const SHRINE = getRegion(SHRINE_REGION_ID).center;

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
  personality?: string;
  maxDrySoFar?: number;
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
        ...(overrides.maxDrySoFar !== undefined
          ? { plotWater: { planted: 1, due: 0, maxDrySoFar: overrides.maxDrySoFar, duePlots: [], emptyPlots: [] } }
          : {}),
      },
      revision: 0,
    },
    intentions: { queue: [] },
    ap: { current: overrides.ap ?? 30, max: overrides.apMax ?? 100, penaltyPending: false, penaltyCapacity: 0, away: false },
    inventory: { gold: 100, crops: {} as never, seeds: {} as never },
    ...(overrides.personality !== undefined
      ? { personality: { kind: overrides.personality as never } }
      : {}),
  };
}

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

    const farmer = makeFarmer({ tx: 0, ty: 0 });
    deliberateShrineVisit(farmer, 10);
    const intent = farmer.intentions!.queue.find((i) => i.kind === "pray-at-shrine");
    expect(intent).toBeUndefined();
  });

  it("queues travel + pray-at-shrine for a connected farmer NOT yet at shrine", () => {

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
    const farmer = makeFarmer({ ap: 60, apMax: 100 }); 
    deliberateShrineVisit(farmer, 10);
    expect(farmer.intentions!.queue).toHaveLength(0);
  });
});

describe("deliberateTavernGather — reachability guard", () => {

  function matchingDay(id: number): number {

    const period = 12;
    const offset = id % period;

    return offset === 0 ? period : offset;
  }

  it("queues tavern travel for a connected, on-foot farmer on the right visit day", () => {
    const id = 1; 
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
    const farmer = makeFarmer({ id, day, tx: 0, ty: 0, ap: 50 }); 
    deliberateTavernGather(farmer, -2);
    const travel = farmer.intentions!.queue.find((i) => i.data.tavernGather === true);
    expect(travel).toBeUndefined();
  });
});

describe("deliberateFestivalGather — reachability guard", () => {
  function addFestival(farmer: GameEntity): void {
    if (farmer.beliefs) {
      farmer.beliefs.data.festivalToday = { name: "Spring Planting Fair", contestCrop: "radish" };
    }
  }

  it("queues festival travel for a connected, on-foot farmer on a festival day", () => {

    // On their home farm (bridge-connected to the podium) but NOT already at the
    // podium, so a travel intent is queued. (If the farmer stands ON the podium,
    // isWithinReach short-circuits — see deliberateFestivalGather.)
    const farm = getRegion("farm-pip").center;
    const farmer = makeFarmer({ tx: farm.x, ty: farm.y, region: "farm-pip", ap: 50 });
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
    const farmer = makeFarmer({ tx: 0, ty: 0, ap: 50 }); 
    addFestival(farmer);
    deliberateFestivalGather(farmer, -2);
    const travel = farmer.intentions!.queue.find((i) => i.data.festivalGather === true);
    expect(travel).toBeUndefined();
  });

  it("does NOT queue festival travel when no festival is active", () => {
    const farmer = makeFarmer({ tx: VILLAGE.x, ty: VILLAGE.y });

    deliberateFestivalGather(farmer, -2);
    expect(farmer.intentions!.queue).toHaveLength(0);
  });

  // 2026-07-16 festival-priority-bump: root-cause regression coverage. The
  // measured bug wasn't the call-site priority (-2) — it was inside this
  // function's own gating (see social.ts's doc comment on FESTIVAL_FRONT_PRIORITY
  // and DEFAULT_FESTIVAL_DRY_TOLERANCE for the full story).

  it("queues festival travel even with LOW AP (attending is free — travel costs 0 AP)", () => {
    // Previously gated on `ap.current < 40`, copy-pasted from the tavern's
    // discretionary-luxury heuristic. That wrongly excluded any farmer whose
    // morning chores had already spent them below 40 AP by the time they
    // reconsidered — the dominant measured cause of thin gatherings.
    const farm = getRegion("farm-pip").center;
    const farmer = makeFarmer({ tx: farm.x, ty: farm.y, region: "farm-pip", ap: 0 });
    addFestival(farmer);
    deliberateFestivalGather(farmer, -2);
    const travel = farmer.intentions!.queue.find(
      (i) => i.kind === "travel" && i.data.festivalGather === true,
    );
    expect(travel).toBeDefined();
  });

  it("does NOT queue festival travel when a plot has reached the personality's dry tolerance", () => {
    // conservative's tolerance is 2 (unchanged baseline) — urgent watering still
    // outranks the festival for a cautious personality.
    const farm = getRegion("farm-pip").center;
    const farmer = makeFarmer({
      tx: farm.x, ty: farm.y, region: "farm-pip", ap: 50,
      personality: "conservative", maxDrySoFar: 2,
    });
    addFestival(farmer);
    deliberateFestivalGather(farmer, -2);
    const travel = farmer.intentions!.queue.find((i) => i.data.festivalGather === true);
    expect(travel).toBeUndefined();
  });

  it("a social personality (aggressive) tolerates more dryness before abandoning the festival", () => {
    // Same dryness (2) that bails a conservative farmer is still fine for
    // aggressive/opportunist (dryTolerance 3) — personality-flavored "stay
    // longer" per the brief.
    const farm = getRegion("farm-pip").center;
    const farmer = makeFarmer({
      tx: farm.x, ty: farm.y, region: "farm-pip", ap: 50,
      personality: "aggressive", maxDrySoFar: 2,
    });
    addFestival(farmer);
    deliberateFestivalGather(farmer, -2);
    const travel = farmer.intentions!.queue.find((i) => i.data.festivalGather === true);
    expect(travel).toBeDefined();
  });

  it("even a social personality bails once dryness reaches ITS OWN tolerance (3)", () => {
    const farm = getRegion("farm-pip").center;
    const farmer = makeFarmer({
      tx: farm.x, ty: farm.y, region: "farm-pip", ap: 50,
      personality: "aggressive", maxDrySoFar: 3,
    });
    addFestival(farmer);
    deliberateFestivalGather(farmer, -2);
    const travel = farmer.intentions!.queue.find((i) => i.data.festivalGather === true);
    expect(travel).toBeUndefined();
  });

  it("festival wins the queue-front TIE against tavern gather when pushed first (both -2)", () => {
    // The measured bug: tavern gather and festival gather both push at -2, and
    // `Array.prototype.sort` is stable, so whichever was pushed first into the
    // queue wins the front slot. Every personality file now calls
    // deliberateFestivalGather() BEFORE deliberateTavernGather() specifically so
    // festival wins this tie (see FESTIVAL_FRONT_PRIORITY's doc comment — going
    // lower than -2 instead would ALSO out-rank committed skilled excursions,
    // which regressed coral-fishing.integration.test.ts).
    expect(FESTIVAL_FRONT_PRIORITY).toBe(-2);

    const farm = getRegion("farm-pip").center;
    const farmer = makeFarmer({ tx: farm.x, ty: farm.y, region: "farm-pip", ap: 50 });
    addFestival(farmer);
    // Festival pushed FIRST (matches the fixed call order)...
    deliberateFestivalGather(farmer, FESTIVAL_FRONT_PRIORITY);
    // ...then a competing -2 "front" intent pushed after (e.g. tavern gather).
    farmer.intentions!.queue.push({
      kind: "travel",
      data: { targetTile: { x: VILLAGE.x, y: VILLAGE.y }, tavernGather: true },
      priority: -2,
    });
    farmer.intentions!.queue.sort((a, b) => a.priority - b.priority);
    expect(farmer.intentions!.queue[0]!.data.festivalGather).toBe(true);
  });
});
