import { describe, expect, it } from "vitest";
import { pickNearest, rayFromScreen, rayIntersectAABB, rayIntersectTriangle } from "./pick";
import { lookAt, multiply, perspective } from "./mat4";
import type { Vec3 } from "./types";

describe("rayIntersectAABB", () => {
  it("hits an AABB below a ray cast straight down -z", () => {
    const ray = { origin: [0, 0, 10] as Vec3, dir: [0, 0, -1] as Vec3 };
    const t = rayIntersectAABB(ray, [-1, -1, 0], [1, 1, 2]);
    expect(t).not.toBeNull();
    expect(t as number).toBeCloseTo(8); // travels from z=10 to the box top at z=2
  });

  it("misses an AABB offset to the side", () => {
    const ray = { origin: [0, 0, 10] as Vec3, dir: [0, 0, -1] as Vec3 };
    const t = rayIntersectAABB(ray, [5, 5, 0], [7, 7, 2]);
    expect(t).toBeNull();
  });

  it("misses an AABB entirely behind the ray origin", () => {
    const ray = { origin: [0, 0, 0] as Vec3, dir: [0, 0, 1] as Vec3 };
    const t = rayIntersectAABB(ray, [-1, -1, -5], [1, 1, -2]);
    expect(t).toBeNull();
  });
});

describe("rayIntersectTriangle", () => {
  const a: Vec3 = [-1, -1, 0];
  const b: Vec3 = [1, -1, 0];
  const c: Vec3 = [0, 1, 0];

  it("hits a triangle the ray passes through", () => {
    const ray = { origin: [0, -0.3, 5] as Vec3, dir: [0, 0, -1] as Vec3 };
    const t = rayIntersectTriangle(ray, a, b, c);
    expect(t).not.toBeNull();
    expect(t as number).toBeCloseTo(5);
  });

  it("misses a triangle the ray does not pass through", () => {
    const ray = { origin: [5, 5, 5] as Vec3, dir: [0, 0, -1] as Vec3 };
    const t = rayIntersectTriangle(ray, a, b, c);
    expect(t).toBeNull();
  });
});

describe("pickNearest", () => {
  it("returns the closer of two stacked AABBs", () => {
    const ray = { origin: [0, 0, 10] as Vec3, dir: [0, 0, -1] as Vec3 };
    const near = { bounds: { min: [-1, -1, 3] as Vec3, max: [1, 1, 4] as Vec3 }, value: "near" };
    const far = { bounds: { min: [-1, -1, 0] as Vec3, max: [1, 1, 1] as Vec3 }, value: "far" };
    expect(pickNearest(ray, [far, near])).toBe("near");
  });

  it("tie-breaks to the lowest index when two AABBs hit at the same distance", () => {
    const ray = { origin: [0, 0, 10] as Vec3, dir: [0, 0, -1] as Vec3 };
    const first = { bounds: { min: [-1, -1, 0] as Vec3, max: [1, 1, 2] as Vec3 }, value: "first" };
    const second = { bounds: { min: [-1, -1, 0] as Vec3, max: [1, 1, 2] as Vec3 }, value: "second" };
    expect(pickNearest(ray, [first, second])).toBe("first");
  });

  it("returns null when the ray misses every item", () => {
    const ray = { origin: [0, 0, 10] as Vec3, dir: [0, 0, -1] as Vec3 };
    const offside = { bounds: { min: [5, 5, 0] as Vec3, max: [6, 6, 1] as Vec3 }, value: "offside" };
    expect(pickNearest(ray, [offside])).toBeNull();
  });
});

describe("rayFromScreen", () => {
  it("casts a ray from the screen center roughly toward the camera target", () => {
    const eye: Vec3 = [0, 0, 5];
    const target: Vec3 = [0, 0, 0];
    const view = lookAt(eye, target, [0, 1, 0]);
    const proj = perspective(Math.PI / 2, 1, 1, 100);
    const viewProj = multiply(proj, view);
    const ray = rayFromScreen(400, 300, 800, 600, viewProj);
    // Screen center should unproject to a ray pointing straight down -z
    // (from eye toward target).
    expect(ray.dir[0]).toBeCloseTo(0, 2);
    expect(ray.dir[1]).toBeCloseTo(0, 2);
    expect(ray.dir[2]).toBeCloseTo(-1, 2);
  });
});
