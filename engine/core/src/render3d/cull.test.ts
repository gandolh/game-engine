import { describe, it, expect } from "vitest";
import { boundingSphereOf, cullInstances, extractFrustumPlanes, sphereInFrustum } from "./cull";
import { FLOATS_PER_INSTANCE, packInstances } from "./buffers";
import { lookAt, multiply, perspective, scaling, translation } from "./mat4";
import type { Mesh } from "./types";

// Camera at the origin looking down -z, 90 degree fov, square aspect: the frustum is |x| <= -z, |y| <= -z,
// 1 <= -z <= 100.
const viewProj = multiply(perspective(Math.PI / 2, 1, 1, 100), lookAt([0, 0, 0], [0, 0, -1], [0, 1, 0]));
const planes = extractFrustumPlanes(viewProj);

describe("sphereInFrustum", () => {
  it("keeps a sphere inside", () => {
    expect(sphereInFrustum(planes, 0, 0, -10, 1)).toBe(true);
  });
  it.each([
    ["left", -30, 0, -10],
    ["right", 30, 0, -10],
    ["bottom", 0, -30, -10],
    ["top", 0, 30, -10],
    ["near", 0, 0, 5],
    ["far", 0, 0, -200],
  ])("culls a sphere fully outside the %s plane", (_name, x, y, z) => {
    expect(sphereInFrustum(planes, x, y, z, 1)).toBe(false);
  });
  it.each([
    ["left", -10.5, 0, -10],
    ["right", 10.5, 0, -10],
    ["bottom", 0, -10.5, -10],
    ["top", 0, 10.5, -10],
    ["near", 0, 0, -0.5],
    ["far", 0, 0, -100.5],
  ])("keeps a sphere crossing the %s plane", (_name, x, y, z) => {
    expect(sphereInFrustum(planes, x, y, z, 1)).toBe(true);
  });
  it("keeps everything under a degenerate matrix", () => {
    expect(sphereInFrustum(extractFrustumPlanes(new Float32Array(16)), 5, 5, 5, 1)).toBe(true);
  });
});

describe("boundingSphereOf", () => {
  it("holds every vertex", () => {
    const mesh: Mesh = {
      positions: [
        [0, 0, 0],
        [2, 0, 0],
        [0, 4, 0],
      ],
      tris: [{ a: 0, b: 1, c: 2, material: "m" }],
    };
    const s = boundingSphereOf(mesh);
    for (const [x, y, z] of mesh.positions) {
      expect(Math.hypot(x - s.cx, y - s.cy, z - s.cz)).toBeLessThanOrEqual(s.radius + 1e-9);
    }
  });
});

describe("cullInstances", () => {
  const unit = { cx: 0, cy: 0, cz: 0, radius: 1 };
  const tint = [1, 1, 1, 1] as const;
  const run = (list: Array<{ model: Float32Array }>, sphere = unit): { kept: number; out: Float32Array } => {
    const src = packInstances(list.map((l) => ({ model: l.model, tint })));
    const out = new Float32Array(src.length);
    return { kept: cullInstances(src, list.length, sphere, planes, out), out };
  };

  it("keeps the visible rows in order and drops the rest", () => {
    const { kept, out } = run([
      { model: translation([0, 0, -10]) },
      { model: translation([50, 0, -10]) },
      { model: translation([1, 0, -20]) },
    ]);
    expect(kept).toBe(2);
    expect(out[12]).toBe(0);
    expect(out[FLOATS_PER_INSTANCE + 12]).toBe(1);
    expect(out[FLOATS_PER_INSTANCE + 14]).toBe(-20);
  });

  it("keeps a scaled instance whose unscaled sphere is outside but whose scaled sphere crosses a plane", () => {
    // Centre at x = 13 at depth 10: the right plane is x = 10, so the unit sphere (reach 12..14) is outside.
    const model = multiply(translation([13, 0, -10]), scaling([5, 2, 3]));
    expect(run([{ model: translation([13, 0, -10]) }]).kept).toBe(0);
    expect(run([{ model }]).kept).toBe(1);
  });

  it("transforms an off-centre mesh sphere by the instance matrix", () => {
    const sphere = { cx: 20, cy: 0, cz: 0, radius: 1 };
    expect(run([{ model: translation([-20, 0, -10]) }], sphere).kept).toBe(1);
    expect(run([{ model: translation([0, 0, -10]) }], sphere).kept).toBe(0);
  });
});
