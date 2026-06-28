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
  raiderTier,
  ghostQuad,
  TERRAIN_COLORS,
  BUILDING_COLORS,
  screenToWorld,
  screenToTile,
  WORLD_PX_W,
  WORLD_PX_H,
  tileCenterToIso,
  ISO_TILE_W,
  ISO_WORLD_W,
  ISO_WORLD_H,
  type CameraTransform,
  autotileQuads,
  neighbourMask,
  networkQuads,
  isoNetworkTiles,
  tileKey,
  DIR_N,
  DIR_E,
  DIR_S,
  DIR_W,
  buildingShadowQuad,
  SHADOW_OFFSET,
  SHADOW_ALPHA,
  ditherHash,
  ditherClusters,
  ditherAccents,
  DITHER_ACCENTS,
  elevationField,
  elevationFill,
  ELEVATION_SCALE,
  type QuadSpec,
  wearFactor,
  wearOverlayQuads,
  clusterBuildings,
  clusterBorderQuads,
} from "./citadel-renderer";
import { FRAME_ROAD, FRAME_BRIDGE } from "./sprites/recipes";

function building(partial: Partial<BuildingSnapshot> & Pick<BuildingSnapshot, "type" | "x" | "y" | "w" | "h">): BuildingSnapshot {
  return {
    connected: true,
    outputBuffer: 0,
    workerCount: 0,
    occupancy: 0,
    ownerId: 0,
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
  it("maps a house to its sprite frame at full footprint (white tint = recipe colors show)", () => {
    const q = buildingQuad(building({ type: "house", x: 3, y: 4, w: 2, h: 2 }));
    expect(q.frame).toBe("bld/house");
    expect(q.tintRgba).toBe(packTint(EDG.white));
    expect(q).toMatchObject({ x: 3 * TILE_SIZE, y: 4 * TILE_SIZE, width: 2 * TILE_SIZE, height: 2 * TILE_SIZE });
  });

  it("maps a keep + a 3x2 storehouse to their sprite frames and footprints", () => {
    const keep = buildingQuad(building({ type: "keep", x: 0, y: 0, w: 3, h: 3 }));
    expect(keep.frame).toBe("bld/keep");
    expect(keep.tintRgba).toBe(packTint(EDG.white));
    expect(keep.width).toBe(3 * TILE_SIZE);
    const store = buildingQuad(building({ type: "storehouse", x: 1, y: 1, w: 3, h: 2 }));
    expect(store.frame).toBe("bld/storehouse");
    expect(store.width).toBe(3 * TILE_SIZE);
  });

  it("multiplies a burning building's sprite toward orange (keeps the frame)", () => {
    const q = buildingQuad(building({ type: "house", x: 0, y: 0, w: 2, h: 2, burning: true }));
    expect(q.frame).toBe("bld/house");
    expect(q.tintRgba).toBe(packTint(EDG.orange));
  });

  it("draws a road as a centered inset band on the px frame", () => {
    const q = buildingQuad(building({ type: "road", x: 5, y: 5, w: 1, h: 1 }));
    const inset = TILE_SIZE * 0.25;
    expect(q.x).toBe(5 * TILE_SIZE + inset);
    expect(q.width).toBe(TILE_SIZE - inset * 2);
    expect(q.tintRgba).toBe(packTint(EDG.navy));
    expect(q.frame).toBeUndefined(); // tinted box → default px frame
  });

  it("draws a gate slightly inset in gold on the px frame", () => {
    const q = buildingQuad(building({ type: "gate", x: 2, y: 2, w: 1, h: 1 }));
    const inset = TILE_SIZE * 0.15;
    expect(q.x).toBe(2 * TILE_SIZE + inset);
    expect(q.tintRgba).toBe(packTint(EDG.gold));
    expect(q.frame).toBeUndefined();
  });

  it("falls back to a steel box (no frame) for a type without a recipe", () => {
    const q = buildingQuad(building({ type: "mystery", x: 0, y: 0, w: 1, h: 1 }));
    expect(q.tintRgba).toBe(packTint(EDG.steel));
    expect(q.frame).toBeUndefined();
  });
});

