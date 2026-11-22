/**
 * The combat sprites (corpus brief 12): every enemy id draws its own atlas frame at a whole-number scale with
 * its feet on the ground line, and the recipe package's colours are `MATE_PAL`'s, role for role.
 */
import { describe, expect, it } from "vitest";
import type { EnemySprite } from "@mathquest/sim-core";
import { COMBAT_ATLAS_ID, COMBAT_SPRITES, MATE_ROLES } from "@mathquest/atlas-recipes";
import { MATE_PAL } from "../render/mate-palette";
import { ENEMY_SPRITE_DRAW, drawHero, spriteScale } from "./sprites";

interface Quad {
  x: number;
  y: number;
  w: number;
  h: number;
  atlasId?: string;
  frame?: string;
  color?: string;
}

/** Minimal `UISurface` stand-in: records `rect` (the shadow) and `sprite` (the creature). */
function recordingSurface(): { rect: (...a: unknown[]) => void; sprite: (...a: unknown[]) => void; quads: Quad[] } {
  const quads: Quad[] = [];
  return {
    quads,
    rect: (x, y, w, h, color) => quads.push({ x, y, w, h, color } as Quad),
    sprite: (x, y, w, h, atlasId, frame) => quads.push({ x, y, w, h, atlasId, frame } as Quad),
  };
}

const ALL_ENEMY_SPRITES: readonly EnemySprite[] = ["dragon", "balaur", "strigoi", "varcolac", "capcaun", "muma"];

describe("combat sprites", () => {
  it("scales by whole numbers: the unit rounded down, at least 2", () => {
    expect([spriteScale(1.3), spriteScale(2.4), spriteScale(3.99), spriteScale(5.6)]).toEqual([2, 2, 3, 5]);
  });

  it("draws every enemy and the hero as one atlas frame on its ground line, plus a palette shadow", () => {
    const draws: [string, (s: never, cx: number, baseY: number, u: number) => void][] = [
      ["hero", drawHero],
      ...ALL_ENEMY_SPRITES.map((id) => [`enemy/${id}`, ENEMY_SPRITE_DRAW[id]] as [string, typeof drawHero]),
    ];
    expect(Object.keys(ENEMY_SPRITE_DRAW).sort()).toEqual([...ALL_ENEMY_SPRITES].sort());
    for (const [frame, draw] of draws) {
      const surf = recordingSurface();
      draw(surf as never, 300.4, 200.6, 3.7);
      const sprites = surf.quads.filter((q) => q.frame !== undefined);
      expect(sprites).toHaveLength(1);
      const sprite = sprites[0];
      const meta = COMBAT_SPRITES[frame];
      expect(meta, frame).toBeDefined();
      if (sprite === undefined || meta === undefined) continue;
      expect(sprite).toMatchObject({ atlasId: COMBAT_ATLAS_ID, frame, w: meta.width * 3, h: meta.height * 3 });
      expect(sprite.y + sprite.h).toBe(201); // feet on the rounded ground line
      expect(sprite.x + meta.anchorX * 3).toBe(300); // the centre line on the rounded cx
      for (const q of surf.quads.filter((r) => r.color !== undefined)) expect(q.color).toBe(MATE_PAL.ink);
    }
  });

  it("paints only MATE_PAL colours: the recipe package's roles are MATE_PAL's, value for value", () => {
    const pal = MATE_PAL as Readonly<Record<string, string>>;
    for (const [role, hex] of Object.entries(MATE_ROLES)) expect(pal[role], role).toBe(hex);
  });
});
