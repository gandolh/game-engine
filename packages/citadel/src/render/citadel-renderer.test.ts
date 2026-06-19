/**
 * Pure-function tests for the citadel WebGPU renderer module.
 *
 * These never instantiate the GPU renderer (jsdom has no WebGPU). They exercise
 * the pure helpers: building→quad color/footprint mapping, terrain color
 * coverage, the packed-tint encoding, and the Camera2D screen→tile transform
 * that placement-state depends on (the highest-risk surface).
 */
import { describe, it, expect } from "vitest";
import { EDG, rgbOf } from "@engine/core";
import { TerrainType, TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from "@citadel/sim-core";
import type { BuildingSnapshot, VillagerSnapshot, RaiderSnapshot } from "@citadel/sim-core";
import {
  packTint,
  buildingQuad,
  villagerQuad,
  raiderQuad,
  ghostQuad,
  TERRAIN_COLORS,
  BUILDING_COLORS,
  screenToWorld,
  screenToTile,
  WORLD_PX_W,
  WORLD_PX_H,
  type CameraTransform,
  autotileQuads,
  neighbourMask,
  networkQuads,
  tileKey,
  DIR_N,
  DIR_E,
  DIR_S,
  DIR_W,
  ditherHash,
  ditherClusters,
  ditherAccents,
  DITHER_ACCENTS,
  type QuadSpec,
} from "./citadel-renderer";

function building(partial: Partial<BuildingSnapshot> & Pick<BuildingSnapshot, "type" | "x" | "y" | "w" | "h">): BuildingSnapshot {
  return {
    connected: true,
    outputBuffer: 0,
    workerCount: 0,
    onFire: false,
    burning: false,
    level: 1,
    ...partial,
  };
}

describe("packTint", () => {
  it("packs an EDG hex into 0xRRGGBBAA with full alpha by default", () => {
    const [r, g, b] = rgbOf(EDG.red);
    expect(packTint(EDG.red)).toBe(((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0);
  });

  it("honors an explicit alpha byte", () => {
    expect(packTint(EDG.green, 0x80) & 0xff).toBe(0x80);
  });

  it("returns an unsigned 32-bit int (top bit set stays positive)", () => {
    // EDG.white = #ffffff → 0xffffffff which would be negative without >>>0.
    expect(packTint(EDG.white)).toBeGreaterThan(0);
  });
});

describe("buildingQuad", () => {
  it("maps a house to its EDG color and full footprint", () => {
    const q = buildingQuad(building({ type: "house", x: 3, y: 4, w: 2, h: 2 }));
    expect(q.tintRgba).toBe(packTint(EDG.clay));
    expect(q).toMatchObject({ x: 3 * TILE_SIZE, y: 4 * TILE_SIZE, width: 2 * TILE_SIZE, height: 2 * TILE_SIZE });
  });

  it("maps a keep to plum and a 1x1 storehouse footprint correctly", () => {
    const keep = buildingQuad(building({ type: "keep", x: 0, y: 0, w: 3, h: 3 }));
    expect(keep.tintRgba).toBe(packTint(EDG.plum));
    expect(keep.width).toBe(3 * TILE_SIZE);
    const store = buildingQuad(building({ type: "storehouse", x: 1, y: 1, w: 1, h: 1 }));
    expect(store.tintRgba).toBe(packTint(EDG.steel));
    expect(store.width).toBe(TILE_SIZE);
  });

  it("tints a burning building orange regardless of type", () => {
    const q = buildingQuad(building({ type: "house", x: 0, y: 0, w: 2, h: 2, burning: true }));
    expect(q.tintRgba).toBe(packTint(EDG.orange));
  });

  it("draws a road as a centered inset band", () => {
    const q = buildingQuad(building({ type: "road", x: 5, y: 5, w: 1, h: 1 }));
    const inset = TILE_SIZE * 0.25;
    expect(q.x).toBe(5 * TILE_SIZE + inset);
    expect(q.width).toBe(TILE_SIZE - inset * 2);
    expect(q.tintRgba).toBe(packTint(EDG.navy));
  });

  it("draws a gate slightly inset in gold", () => {
    const q = buildingQuad(building({ type: "gate", x: 2, y: 2, w: 1, h: 1 }));
    const inset = TILE_SIZE * 0.15;
    expect(q.x).toBe(2 * TILE_SIZE + inset);
    expect(q.tintRgba).toBe(packTint(EDG.gold));
  });

  it("falls back to steel for an unknown type", () => {
    const q = buildingQuad(building({ type: "mystery", x: 0, y: 0, w: 1, h: 1 }));
    expect(q.tintRgba).toBe(packTint(EDG.steel));
  });
});

describe("villagerQuad / raiderQuad / ghostQuad", () => {
  it("colors a villager by FSM state and centers a small quad", () => {
    const v: VillagerSnapshot = { id: 1, x: 4, y: 6, fsm: "work", carryGood: null };
    const q = villagerQuad(v);
    expect(q.tintRgba).toBe(packTint(EDG.orange));
    const size = TILE_SIZE * 0.7;
    expect(q.width).toBe(size);
    // Centered on the tile center.
    expect(q.x).toBeCloseTo(4 * TILE_SIZE + TILE_SIZE / 2 - size / 2);
  });

  it("grows the raider footprint with strength and is always red", () => {
    const weak: RaiderSnapshot = { id: 1, x: 0, y: 0, strength: 6 };
    const strong: RaiderSnapshot = { id: 2, x: 0, y: 0, strength: 60 };
    expect(weak.strength).toBeLessThan(strong.strength);
    expect(raiderQuad(weak).width).toBeLessThan(raiderQuad(strong).width);
    expect(raiderQuad(strong).tintRgba).toBe(packTint(EDG.red));
  });

  it("tints the ghost green when valid, red when invalid, both translucent", () => {
    const valid = ghostQuad(2, 2, 2, 2, true);
    const invalid = ghostQuad(2, 2, 2, 2, false);
    expect(valid.tintRgba & 0xff).toBeLessThan(0xff); // translucent
    expect(valid.tintRgba >>> 8).toBe(packTint(EDG.green) >>> 8);
    expect(invalid.tintRgba >>> 8).toBe(packTint(EDG.red) >>> 8);
    expect(valid.width).toBe(2 * TILE_SIZE);
  });
});

describe("TERRAIN_COLORS", () => {
  it("covers every TerrainType with an EDG palette color", () => {
    const allTypes: TerrainType[] = [
      TerrainType.Grass,
      TerrainType.Water,
      TerrainType.Forest,
      TerrainType.Stone,
      TerrainType.Rough,
    ];
    for (const t of allTypes) {
      expect(TERRAIN_COLORS[t]).toBeDefined();
      // Must be a real hex string (route through EDG) — rgbOf parses it.
      expect(() => rgbOf(TERRAIN_COLORS[t])).not.toThrow();
    }
  });
});

describe("BUILDING_COLORS", () => {
  it("uses only valid hex colors", () => {
    for (const hex of Object.values(BUILDING_COLORS)) {
      expect(() => rgbOf(hex)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Camera2D screen→tile transform (the placement-state math). Forward transform
// (world→screen device px), mirroring webgpu/renderer.ts endFrame:
//   sx = canvasW / worldUnitsX; left = centerX - worldUnitsX/2
//   screen = world * sx - left * sx
// We assert screenToTile inverts it: a tile center round-trips to that tile.
// ---------------------------------------------------------------------------
describe("screenToWorld / screenToTile (placement transform)", () => {
  function worldToScreen(t: CameraTransform, worldX: number, worldY: number): { sx: number; sy: number } {
    const scaleX = t.canvasW / t.worldUnitsX;
    const scaleY = t.canvasH / t.worldUnitsY;
    const left = t.centerX - t.worldUnitsX / 2;
    const top = t.centerY - t.worldUnitsY / 2;
    return { sx: (worldX - left) * scaleX, sy: (worldY - top) * scaleY };
  }

  // A concrete camera state: world centered, units cover the whole world, a
  // 800x800 device-px canvas (square, matches the square world so no stretch).
  const transform: CameraTransform = {
    centerX: WORLD_PX_W / 2,
    centerY: WORLD_PX_H / 2,
    worldUnitsX: WORLD_PX_W,
    worldUnitsY: WORLD_PX_H,
    canvasW: 800,
    canvasH: 800,
  };

  it("inverts world→screen exactly (screenToWorld is the inverse)", () => {
    const worldX = 12.5 * TILE_SIZE;
    const worldY = 47.5 * TILE_SIZE;
    const { sx, sy } = worldToScreen(transform, worldX, worldY);
    const back = screenToWorld(transform, sx, sy);
    expect(back.worldX).toBeCloseTo(worldX, 6);
    expect(back.worldY).toBeCloseTo(worldY, 6);
  });

  it("round-trips a tile center back to its tile", () => {
    for (const [tileX, tileY] of [[0, 0], [12, 47], [95, 95], [48, 48]] as const) {
      const centerWorldX = (tileX + 0.5) * TILE_SIZE;
      const centerWorldY = (tileY + 0.5) * TILE_SIZE;
      const { sx, sy } = worldToScreen(transform, centerWorldX, centerWorldY);
      const { tx, ty } = screenToTile(transform, sx, sy);
      expect([tx, ty]).toEqual([tileX, tileY]);
    }
  });

  it("respects pan: shifting centerX shifts which tile a fixed screen point hits", () => {
    const mid = { sx: 400, sy: 400 };
    const atCenter = screenToTile(transform, mid.sx, mid.sy);
    const panned: CameraTransform = { ...transform, centerX: transform.centerX + 10 * TILE_SIZE };
    const afterPan = screenToTile(panned, mid.sx, mid.sy);
    // Panning the camera +10 tiles right means the screen-center now sits 10
    // tiles further right in the world.
    expect(afterPan.tx).toBe(atCenter.tx + 10);
    expect(afterPan.ty).toBe(atCenter.ty);
  });

  it("respects zoom: a zoomed-in view maps the same screen span to fewer tiles", () => {
    const zoomed: CameraTransform = { ...transform, worldUnitsX: WORLD_PX_W / 2, worldUnitsY: WORLD_PX_H / 2 };
    const a = screenToWorld(transform, 0, 0);
    const b = screenToWorld(zoomed, 0, 0);
    // Zoomed-in: top-left screen corner is closer to center (fewer world units
    // span the same canvas), so its world coord is larger (less negative-left).
    expect(b.worldX).toBeGreaterThan(a.worldX);
  });

  it("world dimensions are the expected 96x96 tiles", () => {
    expect(WORLD_PX_W).toBe(WORLD_WIDTH * TILE_SIZE);
    expect(WORLD_PX_H).toBe(WORLD_HEIGHT * TILE_SIZE);
  });
});

// ---------------------------------------------------------------------------
// Brief 11 — adjacency autotiling
// ---------------------------------------------------------------------------

describe("neighbourMask", () => {
  it("isolated tile has mask 0 (no neighbours)", () => {
    const set = new Set<number>([tileKey(5, 5)]);
    expect(neighbourMask(5, 5, set)).toBe(0);
  });

  it("vertical straight sets N|S", () => {
    const set = new Set<number>([tileKey(5, 4), tileKey(5, 5), tileKey(5, 6)]);
    expect(neighbourMask(5, 5, set)).toBe(DIR_N | DIR_S);
  });

  it("L-corner (member above + to the right) sets N|E", () => {
    const set = new Set<number>([tileKey(5, 5), tileKey(5, 4), tileKey(6, 5)]);
    expect(neighbourMask(5, 5, set)).toBe(DIR_N | DIR_E);
  });

  it("T-junction (W,E,S) sets W|E|S", () => {
    const set = new Set<number>([tileKey(5, 5), tileKey(4, 5), tileKey(6, 5), tileKey(5, 6)]);
    expect(neighbourMask(5, 5, set)).toBe(DIR_W | DIR_E | DIR_S);
  });

  it("cross (all four) sets N|E|S|W", () => {
    const set = new Set<number>([
      tileKey(5, 5), tileKey(5, 4), tileKey(5, 6), tileKey(4, 5), tileKey(6, 5),
    ]);
    expect(neighbourMask(5, 5, set)).toBe(DIR_N | DIR_E | DIR_S | DIR_W);
  });
});

/** Does the quad set contain a quad strictly above the tile's vertical center? */
function hasArm(quads: QuadSpec[], tileX: number, tileY: number, dir: number): boolean {
  const px = tileX * TILE_SIZE;
  const py = tileY * TILE_SIZE;
  const cx = px + TILE_SIZE / 2;
  const cy = py + TILE_SIZE / 2;
  return quads.some((q) => {
    const qcx = q.x + q.width / 2;
    const qcy = q.y + q.height / 2;
    // Only consider quads whose center lies within the queried tile.
    if (qcx < px || qcx >= px + TILE_SIZE || qcy < py || qcy >= py + TILE_SIZE) return false;
    switch (dir) {
      case DIR_N: return qcy < cy - 0.01 && Math.abs(qcx - cx) < 0.01;
      case DIR_S: return qcy > cy + 0.01 && Math.abs(qcx - cx) < 0.01;
      case DIR_W: return qcx < cx - 0.01 && Math.abs(qcy - cy) < 0.01;
      case DIR_E: return qcx > cx + 0.01 && Math.abs(qcy - cy) < 0.01;
      default: return false;
    }
  });
}

describe("autotileQuads", () => {
  it("isolated tile (mask 0) emits only a centered block, no arms", () => {
    const q = autotileQuads(3, 3, 0, EDG.navy, 0.5);
    expect(q).toHaveLength(1);
    // The single quad is centered in the tile.
    const c = q[0]!;
    expect(c.x + c.width / 2).toBeCloseTo(3 * TILE_SIZE + TILE_SIZE / 2);
    expect(c.y + c.height / 2).toBeCloseTo(3 * TILE_SIZE + TILE_SIZE / 2);
  });

  it("vertical straight (N|S) emits center + N arm + S arm, no E/W", () => {
    const q = autotileQuads(3, 3, DIR_N | DIR_S, EDG.navy, 0.5);
    expect(q).toHaveLength(3); // center + 2 arms
    expect(hasArm(q, 3, 3, DIR_N)).toBe(true);
    expect(hasArm(q, 3, 3, DIR_S)).toBe(true);
    expect(hasArm(q, 3, 3, DIR_E)).toBe(false);
    expect(hasArm(q, 3, 3, DIR_W)).toBe(false);
  });

  it("L-corner (N|E) emits center + N arm + E arm only", () => {
    const q = autotileQuads(3, 3, DIR_N | DIR_E, EDG.navy, 0.5);
    expect(q).toHaveLength(3);
    expect(hasArm(q, 3, 3, DIR_N)).toBe(true);
    expect(hasArm(q, 3, 3, DIR_E)).toBe(true);
    expect(hasArm(q, 3, 3, DIR_S)).toBe(false);
    expect(hasArm(q, 3, 3, DIR_W)).toBe(false);
  });

  it("T-junction (W|E|S) emits center + 3 arms, no N", () => {
    const q = autotileQuads(3, 3, DIR_W | DIR_E | DIR_S, EDG.navy, 0.5);
    expect(q).toHaveLength(4);
    expect(hasArm(q, 3, 3, DIR_W)).toBe(true);
    expect(hasArm(q, 3, 3, DIR_E)).toBe(true);
    expect(hasArm(q, 3, 3, DIR_S)).toBe(true);
    expect(hasArm(q, 3, 3, DIR_N)).toBe(false);
  });

  it("cross (all) emits center + 4 arms", () => {
    const q = autotileQuads(3, 3, DIR_N | DIR_E | DIR_S | DIR_W, EDG.navy, 0.5);
    expect(q).toHaveLength(5);
    expect(hasArm(q, 3, 3, DIR_N)).toBe(true);
    expect(hasArm(q, 3, 3, DIR_E)).toBe(true);
    expect(hasArm(q, 3, 3, DIR_S)).toBe(true);
    expect(hasArm(q, 3, 3, DIR_W)).toBe(true);
  });

  it("wall band is thicker than road band (center block larger)", () => {
    const road = autotileQuads(0, 0, 0, EDG.navy, 0.5)[0]!;
    const wall = autotileQuads(0, 0, 0, EDG.steel, 0.8)[0]!;
    expect(wall.width).toBeGreaterThan(road.width);
  });
});

describe("networkQuads", () => {
  it("fuses adjacent roads (each non-end tile gets arms toward the other)", () => {
    const buildings: BuildingSnapshot[] = [
      building({ type: "road", x: 2, y: 2, w: 1, h: 1 }),
      building({ type: "road", x: 3, y: 2, w: 1, h: 1 }),
    ];
    const q = networkQuads(buildings);
    // Left road (2,2) connects East; right road (3,2) connects West.
    expect(hasArm(q, 2, 2, DIR_E)).toBe(true);
    expect(hasArm(q, 3, 2, DIR_W)).toBe(true);
  });

  it("a wall run continues THROUGH a gate (gate counts as wall neighbour)", () => {
    // wall(5,5) - gate(5,6) - wall(5,7): the walls should each connect toward the gate.
    const buildings: BuildingSnapshot[] = [
      building({ type: "wall", x: 5, y: 5, w: 1, h: 1 }),
      building({ type: "gate", x: 5, y: 6, w: 1, h: 1 }),
      building({ type: "wall", x: 5, y: 7, w: 1, h: 1 }),
    ];
    const q = networkQuads(buildings);
    // Top wall connects South (toward the gate); bottom wall connects North.
    expect(hasArm(q, 5, 5, DIR_S)).toBe(true);
    expect(hasArm(q, 5, 7, DIR_N)).toBe(true);
    // The gate tile itself emits no wall autotile quads (drawn by buildingQuad).
    const gateBlock = q.filter((qq) => qq.x >= 5 * TILE_SIZE && qq.x < 6 * TILE_SIZE && qq.y >= 6 * TILE_SIZE && qq.y < 7 * TILE_SIZE);
    expect(gateBlock).toHaveLength(0);
  });

  it("roads do NOT connect to walls (independent networks)", () => {
    const buildings: BuildingSnapshot[] = [
      building({ type: "road", x: 2, y: 2, w: 1, h: 1 }),
      building({ type: "wall", x: 3, y: 2, w: 1, h: 1 }),
    ];
    const q = networkQuads(buildings);
    // Road at (2,2) should NOT have an East arm (its E neighbour is a wall).
    expect(hasArm(q, 2, 2, DIR_E)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Brief 13 — sub-tile terrain dither
// ---------------------------------------------------------------------------

const EDG_HEXES = new Set(Object.values(EDG).map((h) => String(h).toLowerCase()));

describe("ditherHash", () => {
  it("is deterministic: same coords+type yield the same hash across calls", () => {
    expect(ditherHash(12, 34, 2)).toBe(ditherHash(12, 34, 2));
  });

  it("diverges for adjacent cells and differing types", () => {
    expect(ditherHash(12, 34, 2)).not.toBe(ditherHash(13, 34, 2));
    expect(ditherHash(12, 34, 2)).not.toBe(ditherHash(12, 35, 2));
    expect(ditherHash(12, 34, 2)).not.toBe(ditherHash(12, 34, 3));
  });

  it("returns an unsigned 32-bit int", () => {
    const h = ditherHash(7, 7, 1);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(h)).toBe(true);
  });
});

describe("ditherClusters", () => {
  const allTypes: TerrainType[] = [
    TerrainType.Grass, TerrainType.Water, TerrainType.Forest, TerrainType.Stone, TerrainType.Rough,
  ];

  it("is deterministic: identical cluster set across calls", () => {
    const a = ditherClusters(8, 8, TerrainType.Grass);
    const b = ditherClusters(8, 8, TerrainType.Grass);
    expect(b).toEqual(a);
  });

  it("emits 1-3 clusters per cell", () => {
    for (const t of allTypes) {
      for (let i = 0; i < 50; i++) {
        const n = ditherClusters(i, i * 2, t).length;
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(3);
      }
    }
  });

  it("every cluster color is a valid EDG swatch, for every terrain type", () => {
    for (const t of allTypes) {
      for (let i = 0; i < 40; i++) {
        for (const c of ditherClusters(i * 3, i, t)) {
          expect(EDG_HEXES.has(c.hex.toLowerCase())).toBe(true);
        }
      }
    }
  });

  it("clusters stay inside the tile bounds", () => {
    for (const t of allTypes) {
      for (let i = 0; i < 30; i++) {
        for (const c of ditherClusters(i, i + 5, t)) {
          expect(c.x).toBeGreaterThanOrEqual(0);
          expect(c.y).toBeGreaterThanOrEqual(0);
          expect(c.x + c.size).toBeLessThanOrEqual(TILE_SIZE);
          expect(c.y + c.size).toBeLessThanOrEqual(TILE_SIZE);
        }
      }
    }
  });
});

describe("DITHER_ACCENTS", () => {
  it("covers every TerrainType with valid EDG dark+light swatches", () => {
    for (const t of [TerrainType.Grass, TerrainType.Water, TerrainType.Forest, TerrainType.Stone, TerrainType.Rough]) {
      const a = ditherAccents(t);
      expect(EDG_HEXES.has(a.dark.toLowerCase())).toBe(true);
      expect(EDG_HEXES.has(a.light.toLowerCase())).toBe(true);
      // dark and light differ.
      expect(a.dark).not.toBe(a.light);
    }
    // Record-level coverage too.
    expect(Object.keys(DITHER_ACCENTS).length).toBe(5);
  });
});
