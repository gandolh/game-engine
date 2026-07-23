/**
 * M5 slice 3 — sprite registry + palette-purity guard. The `draw*` fns are visual, so rather than
 * assert exact pixels we assert the two things that would actually break at runtime: every enemy
 * sprite id has a draw fn, and every colour a sprite paints is a real `MATE_PAL` role (no raw hex
 * slipping through — the project's palette rule, root CLAUDE.md). A fake surface records each
 * `rect(...)` colour; the real `UISurface.rect` signature is `(x,y,w,h,color,alpha?)`.
 */
import { describe, expect, it } from "vitest";
import type { EnemySprite } from "@mathquest/sim-core";
import { MATE_PAL } from "../render/mate-palette";
import { ENEMY_SPRITE_DRAW, drawHero } from "./sprites";

const PALETTE = new Set<string>(Object.values(MATE_PAL));

/** Minimal `UISurface` stand-in — the `draw*` fns only ever call `.rect`. */
function recordingSurface(): { rect: (x: number, y: number, w: number, h: number, color: string) => void; colors: string[] } {
  const colors: string[] = [];
  return { rect: (_x, _y, _w, _h, color) => colors.push(color), colors };
}

const ALL_ENEMY_SPRITES: readonly EnemySprite[] = ["dragon", "balaur", "strigoi", "varcolac", "capcaun", "muma"];

describe("combat sprites", () => {
  it("has a draw fn for every enemy sprite id", () => {
    for (const id of ALL_ENEMY_SPRITES) {
      expect(typeof ENEMY_SPRITE_DRAW[id]).toBe("function");
    }
    expect(Object.keys(ENEMY_SPRITE_DRAW).sort()).toEqual([...ALL_ENEMY_SPRITES].sort());
  });

  it("every sprite paints only MATE_PAL colours (no raw hex), and paints something", () => {
    const draws = [drawHero, ...ALL_ENEMY_SPRITES.map((id) => ENEMY_SPRITE_DRAW[id])];
    for (const draw of draws) {
      const surf = recordingSurface();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake surface, only .rect is used
      draw(surf as any, 200, 200, 3);
      expect(surf.colors.length).toBeGreaterThan(5); // a recognisable creature is many rects
      for (const c of surf.colors) expect(PALETTE.has(c)).toBe(true);
    }
  });
});
