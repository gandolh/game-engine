import { describe, it, expect } from "vitest";
import { identity, lookAt, multiply, perspective, type Mat4 } from "@engine/core/render3d";
import { projectToScreen } from "./screen-project";

const WIDTH = 800;
const HEIGHT = 600;

/** A camera at `[0,0,10]` looking straight down at the origin, z-up world —
 *  simple enough to reason about expected screen positions by hand. */
function overheadViewProj(): Mat4 {
  const view = lookAt([0, 0, 10], [0, 0, 0], [0, 1, 0]);
  const proj = perspective(Math.PI / 3, WIDTH / HEIGHT, 0.1, 100);
  return multiply(proj, view);
}

describe("projectToScreen", () => {
  it("projects the origin (camera target) to the viewport center", () => {
    const p = projectToScreen([0, 0, 0], overheadViewProj(), WIDTH, HEIGHT);
    expect(p.visible).toBe(true);
    expect(p.x).toBeCloseTo(WIDTH / 2, 1);
    expect(p.y).toBeCloseTo(HEIGHT / 2, 1);
  });

  it("marks a point far outside the frustum as not visible", () => {
    const p = projectToScreen([1000, 1000, 0], overheadViewProj(), WIDTH, HEIGHT);
    expect(p.visible).toBe(false);
  });

  it("marks a point behind the camera (negative clip w) as not visible", () => {
    // Looking from +z toward the origin: a point far behind the eye (large +z)
    // is behind the camera plane.
    const p = projectToScreen([0, 0, 1000], overheadViewProj(), WIDTH, HEIGHT);
    expect(p.visible).toBe(false);
  });

  it("is pure — repeated calls with the same input return the same output", () => {
    const vp = overheadViewProj();
    const a = projectToScreen([1, 2, 0], vp, WIDTH, HEIGHT);
    const b = projectToScreen([1, 2, 0], vp, WIDTH, HEIGHT);
    expect(a).toEqual(b);
  });

  it("flips y (NDC +y up -> screen +y down)", () => {
    // A point offset toward NDC +y (up) should land ABOVE center on screen
    // (smaller sy), since the overhead camera's local up is world +y here.
    const p = projectToScreen([0, 1, 0], overheadViewProj(), WIDTH, HEIGHT);
    expect(p.y).toBeLessThan(HEIGHT / 2);
  });

  it("degenerate identity viewProj at the origin does not throw and is deterministic", () => {
    const p1 = projectToScreen([0, 0, 0], identity(), WIDTH, HEIGHT);
    const p2 = projectToScreen([0, 0, 0], identity(), WIDTH, HEIGHT);
    expect(p1).toEqual(p2);
  });
});
