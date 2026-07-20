import { describe, expect, it } from "vitest";
import { identity, invert, lookAt, multiply, perspective, rotationZ, transformPoint, translation } from "./mat4";
import type { Vec3 } from "./types";

function expectMatClose(a: Float32Array, b: Float32Array, eps = 1e-4): void {
  for (let i = 0; i < 16; i++) {
    expect(a[i]).toBeCloseTo(b[i] as number, 4);
  }
  void eps;
}

describe("identity + multiply", () => {
  it("multiply(identity, m) === m", () => {
    const m = perspective(Math.PI / 3, 16 / 9, 0.1, 100);
    const result = multiply(identity(), m);
    expectMatClose(result, m);
  });

  it("multiply(m, identity) === m", () => {
    const m = lookAt([3, 0, 0], [0, 0, 0], [0, 0, 1]);
    const result = multiply(m, identity());
    expectMatClose(result, m);
  });
});

describe("perspective", () => {
  it("maps the near plane to NDC z≈0 and the far plane to NDC z≈1 (WebGPU range)", () => {
    const near = 1;
    const far = 100;
    const m = perspective(Math.PI / 2, 1, near, far);
    // A point straight down the view -z axis at z=-near.
    const nearView: Vec3 = [0, 0, -near];
    const farView: Vec3 = [0, 0, -far];
    const nearClip = transformPoint(m, nearView);
    const farClip = transformPoint(m, farView);
    expect(nearClip[2]).toBeCloseTo(0, 5);
    expect(farClip[2]).toBeCloseTo(1, 5);
  });

  it("maps a point on the view axis to NDC x=0, y=0", () => {
    const m = perspective(Math.PI / 3, 16 / 9, 0.1, 1000);
    const p = transformPoint(m, [0, 0, -5]);
    expect(p[0]).toBeCloseTo(0, 5);
    expect(p[1]).toBeCloseTo(0, 5);
  });
});

describe("lookAt", () => {
  it("puts the eye→target axis down -z in view space", () => {
    const eye: Vec3 = [5, 0, 0];
    const target: Vec3 = [0, 0, 0];
    const view = lookAt(eye, target, [0, 0, 1]);
    // The target, transformed into view space, should lie on the -z axis at
    // distance = |eye-target|, with x=y=0.
    const targetInView = transformPoint(view, target);
    expect(targetInView[0]).toBeCloseTo(0, 4);
    expect(targetInView[1]).toBeCloseTo(0, 4);
    expect(targetInView[2]).toBeCloseTo(-5, 4);
    // The eye itself must be at the view-space origin.
    const eyeInView = transformPoint(view, eye);
    expect(eyeInView[0]).toBeCloseTo(0, 4);
    expect(eyeInView[1]).toBeCloseTo(0, 4);
    expect(eyeInView[2]).toBeCloseTo(0, 4);
  });
});

describe("rotationZ", () => {
  it("rotates a point 90° about +z (x-axis point -> y-axis point)", () => {
    const m = rotationZ(Math.PI / 2);
    const p = transformPoint(m, [1, 0, 0]);
    expect(p[0]).toBeCloseTo(0, 5);
    expect(p[1]).toBeCloseTo(1, 5);
    expect(p[2]).toBeCloseTo(0, 5);
  });

  it("leaves z unchanged and composes with translation as a model matrix", () => {
    const m = multiply(translation([5, 0, 0]), rotationZ(Math.PI));
    // A point at the local origin rotates in place, then translates.
    const p = transformPoint(m, [1, 0, 2]);
    expect(p[0]).toBeCloseTo(4, 5); // 5 + (-1)
    expect(p[1]).toBeCloseTo(0, 5);
    expect(p[2]).toBeCloseTo(2, 5);
  });

  it("rotationZ(0) is the identity", () => {
    const m = rotationZ(0);
    for (let i = 0; i < 16; i++) {
      expect(m[i]).toBeCloseTo((identity() as Float32Array)[i] as number, 6);
    }
  });
});

describe("invert", () => {
  it("invert(m) then multiply ≈ identity", () => {
    const m = multiply(
      perspective(Math.PI / 3, 4 / 3, 0.5, 200),
      lookAt([10, 4, 6], [0, 0, 0], [0, 0, 1]),
    );
    const inv = invert(m);
    const shouldBeIdentity = multiply(inv, m);
    expectMatClose(shouldBeIdentity, identity(), 1e-3);
  });

  it("invert of a pure lookAt round-trips a world point through the ray", () => {
    const view = lookAt([2, 3, 4], [0, 0, 0], [0, 0, 1]);
    const inv = invert(view);
    const worldPoint: Vec3 = [1, 1, 1];
    const viewSpace = transformPoint(view, worldPoint);
    const backToWorld = transformPoint(inv, viewSpace);
    expect(backToWorld[0]).toBeCloseTo(worldPoint[0], 3);
    expect(backToWorld[1]).toBeCloseTo(worldPoint[1], 3);
    expect(backToWorld[2]).toBeCloseTo(worldPoint[2], 3);
  });
});
