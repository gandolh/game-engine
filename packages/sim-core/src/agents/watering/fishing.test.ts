import { describe, it, expect } from "vitest";
import type { GameEntity } from "../../components";
import { deliberateFishing } from "./fishing";
import { fishingCastTiles } from "./shared";
import { isFishingIsle, regionAt } from "../../world/regions";

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

const PERIOD = 6;
const CASTS = 2;
const PRIORITY = 5;

describe("deliberateFishing (brief 80)", () => {
  it("off-isle on a period day: queues travel to a real cast tile + the right number of fish casts", () => {
    const f = makeFarmer();
    deliberateFishing(f, PERIOD, CASTS, PRIORITY);

    const travel = f.intentions!.queue.find((i) => i.kind === "travel");
    expect(travel).toBeDefined();
    const target = travel!.data.targetTile as { x: number; y: number };

    expect(fishingCastTiles().some((t) => t.x === target.x && t.y === target.y)).toBe(true);
    expect(isFishingIsle(regionAt(target.x, target.y))).toBe(true);

    const casts = f.intentions!.queue.filter((i) => i.kind === "fish");
    expect(casts.length).toBe(CASTS);
  });

  it("already on a fishing isle: queues fish casts with no travel", () => {
    const isle = fishingCastTiles()[0]!;
    const f = makeFarmer({
      transform: { x: isle.x, y: isle.y, prevX: isle.x, prevY: isle.y, rotation: 0 },
      farmer: { name: "Tester", currentRegion: regionAt(isle.x, isle.y) ?? "fishing-isle" },
    });
    deliberateFishing(f, PERIOD, CASTS, PRIORITY);

    expect(f.intentions!.queue.some((i) => i.kind === "travel")).toBe(false);
    expect(f.intentions!.queue.filter((i) => i.kind === "fish").length).toBe(CASTS);
  });

  it("does not fire without a fishing rod", () => {
    const f = makeFarmer({
      inventory: { gold: 100, crops: {} as never, seeds: {} as never, tools: [] },
    });
    deliberateFishing(f, PERIOD, CASTS, PRIORITY);
    expect(f.intentions!.queue.length).toBe(0);
  });

  it("does not fire off a period day or under the AP floor", () => {
    const offDay = makeFarmer({ beliefs: { data: { currentDay: 7 }, revision: 0 } });
    deliberateFishing(offDay, PERIOD, CASTS, PRIORITY);
    expect(offDay.intentions!.queue.length).toBe(0);

    const lowAp = makeFarmer({
      ap: { current: 10, max: 100, penaltyPending: false, penaltyCapacity: 0, away: false },
    });
    deliberateFishing(lowAp, PERIOD, CASTS, PRIORITY);
    expect(lowAp.intentions!.queue.length).toBe(0);
  });
});
