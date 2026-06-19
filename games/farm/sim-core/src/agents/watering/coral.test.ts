import { describe, it, expect } from "vitest";
import type { GameEntity } from "../../components";
import { deliberateCoralFishing } from "./coral";
import { CORAL_REEFS, nearestReef } from "../../world/coral";

function makeFarmer(over: Partial<GameEntity> = {}): GameEntity {
  return {
    id: 1,
    transform: { x: 24, y: 40, prevX: 24, prevY: 40, rotation: 0 },
    beliefs: { data: { currentDay: 6 }, revision: 0 },
    intentions: { queue: [] },
    ap: { current: 100, max: 100, penaltyPending: false, penaltyCapacity: 0, away: false },
    inventory: {
      gold: 100,
      crops: {} as never,
      seeds: {} as never,
      tools: [{ kind: "fishing-rod", tier: "wooden", durability: Infinity }],
    },
    farmer: { name: "Tester", currentRegion: "farm-cora" },
    ...over,
  } as GameEntity;
}

describe("deliberateCoralFishing", () => {
  it("queues a travel to the nearest dock when on land on a period day", () => {
    const f = makeFarmer();
    deliberateCoralFishing(f, 6, 3, 12, 40);
    const travel = f.intentions!.queue.find((i) => i.kind === "travel");
    expect(travel).toBeDefined();

    // Targets the dock of whichever reef is nearest the farmer (positions are
    // seed-generated, so derive the expectation rather than hardcoding a reef).
    const near = nearestReef(f.transform!.x, f.transform!.y);
    expect(travel!.data.targetTile).toEqual({ x: near.dock.x, y: near.dock.y });
  });

  it("queues board-boat when standing on a dock tile on foot", () => {
    const dock = CORAL_REEFS[0]!.dock;
    const f = makeFarmer({ transform: { x: dock.x, y: dock.y, prevX: dock.x, prevY: dock.y, rotation: 0 } });
    deliberateCoralFishing(f, 6, 3, 12, 40);
    expect(f.intentions!.queue.some((i) => i.kind === "board-boat")).toBe(true);
  });

  it("queues a travel to the reef when aboard but not yet there", () => {
    const dock = CORAL_REEFS[0]!.dock;
    const f = makeFarmer({
      transform: { x: dock.x, y: dock.y, prevX: dock.x, prevY: dock.y, rotation: 0 },
      farmer: { name: "T", currentRegion: "fishing-isle", aboard: true },
    });
    deliberateCoralFishing(f, 6, 3, 12, 40);
    const travel = f.intentions!.queue.find((i) => i.kind === "travel");
    expect(travel).toBeDefined();
    expect(travel!.data.targetTile).toEqual({ x: CORAL_REEFS[0]!.reef.x, y: CORAL_REEFS[0]!.reef.y });
  });

  it("queues fish-coral casts when aboard at the reef", () => {
    const reef = CORAL_REEFS[0]!.reef;
    const f = makeFarmer({
      transform: { x: reef.x, y: reef.y, prevX: reef.x, prevY: reef.y, rotation: 0 },
      farmer: { name: "T", currentRegion: "fishing-isle", aboard: true },
    });
    deliberateCoralFishing(f, 6, 3, 12, 40);
    const casts = f.intentions!.queue.filter((i) => i.kind === "fish-coral");
    expect(casts.length).toBe(3);
  });

  it("always queues return-to-shore when aboard back at the dock, even off a period day", () => {
    const dock = CORAL_REEFS[0]!.dock;
    const f = makeFarmer({
      beliefs: { data: { currentDay: 7 }, revision: 0 }, 
      transform: { x: dock.x, y: dock.y, prevX: dock.x, prevY: dock.y, rotation: 0 },
      farmer: { name: "T", currentRegion: "fishing-isle", aboard: true },
    });
    deliberateCoralFishing(f, 6, 3, 12, 40);
    expect(f.intentions!.queue.some((i) => i.kind === "return-to-shore")).toBe(true);
  });

  it("rows back to the dock when aboard at the reef on a non-period day (abort)", () => {
    const reef = CORAL_REEFS[0]!.reef;
    const f = makeFarmer({
      beliefs: { data: { currentDay: 7 }, revision: 0 },
      transform: { x: reef.x, y: reef.y, prevX: reef.x, prevY: reef.y, rotation: 0 },
      farmer: { name: "T", currentRegion: "fishing-isle", aboard: true },
    });
    deliberateCoralFishing(f, 6, 3, 12, 40);
    const travel = f.intentions!.queue.find((i) => i.kind === "travel");
    expect(travel).toBeDefined();
    expect(travel!.data.targetTile).toEqual({ x: CORAL_REEFS[0]!.dock.x, y: CORAL_REEFS[0]!.dock.y });
  });

  it("does nothing on a non-period day when on foot", () => {
    const f = makeFarmer({ beliefs: { data: { currentDay: 7 }, revision: 0 } });
    deliberateCoralFishing(f, 6, 3, 12, 40);
    expect(f.intentions!.queue.length).toBe(0);
  });

  it("does nothing when AP is below the floor", () => {
    const f = makeFarmer({
      ap: { current: 10, max: 100, penaltyPending: false, penaltyCapacity: 0, away: false },
    });
    deliberateCoralFishing(f, 6, 3, 12, 40);
    expect(f.intentions!.queue.length).toBe(0);
  });
});
