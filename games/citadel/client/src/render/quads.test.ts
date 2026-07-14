/**
 * Tests for the villager job→color map in quads.ts.
 *
 * Verifies:
 *   1. `VILLAGER_JOB_COLORS` is total — every VillagerJob value has a color.
 *   2. All mapped colors are valid EDG32 hex strings (palette guard in-unit).
 *   3. Every two distinct jobs have distinct tints (no accidental aliasing).
 *   4. `villagerQuad` applies the job tint (not the FSM tint).
 *   5. An unrecognised job string falls back gracefully (white, not a crash).
 */
import { describe, it, expect } from "vitest";
import { rgbOf } from "@engine/core";
import { CITADEL_PAL as EDG } from "./citadel-palette";
import type { VillagerSnapshot, BuildingSnapshot } from "@citadel/sim-core";
import { TILE_SIZE } from "@citadel/sim-core";
import {
  VILLAGER_JOB_COLORS,
  ALL_VILLAGER_JOBS,
  FALLBACK_VILLAGER_COLOR,
  packTint,
  villagerQuad,
  buildingQuad,
} from "./quads";
import { MESH_OVERRIDES } from "./sprites/mesh";
import { LIT_BUILDING_TYPES, buildingLitFrameName, buildingFrameName } from "./sprites/recipes";

describe("VILLAGER_JOB_COLORS — totality and palette cleanliness", () => {
  it("covers every VillagerJob value", () => {
    for (const job of ALL_VILLAGER_JOBS) {
      expect(VILLAGER_JOB_COLORS[job]).toBeDefined();
    }
  });

  it("every mapped color is a valid EDG32 hex string (parseable by rgbOf)", () => {
    for (const [job, hex] of Object.entries(VILLAGER_JOB_COLORS)) {
      expect(() => rgbOf(hex), `job "${job}" has invalid hex "${hex}"`).not.toThrow();
    }
  });

  it("two different jobs get different tints (no accidental aliasing)", () => {
    // Build a map of hex → job[] so collisions are easy to report.
    const byHex: Map<string, string[]> = new Map();
    for (const job of ALL_VILLAGER_JOBS) {
      const hex = VILLAGER_JOB_COLORS[job];
      const list = byHex.get(hex) ?? [];
      list.push(job);
      byHex.set(hex, list);
    }
    for (const [hex, jobs] of byHex) {
      expect(jobs.length, `jobs [${jobs.join(", ")}] share hex "${hex}"`).toBe(1);
    }
  });

  it("idle maps to a neutral tint (EDG.silver)", () => {
    expect(VILLAGER_JOB_COLORS["idle"]).toBe(EDG.silver);
  });
});

describe("villagerQuad — job-driven tint", () => {
  function villager(job: string, fsm = "walkToWork"): VillagerSnapshot {
    return { id: 1, x: 3, y: 5, fsm, carryGood: null, job, mood: 40 };
  }

  it("applies the job tint, not the FSM tint", () => {
    // farmer walks to work: old code would give EDG.yellow (walkToWork FSM);
    // new code gives EDG.greenMid (farmer job).
    const q = villagerQuad(villager("farmer", "walkToWork"));
    expect(q.tintRgba).toBe(packTint(VILLAGER_JOB_COLORS["farmer"]));
  });

  it("uses a different tint for each of two distinct jobs", () => {
    const farmerTint = villagerQuad(villager("farmer")).tintRgba;
    const smithTint  = villagerQuad(villager("smith")).tintRgba;
    expect(farmerTint).not.toBe(smithTint);
  });

  it("centers the quad on the tile and sizes it 1.1 tiles", () => {
    const q = villagerQuad(villager("baker"));
    const size = TILE_SIZE * 1.1;
    expect(q.width).toBe(size);
    expect(q.height).toBe(size);
    expect(q.x).toBeCloseTo(3 * TILE_SIZE + TILE_SIZE / 2 - size / 2);
    expect(q.y).toBeCloseTo(5 * TILE_SIZE + TILE_SIZE / 2 - size / 2);
  });

  it("falls back to white for an unrecognised job string (no crash)", () => {
    const q = villagerQuad(villager("unknown-future-job"));
    expect(q.tintRgba).toBe(packTint(FALLBACK_VILLAGER_COLOR));
  });
});

describe("dusk-lit building frames (mesh @lit night art)", () => {
  function building(type: string, burning = false): BuildingSnapshot {
    return {
      type, x: 2, y: 2, w: 2, h: 2,
      connected: true, outputBuffer: 0, workerCount: 1, occupancy: 0,
      ownerId: 0, onFire: burning, burning, level: 1,
      lacksFaith: false, lacksSafety: false, lacksGoods: false, mood: 60,
      wellServed: false,
    };
  }

  const DAY = 0;
  const NIGHT = 0.9; // nightFactorOf(dayFraction 0.9) ≈ 0.905, past the 0.45 lit threshold

  it("picks the `@lit` frame at night and the day frame by day", () => {
    for (const type of LIT_BUILDING_TYPES) {
      expect(buildingQuad(building(type), undefined, DAY).frame, `${type} by day`)
        .toBe(buildingFrameName(type));
      expect(buildingQuad(building(type), undefined, NIGHT).frame, `${type} at night`)
        .toBe(buildingLitFrameName(type));
    }
  });

  it("every frame the renderer asks for at night EXISTS as mesh art", () => {
    // The regression this closes: the @lit frames used to resolve to char recipes
    // while the day frames were meshes, so those four buildings silently reverted
    // to the old art style at dusk. Selection and art must agree.
    for (const type of LIT_BUILDING_TYPES) {
      const frame = buildingQuad(building(type), undefined, NIGHT).frame!;
      expect(MESH_OVERRIDES.has(frame), `${frame} is mesh-rendered`).toBe(true);
    }
  });

  it("a burning building keeps its day frame at night (the fire read wins)", () => {
    const q = buildingQuad(building("house", true), undefined, NIGHT);
    expect(q.frame).toBe(buildingFrameName("house"));
  });

  it("a non-lit building type keeps its day frame at night", () => {
    expect(buildingQuad(building("storehouse"), undefined, NIGHT).frame)
      .toBe(buildingFrameName("storehouse"));
  });
});
