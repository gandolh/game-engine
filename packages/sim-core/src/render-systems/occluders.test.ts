/**
 * occluders.test.ts — brief 65 follow-up: edge depth-sorting.
 *
 * Verifies that the vertical-face sprites (south wall bands + cliff faces)
 * moved out of the static bake and into the per-frame occluder push, keyed at
 * the face's base on the entity layer so characters behind the island edge
 * are occluded instead of drawn floating over the wall / water.
 */

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
      // No baked sprite may coincide with an occluder band's tile+rotation
      // while using a wall frame (the N/E/W bands on the same tile stay baked).
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
      expect(s.layer).toBe(50); // shares the farmer/NPC layer for y-sorting
      // sortY = bottom edge of the sprite's tile (its draw center +8).
      expect(s.sortY).toBe(s.y + TILE / 2);
      // The base must sort at-or-after any character center on the same tile.
      expect(s.sortY!).toBeGreaterThanOrEqual(s.y);
    }
  });
});
