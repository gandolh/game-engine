import { describe, it, expect } from "vitest";
import { makeIso } from "../render/iso";
import { clampCenterToMap } from "./camera-bounds";

describe("clampCenterToMap", () => {
  const iso = makeIso(192, 192);

  it("leaves a centre on the map unchanged", () => {
    const c = iso.tileToIso(96, 40);
    expect(clampCenterToMap(iso, c.x, c.y)).toEqual(c);
  });

  it("maps a centre off each of the diamond's four edges back onto the map", () => {
    const mid = iso.tileToIso(96, 96);
    // Edges: tileX<0, tileX>W, tileY<0, tileY>H. Push each out in tile space, then project.
    const offs: [number, number][] = [
      [-30, 96],
      [192 + 30, 96],
      [96, -30],
      [96, 192 + 30],
    ];
    for (const [tx, ty] of offs) {
      const p = iso.tileToIso(tx, ty);
      const out = clampCenterToMap(iso, p.x, p.y);
      const t = iso.isoToTileContinuous(out.x, out.y);
      expect(t.tileX).toBeGreaterThanOrEqual(-1e-9);
      expect(t.tileX).toBeLessThanOrEqual(192 + 1e-9);
      expect(t.tileY).toBeGreaterThanOrEqual(-1e-9);
      expect(t.tileY).toBeLessThanOrEqual(192 + 1e-9);
      expect(out).not.toEqual(p);
    }
    expect(mid.x).toBeGreaterThan(0);
  });

  it("clamps a far corner to the corner tile", () => {
    const out = clampCenterToMap(iso, -1e6, -1e6);
    expect(iso.isoToTileContinuous(out.x, out.y).tileX).toBeCloseTo(0);
  });
});
