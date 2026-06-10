import { describe, expect, it } from "vitest";
import { World } from "@engine/core";
import type { Canvas2dSprite } from "@engine/core";
import type { GameEntity } from "../components";
import { OCCLUDER_WALLS, CLIFFS, isOccluderWall, WALLS } from "./geometry";
import { iterStaticSprites } from "./static-layer";
import { pushOccluderSprites } from "./occluders";

const TILE = 16;

describe("occluder walls", () => {
  it("exist (the archipelago has south-facing stone/wood edges)", () => {
    expect(OCCLUDER_WALLS.length).toBeGreaterThan(0);
  });

  it("are exactly the south-facing non-beach wall bands", () => {
    for (const w of OCCLUDER_WALLS) {
      expect(w.rotation).toBe(Math.PI);
      expect(w.frame).not.toBe("tile/shore-sand");
    }
    expect(OCCLUDER_WALLS.length).toBe(WALLS.filter(isOccluderWall).length);
  });
});

describe("static layer exclusions", () => {
  it("bakes neither cliff faces nor occluder wall bands", () => {
    const world = new World<GameEntity>();
    const occluderKeys = new Set(
      OCCLUDER_WALLS.map((w) => `${w.tx},${w.ty},${w.rotation}`),
    );
    for (const s of iterStaticSprites(world)) {
      expect(s.frame.startsWith("tile/cliff-face")).toBe(false);
      const tx = Math.floor(s.x / TILE);
      const ty = Math.floor(s.y / TILE);
      // N/E/W bands on the same tile stay baked; only the south band is an occluder.
      if (s.frame === "tile/wall" || s.frame === "tile/wall-wood") {
        expect(
          occluderKeys.has(`${tx},${ty},${s.rotation}`),
          `south wall band at (${tx},${ty}) must not be baked`,
        ).toBe(false);
      }
    }
  });

  it("still bakes the non-south wall bands", () => {
    const world = new World<GameEntity>();
    let bakedWalls = 0;
    for (const s of iterStaticSprites(world)) {
      if (s.layer === 4) bakedWalls += 1;
    }
    expect(bakedWalls).toBe(WALLS.length - OCCLUDER_WALLS.length);
  });
});

describe("pushOccluderSprites", () => {
  it("pushes every occluder wall + cliff on the entity layer, depth-keyed at the face base", () => {
    const pushed: Canvas2dSprite[] = [];
    pushOccluderSprites({ push: (s) => void pushed.push(s) });

    expect(pushed.length).toBe(OCCLUDER_WALLS.length + CLIFFS.length);
    for (const s of pushed) {
      expect(s.layer).toBe(50); // entity layer for y-sorting with farmers/NPCs
      expect(s.sortY).toBe(s.y + TILE / 2); // sortY = bottom edge of tile
      expect(s.sortY!).toBeGreaterThanOrEqual(s.y);
    }
  });
});
