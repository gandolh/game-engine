import { describe, it, expect } from "vitest";
import { boundsOf } from "@engine/core/render3d";
import {
  buildHumanoid,
  poseForAction,
  stageScale,
  humanoidTint,
  variantKey,
  VariantCache,
  AGENT_MATERIAL_KEYS,
  buildAgentMaterialList,
  POSE_KEYS,
  CLOTH_KEY,
  type PoseKey,
} from "./humanoid";

const SKIN = "skinMid";
const HAIR = "hairBrown";

describe("buildHumanoid", () => {
  it("returns a non-empty, index-valid mesh for every pose", () => {
    for (const pose of POSE_KEYS) {
      const mesh = buildHumanoid({ skinKey: SKIN, hairKey: HAIR, clothKey: CLOTH_KEY, pose });
      expect(mesh.positions.length).toBeGreaterThan(0);
      expect(mesh.tris.length).toBeGreaterThan(0);
      for (const tri of mesh.tris) {
        expect(tri.a).toBeLessThan(mesh.positions.length);
        expect(tri.b).toBeLessThan(mesh.positions.length);
        expect(tri.c).toBeLessThan(mesh.positions.length);
        expect(tri.a).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("uses exactly the skin/hair/cloth materials it was given", () => {
    const mesh = buildHumanoid({ skinKey: SKIN, hairKey: HAIR, clothKey: CLOTH_KEY, pose: "stand" });
    const materials = new Set(mesh.tris.map((t) => t.material));
    expect(materials.has(SKIN)).toBe(true);
    expect(materials.has(HAIR)).toBe(true);
    expect(materials.has(CLOTH_KEY)).toBe(true);
  });

  it("is humanoid-proportioned: taller than it is wide or deep", () => {
    const mesh = buildHumanoid({ skinKey: SKIN, hairKey: HAIR, clothKey: CLOTH_KEY, pose: "stand" });
    const b = boundsOf(mesh);
    const height = b.max[2] - b.min[2];
    const width = b.max[1] - b.min[1];
    const depth = b.max[0] - b.min[0];
    expect(height).toBeGreaterThan(width);
    expect(height).toBeGreaterThan(depth);
  });

  it("stands with its feet at local z = 0 (so the terrain places feet exactly)", () => {
    const mesh = buildHumanoid({ skinKey: SKIN, hairKey: HAIR, clothKey: CLOTH_KEY, pose: "stand" });
    const b = boundsOf(mesh);
    expect(b.min[2]).toBe(0);
  });

  it("is deterministic — identical options build an identical mesh", () => {
    const a = buildHumanoid({ skinKey: SKIN, hairKey: HAIR, clothKey: CLOTH_KEY, pose: "work" });
    const b = buildHumanoid({ skinKey: SKIN, hairKey: HAIR, clothKey: CLOTH_KEY, pose: "work" });
    expect(a).toEqual(b);
  });

  it("differs visibly (bounds) between the stand pose and a walking/gesture pose", () => {
    const stand = boundsOf(buildHumanoid({ skinKey: SKIN, hairKey: HAIR, clothKey: CLOTH_KEY, pose: "stand" }));
    const walkA = boundsOf(buildHumanoid({ skinKey: SKIN, hairKey: HAIR, clothKey: CLOTH_KEY, pose: "walkA" }));
    const aggress = boundsOf(buildHumanoid({ skinKey: SKIN, hairKey: HAIR, clothKey: CLOTH_KEY, pose: "aggress" }));
    expect(walkA.min[0]).not.toBeCloseTo(stand.min[0], 5);
    expect(aggress.max[2]).not.toBeCloseTo(stand.max[2], 5);
  });
});

describe("poseForAction", () => {
  it("maps every documented action label to the brief's pose table", () => {
    const table: Record<string, PoseKey> = {
      idle: "stand",
      rest: "stand",
      work: "work",
      help: "work",
      teach: "work",
      gift: "interact",
      share: "interact",
      trade: "interact",
      attack: "aggress",
      sabotage: "aggress",
      steal: "aggress",
      rumor: "aggress",
      eat: "eat",
    };
    for (const [action, pose] of Object.entries(table)) {
      expect(poseForAction(action)).toBe(pose);
    }
  });

  it("maps 'walk' and any unrecognized action to 'stand' (gait override lives in agent-anim.ts)", () => {
    expect(poseForAction("walk")).toBe("stand");
    expect(poseForAction("nonsense")).toBe("stand");
  });
});

describe("stageScale", () => {
  it("is monotonic: child < adult", () => {
    expect(stageScale("child")).toBeLessThan(stageScale("adult"));
  });

  it("keeps elder close to (but not exceeding) adult", () => {
    expect(stageScale("elder")).toBeLessThanOrEqual(stageScale("adult"));
    expect(stageScale("elder")).toBeGreaterThan(stageScale("child"));
  });

  it("defaults an unrecognized stage to adult scale", () => {
    expect(stageScale("mystery")).toBe(stageScale("adult"));
  });
});

describe("humanoidTint", () => {
  it("is deterministic for a given agent id", () => {
    expect(humanoidTint(42)).toEqual(humanoidTint(42));
  });

  it("stays bounded near white (subtle jitter, opaque alpha)", () => {
    for (let id = 0; id < 50; id++) {
      const [r, g, b, a] = humanoidTint(id);
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThan(0.8);
        expect(c).toBeLessThan(1.2);
      }
      expect(a).toBe(1);
    }
  });

  it("varies across agent ids — not a flat constant", () => {
    const tints = new Set([0, 1, 2, 3, 4, 5].map((id) => humanoidTint(id).join(",")));
    expect(tints.size).toBeGreaterThan(1);
  });
});

describe("variantKey", () => {
  it("is stable for identical inputs", () => {
    expect(variantKey("skin", "hairBlack", "stand")).toBe(variantKey("skin", "hairBlack", "stand"));
  });

  it("differs whenever skin, hair, or pose differ", () => {
    const base = variantKey("skin", "hairBlack", "stand");
    expect(variantKey("skinDark", "hairBlack", "stand")).not.toBe(base);
    expect(variantKey("skin", "hairBlonde", "stand")).not.toBe(base);
    expect(variantKey("skin", "hairBlack", "walkA")).not.toBe(base);
  });
});

describe("VariantCache", () => {
  it("builds each distinct key exactly once (memoized)", () => {
    const cache = new VariantCache<number>();
    let calls = 0;
    const build = (): number => {
      calls++;
      return calls;
    };
    expect(cache.getOrBuild("a", build)).toBe(1);
    expect(cache.getOrBuild("a", build)).toBe(1); // memoized — build() not called again
    expect(cache.getOrBuild("b", build)).toBe(2);
    expect(calls).toBe(2);
    expect(cache.size).toBe(2);
  });
});

describe("agent material table", () => {
  it("has no duplicate keys", () => {
    expect(new Set(AGENT_MATERIAL_KEYS).size).toBe(AGENT_MATERIAL_KEYS.length);
  });

  it("includes all 5 skin roles, all 5 hair roles, and the cloth role", () => {
    expect(AGENT_MATERIAL_KEYS).toContain("skin");
    expect(AGENT_MATERIAL_KEYS).toContain("skinDeep");
    expect(AGENT_MATERIAL_KEYS).toContain("hairBlack");
    expect(AGENT_MATERIAL_KEYS).toContain("hairGrey");
    expect(AGENT_MATERIAL_KEYS).toContain(CLOTH_KEY);
    expect(AGENT_MATERIAL_KEYS).toHaveLength(11);
  });

  it("buildAgentMaterialList has one valid Material per key, same order", () => {
    const materials = buildAgentMaterialList();
    expect(materials).toHaveLength(AGENT_MATERIAL_KEYS.length);
    for (const m of materials) {
      expect(m.color).toHaveLength(3);
      for (const c of m.color) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});
