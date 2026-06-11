import { describe, expect, it } from "vitest";
import { compareSprite, spritesOverlap } from "./draw";
import type { Canvas2dSprite } from "./types";

function sprite(partial: Partial<Canvas2dSprite>): Canvas2dSprite {
  return {
    x: 0,
    y: 0,
    width: 16,
    height: 16,
    frame: "tile/test",
    atlasId: "terrain",
    rotation: 0,
    layer: 0,
    alpha: 1,
    ...partial,
  };
}

describe("compareSprite", () => {
  it("sorts by layer first", () => {
    const low = sprite({ layer: 4, y: 100 });
    const high = sprite({ layer: 50, y: 0 });
    expect(compareSprite(low, high)).toBeLessThan(0);
    expect(compareSprite(high, low)).toBeGreaterThan(0);
  });

  it("y-sorts within a layer (lower y draws first)", () => {
    const top = sprite({ layer: 50, y: 10 });
    const bottom = sprite({ layer: 50, y: 20 });
    expect(compareSprite(top, bottom)).toBeLessThan(0);
  });

  it("uses sortY over y as the depth key when present", () => {
    // A face whose draw center (y=8) is ABOVE a character (y=12), but whose
    // base (sortY=16) is below — the face must draw after (over) the character.
    const face = sprite({ layer: 50, y: 8, sortY: 16 });
    const character = sprite({ layer: 50, y: 12 });
    expect(compareSprite(character, face)).toBeLessThan(0);
    expect(compareSprite(face, character)).toBeGreaterThan(0);
  });

  it("compares sortY against the other sprite's plain y when only one has it", () => {
    // Character south of the face's base still draws on top of it.
    const face = sprite({ layer: 50, y: 8, sortY: 16 });
    const characterInFront = sprite({ layer: 50, y: 24 });
    expect(compareSprite(face, characterInFront)).toBeLessThan(0);
  });
});

describe("spritesOverlap (x-ray pass)", () => {
  it("overlapping rects are detected", () => {
    const a = sprite({ x: 100, y: 100 });
    const b = sprite({ x: 104, y: 96 });
    expect(spritesOverlap(a, b)).toBe(true);
  });

  it("edge-adjacent tiles do not overlap (strict)", () => {
    const a = sprite({ x: 100, y: 100 });        // [92,108]
    const b = sprite({ x: 116, y: 100 });        // [108,124] — shares the 108 edge only
    expect(spritesOverlap(a, b)).toBe(false);
  });

  it("a tall occluder (e.g. a wall/building) covers a player one tile north", () => {
    const player = sprite({ x: 100, y: 84 });                      // ground at y=84
    const wall = sprite({ x: 100, y: 100, height: 48, sortY: 108 }); // 48px tall, base south of player
    expect(spritesOverlap(player, wall)).toBe(true);
  });

  it("z lift is accounted for — a high-z drop is tested at its lifted screen rect", () => {
    const lifted = sprite({ x: 100, y: 200, z: 100 }); // drawn around screen-y 100
    const atScreen = sprite({ x: 100, y: 100 });
    expect(spritesOverlap(lifted, atScreen)).toBe(true);
    const atGround = sprite({ x: 100, y: 200 });
    expect(spritesOverlap(lifted, atGround)).toBe(false); // not where it's drawn
  });
});
