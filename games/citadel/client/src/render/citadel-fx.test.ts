/**
 * Pure-function tests for the citadel render-side juice (briefs 17 + 19).
 *
 * Like citadel-renderer.test.ts these never touch the GPU — they exercise the
 * pure helpers: placement ease curve, idle bob bounds/determinism, the
 * appear-map diff, and the follow-cam nearest-pick + release predicate.
 */
import { describe, it, expect } from "vitest";
import { TILE_SIZE } from "@citadel/sim-core";
import type { BuildingSnapshot, VillagerSnapshot } from "@citadel/sim-core";
import {
  placementScale,
  PLACEMENT_EASE_MS,
  PLACEMENT_MIN_SCALE,
  easeQuad,
  syncAppearMap,
  buildingKey,
  bobOffset,
  BOB_AMPLITUDE_PX,
  gaitOffset,
  WALK_AMPLITUDE_PX,
  nearestVillager,
  followReleaseId,
  villagerById,
  glowAlphaForMood,
  MOOD_GLOW_FULL,
  MOOD_GLOW_NONE,
  MOOD_GLOW_MAX_ALPHA,
  houseAlphaForMood,
  MOOD_DIM_FULL,
  MOOD_DIM_NONE,
  MOOD_DIM_MAX,
  houseEmitsHearthSmoke,
  MOOD_HEARTH_SMOKE,
  villagerAlphaForMood,
  VILLAGER_MOOD_DIM_MAX,
  villagerSlumpOffset,
  VILLAGER_SLUMP_PX,
} from "./citadel-fx";
import { buildingQuad } from "./citadel-renderer";

function building(over: Partial<BuildingSnapshot> & Pick<BuildingSnapshot, "type" | "x" | "y">): BuildingSnapshot {
  return {
    w: 1, h: 1, connected: true, outputBuffer: 0, workerCount: 0, occupancy: 0, ownerId: 0,
    onFire: false, burning: false, level: 1,
    lacksFaith: true, lacksSafety: true, lacksGoods: true, mood: 40, ...over,
  };
}

function villager(over: Partial<VillagerSnapshot> & Pick<VillagerSnapshot, "id" | "x" | "y">): VillagerSnapshot {
  return { fsm: "idle", carryGood: null, job: "idle", mood: 40, ...over };
}

// ---------------------------------------------------------------------------
// Placement ease-in
// ---------------------------------------------------------------------------

describe("placementScale", () => {
  it("at 0ms is small + transparent", () => {
    const fx = placementScale(0);
    expect(fx.scale).toBeCloseTo(PLACEMENT_MIN_SCALE, 5);
    expect(fx.alpha).toBeCloseTo(0, 5);
  });

  it("clamps negative ages to the start of the curve", () => {
    expect(placementScale(-50)).toEqual(placementScale(0));
  });

  it("at the end (>=200ms) is fully settled: scale 1, alpha 1", () => {
    expect(placementScale(PLACEMENT_EASE_MS)).toEqual({ scale: 1, alpha: 1 });
    expect(placementScale(PLACEMENT_EASE_MS + 1000)).toEqual({ scale: 1, alpha: 1 });
  });

  it("is monotonic + bounded through the tween", () => {
    let prevScale = -1;
    let prevAlpha = -1;
    for (let ms = 0; ms <= PLACEMENT_EASE_MS; ms += 10) {
      const { scale, alpha } = placementScale(ms);
      expect(scale).toBeGreaterThanOrEqual(PLACEMENT_MIN_SCALE - 1e-9);
      expect(scale).toBeLessThanOrEqual(1 + 1e-9);
      expect(alpha).toBeGreaterThanOrEqual(0 - 1e-9);
      expect(alpha).toBeLessThanOrEqual(1 + 1e-9);
      expect(scale).toBeGreaterThanOrEqual(prevScale - 1e-9);
      expect(alpha).toBeGreaterThanOrEqual(prevAlpha - 1e-9);
      prevScale = scale;
      prevAlpha = alpha;
    }
  });

  it("easeQuad scales about the footprint centre (centre is preserved)", () => {
    const b = building({ type: "bakery", x: 3, y: 4, w: 2, h: 2 });
    const base = buildingQuad(b);
    const baseCx = base.x + base.width / 2;
    const baseCy = base.y + base.height / 2;
    const eased = easeQuad(base, placementScale(0));
    expect(eased.width).toBeCloseTo(base.width * PLACEMENT_MIN_SCALE, 5);
    expect(eased.x + eased.width / 2).toBeCloseTo(baseCx, 5);
    expect(eased.y + eased.height / 2).toBeCloseTo(baseCy, 5);
  });
});

