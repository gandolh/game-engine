import { describe, it, expect } from "vitest";
import { World } from "@engine/core";
import { isFarmerMoving, buildStaticLayerSprites } from "./render-systems";
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

describe("isFarmerMoving", () => {
  it("is false for an idle farmer (no path, never moved)", () => {
    const entity = makeFarmerEntity({ personality: "conservative", traveling: false });
    expect(isFarmerMoving(entity)).toBe(false);
  });

  it("is true while the farmer has a path set (AI travel)", () => {
    const entity = makeFarmerEntity({ personality: "conservative", traveling: true });
    expect(isFarmerMoving(entity)).toBe(true);
  });

  it("is true when movedThisTick is set (Pip's continuous movement)", () => {
    const entity = makeFarmerEntity({ personality: "hoarder", traveling: false });
    entity.farmer!.movedThisTick = true;
    expect(isFarmerMoving(entity)).toBe(true);
  });

  it("reverts to not-moving once the path clears", () => {
    const entity = makeFarmerEntity({ personality: "hoarder", traveling: true });
    expect(isFarmerMoving(entity)).toBe(true);
    entity.farmer!.path = undefined; 
    expect(isFarmerMoving(entity)).toBe(false);
  });
});

describe("buildStaticLayerSprites (cached backdrop)", () => {
  function makeWorldWithOnePlot(): World<GameEntity> {
    const world = new World<GameEntity>();

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

  it("contains the static backdrop: grass/dirt land tiles, island walls, and plot dirt (ocean + bridges NOT baked)", () => {
    const sprites = buildStaticLayerSprites(makeWorldWithOnePlot());
    const frames = new Set(sprites.map((s) => s.frame));

    expect(frames.has("tile/grass-spring")).toBe(true);
    expect(frames.has("tile/dirt")).toBe(true);

    expect(frames.has("tile/ocean")).toBe(false);

    expect(frames.has("tile/bridge-h")).toBe(false);
    expect(frames.has("tile/wall")).toBe(true); 
    expect(frames.has("tile/wall-wood")).toBe(true); 
    expect(frames.has("tile/shore-sand")).toBe(true); 
    expect(frames.has("tile/fence-h")).toBe(false);
    expect(frames.has("tile/coral-fill")).toBe(true);
    expect(frames.has("tile/coral-edge")).toBe(true);
    expect(sprites.length).toBeGreaterThan(100);
  });

  it("does NOT contain dynamic sprites (crops or farmer entities)", () => {
    const sprites = buildStaticLayerSprites(makeWorldWithOnePlot());
    const frames = sprites.map((s) => s.frame);
    expect(frames.some((f) => f.startsWith("crop/"))).toBe(false);
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
