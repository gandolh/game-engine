import { describe, it, expect, afterEach } from "vitest";
import { deliberateSleep } from "./misc";
import { festivalPodiumTile } from "./shared";
import { _resetComponentMap } from "../../world/connectivity";
import type { GameEntity } from "../../components";
import { getRegion } from "../../world/regions";

afterEach(() => {
  _resetComponentMap();
});

const VILLAGE = getRegion("village").center;
const PODIUM = festivalPodiumTile();

function makeFarmer(overrides: {
  homeRegion?: string;
  currentRegion?: string;
  tx?: number;
  ty?: number;
  phase?: string;
  personality?: string;
  festival?: boolean;
}): GameEntity {
  const tx = overrides.tx ?? VILLAGE.x;
  const ty = overrides.ty ?? VILLAGE.y;
  return {
    id: 1,
    transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
    farmer: {
      name: "Tester",
      currentRegion: (overrides.currentRegion ?? "village") as ReturnType<typeof getRegion>["id"],
      homeRegion: (overrides.homeRegion ?? "farm-pip") as ReturnType<typeof getRegion>["id"],
      aboard: false,
    },
    beliefs: {
      data: {
        currentDay: 13,
        phase: overrides.phase ?? "work",
        festivalToday: overrides.festival
          ? { name: "Spring Planting Fair", contestCrop: "wheat" }
          : null,
      },
      revision: 0,
    },
    intentions: { queue: [] },
    ...(overrides.personality !== undefined
      ? { personality: { kind: overrides.personality as never } }
      : {}),
  };
}

describe("deliberateSleep — festival-day linger", () => {
  it("does NOT pull a farmer home while they're at the podium during a festival (work phase)", () => {
    const farmer = makeFarmer({ tx: PODIUM.x, ty: PODIUM.y, phase: "work", festival: true, personality: "conservative" });
    deliberateSleep(farmer);
    expect(farmer.intentions!.queue).toHaveLength(0);
  });

  it("a homebody personality (conservative) IS pulled home once evening starts, even at the podium", () => {
    const farmer = makeFarmer({ tx: PODIUM.x, ty: PODIUM.y, phase: "evening", festival: true, personality: "conservative" });
    deliberateSleep(farmer);
    const travel = farmer.intentions!.queue.find(i => i.kind === "travel");
    expect(travel).toBeDefined();
  });

  it("a social personality (aggressive) lingers at the podium through the evening", () => {
    const farmer = makeFarmer({ tx: PODIUM.x, ty: PODIUM.y, phase: "evening", festival: true, personality: "aggressive" });
    deliberateSleep(farmer);
    expect(farmer.intentions!.queue).toHaveLength(0);
  });

  it("still pulls a farmer home normally when NOT at the podium, festival or not", () => {
    const farm = getRegion("farm-cora").center;
    const farmer = makeFarmer({
      tx: farm.x, ty: farm.y, currentRegion: "farm-cora", homeRegion: "farm-pip",
      phase: "evening", festival: true, personality: "aggressive",
    });
    deliberateSleep(farmer);
    const travel = farmer.intentions!.queue.find(i => i.kind === "travel");
    expect(travel).toBeDefined();
  });

  it("still pulls a farmer home on a non-festival day even while standing where the podium is", () => {
    const farmer = makeFarmer({ tx: PODIUM.x, ty: PODIUM.y, phase: "work", festival: false, personality: "aggressive" });
    deliberateSleep(farmer);
    const travel = farmer.intentions!.queue.find(i => i.kind === "travel");
    expect(travel).toBeDefined();
  });
});