// ---------------------------------------------------------------------------
// Appear map diff
// ---------------------------------------------------------------------------

describe("syncAppearMap", () => {
  it("records first-seen ms for new buildings only", () => {
    const map = new Map<string, number>();
    const a = building({ type: "house", x: 1, y: 1 });
    syncAppearMap(map, [a], 100);
    expect(map.get(buildingKey(a))).toBe(100);
    // Re-seen at a later time keeps the original timestamp.
    syncAppearMap(map, [a], 500);
    expect(map.get(buildingKey(a))).toBe(100);
  });

  it("drops keys for demolished buildings (so rebuild re-triggers)", () => {
    const map = new Map<string, number>();
    const a = building({ type: "house", x: 1, y: 1 });
    syncAppearMap(map, [a], 100);
    syncAppearMap(map, [], 200);
    expect(map.has(buildingKey(a))).toBe(false);
    // Rebuild at the same cell gets a fresh timestamp.
    syncAppearMap(map, [a], 300);
    expect(map.get(buildingKey(a))).toBe(300);
  });

  it("keys distinguish position and type", () => {
    expect(buildingKey({ x: 1, y: 2, type: "farm" })).not.toBe(buildingKey({ x: 1, y: 2, type: "mill" }));
    expect(buildingKey({ x: 1, y: 2, type: "farm" })).not.toBe(buildingKey({ x: 2, y: 2, type: "farm" }));
  });
});

// ---------------------------------------------------------------------------
// Idle bob
// ---------------------------------------------------------------------------

describe("bobOffset", () => {
  it("is deterministic for the same (time,id)", () => {
    expect(bobOffset(1.23, 7)).toBe(bobOffset(1.23, 7));
  });

  it("stays within ±BOB_AMPLITUDE_PX", () => {
    for (let id = 0; id < 50; id++) {
      for (let t = 0; t < 10; t += 0.13) {
        const o = bobOffset(t, id);
        expect(Math.abs(o)).toBeLessThanOrEqual(BOB_AMPLITUDE_PX + 1e-9);
      }
    }
  });

  it("phase differs across ids (not in lockstep)", () => {
    // At t=0 the offset is amp*sin(phase); distinct phases → distinct offsets.
    const a = bobOffset(0, 1);
    const b = bobOffset(0, 2);
    const c = bobOffset(0, 3);
    expect(a === b && b === c).toBe(false);
  });
});

describe("gaitOffset", () => {
  it("falls back to the idle sway when not moving", () => {
    for (let t = 0; t < 5; t += 0.31) {
      expect(gaitOffset(t, 9, false)).toBe(bobOffset(t, 9));
    }
  });

  it("walking is a non-negative hop bounded by WALK_AMPLITUDE_PX", () => {
    let sawPositive = false;
    for (let id = 0; id < 30; id++) {
      for (let t = 0; t < 6; t += 0.07) {
        const o = gaitOffset(t, id, true);
        expect(o).toBeGreaterThanOrEqual(0);                 // never sinks below ground
        expect(o).toBeLessThanOrEqual(WALK_AMPLITUDE_PX + 1e-9);
        if (o > 0.5) sawPositive = true;
      }
    }
    expect(sawPositive).toBe(true); // the hop actually rises
  });

  it("is deterministic for the same (time,id,moving)", () => {
    expect(gaitOffset(2.5, 4, true)).toBe(gaitOffset(2.5, 4, true));
  });
});