describe("buildingShadowQuad (directional NW-sun ground shadow)", () => {
  it("offsets a soft ink shadow to the SE of a rising building's footprint", () => {
    const s = buildingShadowQuad(building({ type: "house", x: 3, y: 4, w: 2, h: 2 }));
    expect(s).not.toBeNull();
    expect(s!.x).toBe(3 * TILE_SIZE + SHADOW_OFFSET);
    expect(s!.y).toBe(4 * TILE_SIZE + SHADOW_OFFSET);
    expect(s!.width).toBe(2 * TILE_SIZE);
    expect(s!.tintRgba).toBe(packTint(EDG.ink, SHADOW_ALPHA));
  });

  it("casts no shadow for flat ground features (road, wall, gate)", () => {
    for (const type of ["road", "wall", "gate"]) {
      expect(buildingShadowQuad(building({ type, x: 0, y: 0, w: 1, h: 1 }))).toBeNull();
    }
  });
});

describe("villagerQuad / raiderQuad / ghostQuad", () => {
  it("colors a villager by FSM state and centers a small quad", () => {
    const v: VillagerSnapshot = { id: 1, x: 4, y: 6, fsm: "work", carryGood: null };
    const q = villagerQuad(v);
    expect(q.tintRgba).toBe(packTint(EDG.orange)); // FSM-state tint over the figure
    expect(q.frame).toBe("vil/person");
    const size = TILE_SIZE * 1.1; // sized up for the 32×32 iso figure
    expect(q.width).toBe(size);
    // Centered on the tile center.
    expect(q.x).toBeCloseTo(4 * TILE_SIZE + TILE_SIZE / 2 - size / 2);
  });

  it("grows the raider footprint with strength and shapes it by tier", () => {
    const weak: RaiderSnapshot = { id: 1, x: 0, y: 0, strength: 6 };
    const strong: RaiderSnapshot = { id: 2, x: 0, y: 0, strength: 60 };
    expect(weak.strength).toBeLessThan(strong.strength);
    // Bigger raid → bigger footprint (size still scales with strength).
    expect(raiderQuad(weak).width).toBeLessThan(raiderQuad(strong).width);
    expect(raiderQuad(strong).frame).toBe("raider");
    // Silhouette legibility: a weak raider is narrow red; an elite (≥50) reads as
    // a taller crimson champion — shape + tint communicate the tier, not just size.
    expect(raiderQuad(weak).tintRgba).toBe(packTint(EDG.red));
    expect(raiderQuad(strong).tintRgba).toBe(packTint(EDG.crimson)); // elite
    // Elite is taller-than-it-is-wide; a mid "strong" raider is broader than tall.
    const elite = raiderQuad(strong);
    expect(elite.height).toBeGreaterThan(elite.width);
    const broad = raiderQuad({ id: 3, x: 0, y: 0, strength: 35 }); // "strong" tier
    expect(broad.width).toBeGreaterThan(broad.height);
  });

  it("classifies raider strength into legible tiers", () => {
    expect(raiderTier(5)).toBe("weak");
    expect(raiderTier(20)).toBe("normal");
    expect(raiderTier(35)).toBe("strong");
    expect(raiderTier(60)).toBe("elite");
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

  it("round-trips an ISO tile center back to its tile (the placement pick path)", () => {
    for (const [tileX, tileY] of [[0, 0], [12, 47], [95, 95], [48, 48]] as const) {
      const c = tileCenterToIso(tileX, tileY); // iso world-px of the diamond centre
      const { sx, sy } = worldToScreen(transform, c.x, c.y);
      const { tx, ty } = screenToTile(transform, sx, sy);
      expect([tx, ty]).toEqual([tileX, tileY]);
    }
  });

  it("respects pan: panning the iso camera shifts which tile a fixed screen point hits", () => {
    const mid = { sx: 400, sy: 400 };
    const atCenter = screenToTile(transform, mid.sx, mid.sy);
    // Pan the camera by one tile's worth of +X iso world-px (= one diamond step
    // along the tileX-minus-tileY axis): the picked tile must change.
    const panned: CameraTransform = { ...transform, centerX: transform.centerX + ISO_TILE_W };
    const afterPan = screenToTile(panned, mid.sx, mid.sy);
    expect([afterPan.tx, afterPan.ty]).not.toEqual([atCenter.tx, atCenter.ty]);
  });

  it("respects zoom: a zoomed-in view maps the same screen span to fewer tiles", () => {
    const zoomed: CameraTransform = { ...transform, worldUnitsX: WORLD_PX_W / 2, worldUnitsY: WORLD_PX_H / 2 };
    const a = screenToWorld(transform, 0, 0);
    const b = screenToWorld(zoomed, 0, 0);
    // Zoomed-in: top-left screen corner is closer to center (fewer world units
    // span the same canvas), so its world coord is larger (less negative-left).
    expect(b.worldX).toBeGreaterThan(a.worldX);
  });

  it("world dimensions are the iso world extents", () => {
    expect(WORLD_PX_W).toBe(ISO_WORLD_W);
    expect(WORLD_PX_H).toBe(ISO_WORLD_H);
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

describe("isoNetworkTiles (iso diamond road/wall tiles)", () => {
  it("emits one tile per road/wall cell with the right band; gates excluded", () => {
    const buildings: BuildingSnapshot[] = [
      building({ type: "road", x: 2, y: 2, w: 2, h: 1 }), // 2 road cells
      building({ type: "wall", x: 5, y: 5, w: 1, h: 1 }), // 1 wall cell
      building({ type: "gate", x: 5, y: 6, w: 1, h: 1 }), // excluded (drawn by buildingQuad)
      building({ type: "house", x: 9, y: 9, w: 1, h: 1 }), // not a network type
    ];
    const tiles = isoNetworkTiles(buildings);
    expect(tiles).toHaveLength(3); // 2 road + 1 wall
    const roads = tiles.filter((t) => t.band < 0.7);
    const walls = tiles.filter((t) => t.band >= 0.7);
    expect(roads).toHaveLength(2);
    expect(walls).toHaveLength(1);
    // No gate/house tiles leak in.
    expect(tiles.some((t) => t.tx === 5 && t.ty === 6)).toBe(false);
    expect(tiles.some((t) => t.tx === 9 && t.ty === 9)).toBe(false);
  });

  it("emits bridge tiles and stamps the textured road/bridge frames when given", () => {
    const buildings: BuildingSnapshot[] = [
      building({ type: "road", x: 1, y: 1, w: 1, h: 1 }),
      building({ type: "bridge", x: 2, y: 1, w: 1, h: 1 }),
      building({ type: "wall", x: 3, y: 1, w: 1, h: 1 }),
    ];
    const tiles = isoNetworkTiles(buildings, { road: FRAME_ROAD, bridge: FRAME_BRIDGE });
    const road = tiles.find((t) => t.type === "road");
    const bridge = tiles.find((t) => t.type === "bridge");
    const wall = tiles.find((t) => t.type === "wall");
    // Road + bridge carry their textured frames and fill the whole tile (band 1).
    expect(road?.frame).toBe(FRAME_ROAD);
    expect(road?.band).toBe(1);
    expect(bridge?.frame).toBe(FRAME_BRIDGE);
    expect(bridge?.band).toBe(1);
    // Walls stay solid-tinted (no frame), banded.
    expect(wall?.frame).toBeUndefined();
    expect(wall?.band).toBeGreaterThan(0.7);
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

describe("elevationFill (elevation-banded base diamond fill)", () => {
  const allTypes: TerrainType[] = [
    TerrainType.Grass, TerrainType.Water, TerrainType.Forest, TerrainType.Stone, TerrainType.Rough,
  ];

  it("is deterministic and always an EDG swatch", () => {
    for (const t of allTypes) {
      for (let i = 0; i < 60; i++) {
        const a = elevationFill(t, i, i * 2);
        expect(elevationFill(t, i, i * 2)).toBe(a); // deterministic
        expect(EDG_HEXES.has(a.toLowerCase())).toBe(true); // on-palette
      }
    }
  });

  it("bands grass by elevation: valleys dark, highs light, middle base", () => {
    // Sweep a grid; assert all three bands appear (dark/base/light) for grass.
    const seen = new Set<string>();
    for (let ty = 0; ty < 40; ty++) for (let tx = 0; tx < 40; tx++) {
      seen.add(elevationFill(TerrainType.Grass, tx, ty));
    }
    expect(seen.has(DITHER_ACCENTS[TerrainType.Grass].dark)).toBe(true);
    expect(seen.has(DITHER_ACCENTS[TerrainType.Grass].light)).toBe(true);
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it("leaves water unbanded (its own shimmer handles it)", () => {
    for (let i = 0; i < 30; i++) {
      expect(elevationFill(TerrainType.Water, i, i)).toBe(TERRAIN_COLORS[TerrainType.Water]);
    }
  });
});

describe("elevationField (relief, ported from tiny-world-builder strata)", () => {
  it("is deterministic and stays in [0,1]", () => {
    for (let i = 0; i < 60; i++) {
      const a = elevationField(i, i * 2);
      const b = elevationField(i, i * 2);
      expect(b).toBe(a);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });

  it("varies smoothly: adjacent cells differ less than far-apart cells (on average)", () => {
    let adjacentDelta = 0;
    let farDelta = 0;
    for (let i = 0; i < 40; i++) {
      adjacentDelta += Math.abs(elevationField(i, 5) - elevationField(i + 1, 5));
      farDelta += Math.abs(elevationField(i, 5) - elevationField(i + ELEVATION_SCALE, 5));
    }
    expect(adjacentDelta).toBeLessThan(farDelta);
  });

  it("biases the dither light/dark mix by elevation: highs skew lighter than valleys", () => {
    // Find a clearly-high and a clearly-low cell, then compare light-speck share.
    const lightShare = (tx: number, ty: number): number => {
      const cs = ditherClusters(tx, ty, TerrainType.Grass);
      const lightHex = ditherAccents(TerrainType.Grass).light;
      return cs.filter((c) => c.hex === lightHex).length / cs.length;
    };
    let highShare = 0;
    let lowShare = 0;
    let n = 0;
    for (let tx = 0; tx < 60; tx++) {
      for (let ty = 0; ty < 4; ty++) {
        const e = elevationField(tx, ty);
        if (e > 0.7) { highShare += lightShare(tx, ty); n++; }
      }
    }
    let m = 0;
    for (let tx = 0; tx < 60; tx++) {
      for (let ty = 0; ty < 4; ty++) {
        const e = elevationField(tx, ty);
        if (e < 0.3) { lowShare += lightShare(tx, ty); m++; }
      }
    }
    // Sanity: we sampled both bands, and high ground is on-average lighter.
    expect(n).toBeGreaterThan(0);
    expect(m).toBeGreaterThan(0);
    expect(highShare / n).toBeGreaterThan(lowShare / m);
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

// Set of packed-RGB (top 24 bits) for every EDG color — lets us assert a quad's
// tint resolves to an EDG hue regardless of its alpha byte.
const EDG_RGB24 = new Set(
  Object.values(EDG).map((h) => {
    const [r, g, b] = rgbOf(String(h));
    return ((r << 16) | (g << 8) | b) >>> 0;
  }),
);
function rgb24Of(tint: number): number {
  return (tint >>> 8) >>> 0;
}
function alphaOf(tint: number): number {
  return tint & 0xff;
}

describe("wearFactor (brief 24)", () => {
  it("is 0 for a healthy building", () => {
    expect(wearFactor(building({ type: "house", x: 0, y: 0, w: 1, h: 1 }))).toBe(0);
  });

  it("gives a baseline scorch for onFire (ignited, not yet burning)", () => {
    const f = wearFactor(building({ type: "house", x: 0, y: 0, w: 1, h: 1, onFire: true }));
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(0.4);
  });

  it("floors burning at 0.4 and ramps toward 1 with the render clock", () => {
    const b = building({ type: "house", x: 0, y: 0, w: 1, h: 1, burning: true });
    expect(wearFactor(b, 0)).toBeCloseTo(0.4, 5);
    expect(wearFactor(b, 4000)).toBeCloseTo(1, 5);
    // Monotonic in clock; clamped at 1.
    expect(wearFactor(b, 2000)).toBeGreaterThan(wearFactor(b, 0));
    expect(wearFactor(b, 999999)).toBeCloseTo(1, 5);
  });
});

describe("wearOverlayQuads (brief 24)", () => {
  it("emits no quads for a healthy building (factor 0)", () => {
    const b = building({ type: "house", x: 2, y: 3, w: 1, h: 1 });
    expect(wearOverlayQuads(b, 0)).toEqual([]);
    expect(wearOverlayQuads(b, wearFactor(b))).toEqual([]);
  });

  it("emits a soot fill for a burning building", () => {
    const b = building({ type: "house", x: 2, y: 3, w: 2, h: 2, burning: true });
    const quads = wearOverlayQuads(b, wearFactor(b, 4000));
    expect(quads.length).toBeGreaterThanOrEqual(1);
    // First quad is the full-footprint soot wash, translucent.
    const soot = quads[0]!;
    expect(soot.x).toBe(2 * TILE_SIZE);
    expect(soot.y).toBe(3 * TILE_SIZE);
    expect(soot.width).toBe(2 * TILE_SIZE);
    expect(soot.height).toBe(2 * TILE_SIZE);
    expect(alphaOf(soot.tintRgba)).toBeGreaterThan(0);
    expect(alphaOf(soot.tintRgba)).toBeLessThan(0xff);
  });

  it("adds cracked-edge accents only past a moderate factor", () => {
    const b = building({ type: "house", x: 0, y: 0, w: 1, h: 1, burning: true });
    const low = wearOverlayQuads(b, 0.3); // below crack threshold
    const high = wearOverlayQuads(b, 0.9); // above
    expect(low.length).toBe(1); // soot only
    expect(high.length).toBeGreaterThan(1); // soot + cracks
  });

  it("uses only EDG colors", () => {
    const b = building({ type: "house", x: 0, y: 0, w: 1, h: 1, burning: true });
    for (const q of wearOverlayQuads(b, 1)) {
      expect(EDG_RGB24.has(rgb24Of(q.tintRgba))).toBe(true);
    }
  });
});

describe("clusterBuildings (brief 12)", () => {
  it("groups two orthogonally-adjacent houses into one cluster", () => {
    const houses = [
      building({ type: "house", x: 0, y: 0, w: 1, h: 1 }),
      building({ type: "house", x: 1, y: 0, w: 1, h: 1 }), // east neighbour
    ];
    const clusters = clusterBuildings(houses, "house");
    expect(clusters.length).toBe(1);
    expect(clusters[0]!.members.length).toBe(2);
    expect(clusters[0]!.tiles.size).toBe(2);
  });

  it("leaves diagonally-touching (non-orthogonal) houses as separate clusters", () => {
    const houses = [
      building({ type: "house", x: 0, y: 0, w: 1, h: 1 }),
      building({ type: "house", x: 1, y: 1, w: 1, h: 1 }), // only corner-touching
    ];
    const clusters = clusterBuildings(houses, "house");
    expect(clusters.length).toBe(2);
  });

  it("keeps isolated houses as singleton clusters", () => {
    const houses = [
      building({ type: "house", x: 0, y: 0, w: 1, h: 1 }),
      building({ type: "house", x: 5, y: 5, w: 1, h: 1 }),
      building({ type: "house", x: 5, y: 6, w: 1, h: 1 }), // adjacent to the 2nd
    ];
    const clusters = clusterBuildings(houses, "house");
    // {h0} alone, {h1,h2} together → 2 components.
    expect(clusters.length).toBe(2);
    const sizes = clusters.map((c) => c.members.length).sort();
    expect(sizes).toEqual([1, 2]);
  });

  it("ignores non-house building types entirely", () => {
    const buildings = [
      building({ type: "house", x: 0, y: 0, w: 1, h: 1 }),
      building({ type: "farm", x: 1, y: 0, w: 1, h: 1 }), // adjacent but wrong type
      building({ type: "mill", x: 0, y: 1, w: 1, h: 1 }),
    ];
    const clusters = clusterBuildings(buildings, "house");
    expect(clusters.length).toBe(1);
    expect(clusters[0]!.members.length).toBe(1);
  });

  it("merges an L-shaped run of three adjacent houses into one cluster", () => {
    const houses = [
      building({ type: "house", x: 2, y: 2, w: 1, h: 1 }),
      building({ type: "house", x: 3, y: 2, w: 1, h: 1 }),
      building({ type: "house", x: 3, y: 3, w: 1, h: 1 }),
    ];
    const clusters = clusterBuildings(houses, "house");
    expect(clusters.length).toBe(1);
    expect(clusters[0]!.members.length).toBe(3);
    // Bounding region spans x:[2,4) y:[2,4).
    expect(clusters[0]!.minTx).toBe(2);
    expect(clusters[0]!.minTy).toBe(2);
    expect(clusters[0]!.maxTx).toBe(4);
    expect(clusters[0]!.maxTy).toBe(4);
  });
});

describe("clusterBorderQuads (brief 12)", () => {
  it("returns no border for a singleton (each house draws as its own sprite)", () => {
    const houses = [building({ type: "house", x: 1, y: 1, w: 1, h: 1 })];
    const [cluster] = clusterBuildings(houses, "house");
    expect(clusterBorderQuads(cluster!)).toEqual([]);
  });

  it("draws a multi-member cluster's unifying border as four frame quads", () => {
    const houses = [
      building({ type: "house", x: 0, y: 0, w: 1, h: 1 }),
      building({ type: "house", x: 1, y: 0, w: 1, h: 1 }),
    ];
    const [cluster] = clusterBuildings(houses, "house");
    const quads = clusterBorderQuads(cluster!);
    // top + bottom + left + right border bands, no union fill.
    expect(quads.length).toBe(4);
    // All tinted boxes → default px frame (no sprite frame set).
    for (const q of quads) expect(q.frame).toBeUndefined();
  });

  it("uses only EDG colors", () => {
    const houses = [
      building({ type: "house", x: 0, y: 0, w: 1, h: 1 }),
      building({ type: "house", x: 1, y: 0, w: 1, h: 1 }),
    ];
    const [cluster] = clusterBuildings(houses, "house");
    for (const q of clusterBorderQuads(cluster!)) {
      expect(EDG_RGB24.has(rgb24Of(q.tintRgba))).toBe(true);
    }
  });
});
