
import { describe, it, expect } from "vitest";
import type { GameEntity } from "../../components";
import { PORTS } from "../../world/ports";
import { deliberatePortHop } from "./port";

const PERIOD = 9;

function makeFarmer(x: number, y: number, day: number, over: Partial<GameEntity> = {}): GameEntity {
  return {
    id: 1,
    transform: { x, y, prevX: x, prevY: y, rotation: 0 },
    intentions: { queue: [] },
    beliefs: { data: { currentDay: day }, revision: 0 },
    desires: { data: {} },
    ap: { current: 200, max: 200, penaltyPending: false, penaltyCapacity: 50, away: false },
    farmer: { name: "Hopper", currentRegion: "fishing-isle", homeRegion: "fishing-isle" },
    ...over,
  } as unknown as GameEntity;
}

describe("deliberatePortHop", () => {
  const start = PORTS[0]!;
  const target = PORTS[1]!; 

  it("on foot away from a port on a trip day → walks to the nearest port dock", () => {
    const f = makeFarmer(start.dock.x + 5, start.dock.y + 5, PERIOD);
    deliberatePortHop(f, PERIOD, 6, 140);
    const travel = f.intentions!.queue.find((i) => i.kind === "travel");
    expect(travel).toBeDefined();
    expect(travel!.data.targetTile).toEqual({ x: start.dock.x, y: start.dock.y });
  });

  it("on a port dock on a trip day → boards", () => {
    const f = makeFarmer(start.dock.x, start.dock.y, PERIOD);
    deliberatePortHop(f, PERIOD, 6, 140);
    expect(f.intentions!.queue.some((i) => i.kind === "board-boat")).toBe(true);
  });

  it("aboard, not at the target dock → sails to the target dock", () => {
    const f = makeFarmer(start.dock.x, start.dock.y, PERIOD, {
      farmer: { name: "Hopper", currentRegion: "fishing-isle", homeRegion: "fishing-isle", aboard: true },
    } as Partial<GameEntity>);
    deliberatePortHop(f, PERIOD, 6, 140);
    const travel = f.intentions!.queue.find((i) => i.kind === "travel");
    expect(travel).toBeDefined();
    expect(travel!.data.targetTile).toEqual({ x: target.dock.x, y: target.dock.y });
  });

  it("aboard, at the target dock → disembarks", () => {

    const f = makeFarmer(target.dock.x, target.dock.y, PERIOD, {
      farmer: { name: "Hopper", currentRegion: target.isle, homeRegion: "fishing-isle", aboard: true },
      beliefs: { data: { currentDay: PERIOD, portHopDay: PERIOD, portHopTarget: target.id }, revision: 0 },
    } as Partial<GameEntity>);
    deliberatePortHop(f, PERIOD, 6, 140);
    expect(f.intentions!.queue.some((i) => i.kind === "return-to-shore")).toBe(true);
  });

  it("does not start a hop off the period cadence", () => {
    const f = makeFarmer(start.dock.x, start.dock.y, PERIOD + 1); 
    deliberatePortHop(f, PERIOD, 6, 140);
    expect(f.intentions!.queue.length).toBe(0);
  });

  it("does not start a hop below the AP floor", () => {
    const f = makeFarmer(start.dock.x, start.dock.y, PERIOD, {
      ap: { current: 10, max: 200, penaltyPending: false, penaltyCapacity: 50, away: false },
    } as Partial<GameEntity>);
    deliberatePortHop(f, PERIOD, 6, 140);
    expect(f.intentions!.queue.length).toBe(0);
  });
});