// ---------------------------------------------------------------------------
// Follow-cam pure helpers
// ---------------------------------------------------------------------------

describe("nearestVillager", () => {
  const vs = [
    villager({ id: 10, x: 5, y: 5 }),
    villager({ id: 11, x: 8, y: 8 }),
    villager({ id: 12, x: 5.4, y: 5.2 }),
  ];

  it("picks the nearest villager within the radius", () => {
    // Tile (5,5): id 10 is exact (d=0), id 12 is ~0.45 away — 10 wins.
    expect(nearestVillager(vs, 5, 5)).toBe(10);
  });

  it("returns null when nothing is within the radius", () => {
    expect(nearestVillager(vs, 0, 0)).toBeNull();
    expect(nearestVillager(vs, 20, 20)).toBeNull();
  });

  it("respects a wider explicit radius", () => {
    // (8,8) within 1 tile → id 11; from (6.5,6.5) only a wider radius reaches.
    expect(nearestVillager(vs, 6.5, 6.5, 0.5)).toBeNull();
    expect(nearestVillager(vs, 6.5, 6.5, 3)).not.toBeNull();
  });

  it("empty list → null", () => {
    expect(nearestVillager([], 5, 5)).toBeNull();
  });
});

describe("followReleaseId", () => {
  const vs = [villager({ id: 1, x: 0, y: 0 }), villager({ id: 2, x: 1, y: 1 })];

  it("keeps the id while the villager exists", () => {
    expect(followReleaseId(2, vs)).toBe(2);
  });

  it("releases (null) when the followed villager despawned", () => {
    expect(followReleaseId(99, vs)).toBeNull();
  });

  it("null stays null", () => {
    expect(followReleaseId(null, vs)).toBeNull();
  });

  it("villagerById finds or returns null", () => {
    expect(villagerById(vs, 1)?.id).toBe(1);
    expect(villagerById(vs, 99)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// House mood → diegetic cues (Phase A cozy pivot)
// ---------------------------------------------------------------------------

describe("glowAlphaForMood", () => {
  it("a neglected house (low mood) has no warm glow", () => {
    expect(glowAlphaForMood(0)).toBe(0);
    expect(glowAlphaForMood(MOOD_GLOW_NONE)).toBe(0);
    expect(glowAlphaForMood(MOOD_GLOW_NONE - 50)).toBe(0); // clamps negatives
  });

  it("a content house glows at peak warm strength", () => {
    expect(glowAlphaForMood(MOOD_GLOW_FULL)).toBeCloseTo(MOOD_GLOW_MAX_ALPHA, 5);
    expect(glowAlphaForMood(100)).toBeCloseTo(MOOD_GLOW_MAX_ALPHA, 5); // clamps over-range
  });

  it("ramps monotonically between the thresholds", () => {
    let prev = -1;
    for (let m = 0; m <= 100; m += 5) {
      const a = glowAlphaForMood(m);
      expect(a).toBeGreaterThanOrEqual(prev);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(MOOD_GLOW_MAX_ALPHA);
      prev = a;
    }
  });

  it("a mid-mood house glows, but dimmer than a happy one", () => {
    const mid = glowAlphaForMood((MOOD_GLOW_NONE + MOOD_GLOW_FULL) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(glowAlphaForMood(MOOD_GLOW_FULL));
  });
});

describe("houseAlphaForMood", () => {
  it("a content house keeps full brightness", () => {
    expect(houseAlphaForMood(MOOD_DIM_FULL)).toBe(1);
    expect(houseAlphaForMood(100)).toBe(1);
  });

  it("a neglected house reads dimmest (capped dim)", () => {
    expect(houseAlphaForMood(0)).toBeCloseTo(1 - MOOD_DIM_MAX, 5);
    expect(houseAlphaForMood(MOOD_DIM_NONE)).toBeCloseTo(1 - MOOD_DIM_MAX, 5);
  });

  it("a neglected house is always dimmer than a content one, monotonic", () => {
    expect(houseAlphaForMood(0)).toBeLessThan(houseAlphaForMood(MOOD_DIM_FULL));
    let prev = -1;
    for (let m = 0; m <= 100; m += 5) {
      const a = houseAlphaForMood(m);
      expect(a).toBeGreaterThanOrEqual(prev);
      expect(a).toBeLessThanOrEqual(1);
      prev = a;
    }
  });
});

describe("villagerAlphaForMood", () => {
  it("a content villager keeps full brightness", () => {
    expect(villagerAlphaForMood(MOOD_DIM_FULL)).toBe(1);
    expect(villagerAlphaForMood(100)).toBe(1);
  });

  it("a glum villager reads dimmest (capped, gentler than the house dim)", () => {
    expect(villagerAlphaForMood(0)).toBeCloseTo(1 - VILLAGER_MOOD_DIM_MAX, 5);
    expect(villagerAlphaForMood(MOOD_DIM_NONE)).toBeCloseTo(1 - VILLAGER_MOOD_DIM_MAX, 5);
    expect(VILLAGER_MOOD_DIM_MAX).toBeLessThan(MOOD_DIM_MAX);
  });

  it("is monotonic non-decreasing in mood and clamps to [1-MAX, 1]", () => {
    let prev = -1;
    for (let m = -20; m <= 120; m += 5) {
      const a = villagerAlphaForMood(m);
      expect(a).toBeGreaterThanOrEqual(prev);
      expect(a).toBeGreaterThanOrEqual(1 - VILLAGER_MOOD_DIM_MAX);
      expect(a).toBeLessThanOrEqual(1);
      prev = a;
    }
  });
});

describe("villagerSlumpOffset", () => {
  it("a content villager stands upright (no slump)", () => {
    expect(villagerSlumpOffset(MOOD_DIM_FULL)).toBe(0);
    expect(villagerSlumpOffset(100)).toBe(0);
  });

  it("a glum villager slumps by the full (capped) offset", () => {
    expect(villagerSlumpOffset(0)).toBeCloseTo(VILLAGER_SLUMP_PX, 5);
    expect(villagerSlumpOffset(MOOD_DIM_NONE)).toBeCloseTo(VILLAGER_SLUMP_PX, 5);
  });

  it("is monotonic non-increasing in mood and clamps to [0, VILLAGER_SLUMP_PX]", () => {
    let prev = VILLAGER_SLUMP_PX + 1;
    for (let m = -20; m <= 120; m += 5) {
      const s = villagerSlumpOffset(m);
      expect(s).toBeLessThanOrEqual(prev);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(VILLAGER_SLUMP_PX);
      prev = s;
    }
  });
});

describe("houseEmitsHearthSmoke", () => {
  it("content houses (mood ≥ threshold) breathe a hearth wisp", () => {
    expect(houseEmitsHearthSmoke(MOOD_HEARTH_SMOKE)).toBe(true);
    expect(houseEmitsHearthSmoke(100)).toBe(true);
  });

  it("neglected houses below the threshold stay smokeless", () => {
    expect(houseEmitsHearthSmoke(MOOD_HEARTH_SMOKE - 1)).toBe(false);
    expect(houseEmitsHearthSmoke(40)).toBe(false); // the neutral default mood
    expect(houseEmitsHearthSmoke(0)).toBe(false);
  });
});

// Sanity: TILE_SIZE import wired (used by the follow glide target math in main).
it("TILE_SIZE is a positive number", () => {
  expect(TILE_SIZE).toBeGreaterThan(0);
});
