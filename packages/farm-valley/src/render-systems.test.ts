import { describe, it, expect } from "vitest";
import { World } from "@engine/core";
import { pickFarmerFrame, buildStaticLayerSprites } from "./render-systems";
import type { GameEntity } from "./components";

function makeFarmerEntity(opts: {
  personality: string;
  traveling: boolean;
}): GameEntity {
  const baseFrame = `farmer/${opts.personality}`;
  return {
    sprite: {
      frame: baseFrame,
      layer: 50,
      tintRgba: 0x000000ff,
    },
    farmer: {
      name: opts.personality,
      currentRegion: "village" as import("./world/regions").RegionId,
      path: opts.traveling
        ? {
            waypoints: [
              { x: 5, y: 5 },
              { x: 6, y: 5 },
            ],
            nextIndex: 1,
            ticksUntilStep: 3,
          }
        : undefined,
    },
    transform: {
      x: 5,
      y: 5,
      prevX: 5,
      prevY: 5,
      rotation: 0,
    },
  } as unknown as GameEntity;
}

describe("pickFarmerFrame", () => {
  it("returns the base frame when the farmer is idle (no path)", () => {
    const entity = makeFarmerEntity({ personality: "conservative", traveling: false });
    const frame = pickFarmerFrame(entity, 42);
    expect(frame).toBe("farmer/conservative");
  });

  it("returns a walk frame when the farmer has a path set", () => {
    const entity = makeFarmerEntity({ personality: "conservative", traveling: true });
    const frame = pickFarmerFrame(entity, 0);
    expect(frame).toMatch(/^farmer\/conservative\/walk-[ab]$/);
  });

  it("alternates between walk-a and walk-b across consecutive tick parities", () => {
    const entity = makeFarmerEntity({ personality: "conservative", traveling: true });

    // Collect frames for ticks 0-7 to observe the alternation pattern.
    const frames = Array.from({ length: 8 }, (_, tick) =>
      pickFarmerFrame(entity, tick),
    );

    // Each frame must be one of the two walk frames.
    for (const f of frames) {
      expect(f).toMatch(/^farmer\/conservative\/walk-[ab]$/);
    }

    // The phase changes every 2 ticks: ticks 0-1 same, ticks 2-3 different, etc.
    expect(frames[0]).toBe(frames[1]);
    expect(frames[2]).toBe(frames[3]);
    expect(frames[4]).toBe(frames[5]);
    expect(frames[0]).not.toBe(frames[2]);
    expect(frames[2]).not.toBe(frames[4]);
  });

  it("works for all four farmer personalities", () => {
    const personalities = ["conservative", "aggressive", "hoarder", "opportunist"];
    for (const personality of personalities) {
      const entity = makeFarmerEntity({ personality, traveling: true });
      const frameA = pickFarmerFrame(entity, 0);
      const frameB = pickFarmerFrame(entity, 2);
      expect(frameA).toBe(`farmer/${personality}/walk-a`);
      expect(frameB).toBe(`farmer/${personality}/walk-b`);
    }
  });

  it("reverts to idle frame once path clears", () => {
    const entity = makeFarmerEntity({ personality: "hoarder", traveling: true });
    expect(pickFarmerFrame(entity, 0)).toMatch(/walk-/);

    // Clear path — simulate arrival.
    entity.farmer!.path = undefined;
    expect(pickFarmerFrame(entity, 0)).toBe("farmer/hoarder");
  });
});

describe("buildStaticLayerSprites (cached backdrop)", () => {
  function makeWorldWithOnePlot(): World<GameEntity> {
    const world = new World<GameEntity>();
    // A plot (dirt is static); a planted crop on it (dynamic, must NOT appear);
    // a farmer sprite (dynamic, must NOT appear).
    world.spawn({
      plot: {
        ownerId: 1,
        regionId: "farm-cora" as import("./world/regions").RegionId,
        tileX: 18,
        tileY: 5,
        state: { kind: "planted", crop: "radish", daysGrowing: 1, readyAtDay: 2, weatherSum: 0 },
      },
    } as unknown as GameEntity);
    world.spawn({
      sprite: { frame: "farmer/conservative", layer: 50, tintRgba: 0xffffffff },
      transform: { x: 18, y: 5, prevX: 18, prevY: 5, rotation: 0 },
      farmer: { name: "C", currentRegion: "farm-cora" as import("./world/regions").RegionId },
    } as unknown as GameEntity);
    return world;
  }

  it("contains the static backdrop: grass/dirt/path tiles, fences, and plot dirt", () => {
    const sprites = buildStaticLayerSprites(makeWorldWithOnePlot());
    const frames = new Set(sprites.map((s) => s.frame));
    // Backdrop tile kinds present (the real layout has all three).
    expect(frames.has("tile/grass")).toBe(true);
    expect(frames.has("tile/dirt")).toBe(true);
    expect(frames.has("tile/path")).toBe(true);
    // Farm fences are baked in.
    expect(frames.has("tile/fence-h")).toBe(true);
    // Lots of tiles (40×40 world is mostly walkable region/road).
    expect(sprites.length).toBeGreaterThan(100);
  });

  it("does NOT contain dynamic sprites (crops or farmer entities)", () => {
    const sprites = buildStaticLayerSprites(makeWorldWithOnePlot());
    const frames = sprites.map((s) => s.frame);
    // No crop sprite (crops grow → dynamic).
    expect(frames.some((f) => f.startsWith("crop/"))).toBe(false);
    // No farmer/structure entity sprites.
    expect(frames.some((f) => f.startsWith("farmer/"))).toBe(false);
  });

  it("includes exactly one dirt tile per plot", () => {
    const world = makeWorldWithOnePlot();
    const dirtForPlot = buildStaticLayerSprites(world).filter(
      (s) => s.frame === "tile/dirt" && s.x === 18 * 16 + 8 && s.y === 5 * 16 + 8,
    );
    expect(dirtForPlot.length).toBe(1);
  });
});
