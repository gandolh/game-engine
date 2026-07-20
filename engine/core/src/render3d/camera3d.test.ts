import { describe, expect, it } from "vitest";
import { OrbitCamera, type OrbitCameraConfig } from "./camera3d";

function baseConfig(overrides: Partial<OrbitCameraConfig> = {}): OrbitCameraConfig {
  return {
    target: [0, 0, 0],
    distance: 10,
    yaw: 0,
    pitch: 0,
    fovy: Math.PI / 3,
    near: 0.1,
    far: 1000,
    minPitch: -Math.PI / 2 + 0.01,
    maxPitch: Math.PI / 2 - 0.01,
    minDistance: 2,
    maxDistance: 50,
    ...overrides,
  };
}

describe("OrbitCamera.eye", () => {
  it("at yaw=0, pitch=0 sits along +x at `distance` from target", () => {
    const cam = new OrbitCamera(baseConfig({ target: [1, 2, 3], distance: 10, yaw: 0, pitch: 0 }));
    const e = cam.eye();
    expect(e[0]).toBeCloseTo(11);
    expect(e[1]).toBeCloseTo(2);
    expect(e[2]).toBeCloseTo(3);
  });

  it("at pitch=+90deg sits directly above target along +z", () => {
    const cam = new OrbitCamera(
      baseConfig({ target: [0, 0, 0], distance: 5, yaw: 0, pitch: Math.PI / 2, minPitch: -Math.PI / 2, maxPitch: Math.PI / 2 }),
    );
    const e = cam.eye();
    expect(e[0]).toBeCloseTo(0, 4);
    expect(e[1]).toBeCloseTo(0, 4);
    expect(e[2]).toBeCloseTo(5, 4);
  });
});

describe("OrbitCamera.orbit", () => {
  it("clamps pitch at the configured bounds", () => {
    const cam = new OrbitCamera(baseConfig({ minPitch: -1, maxPitch: 1 }));
    cam.orbit(0, 10);
    expect(cam.pitch).toBeCloseTo(1);
    cam.orbit(0, -10);
    expect(cam.pitch).toBeCloseTo(-1);
  });

  it("accumulates yaw unclamped", () => {
    const cam = new OrbitCamera(baseConfig());
    cam.orbit(0.5, 0);
    cam.orbit(0.25, 0);
    expect(cam.yaw).toBeCloseTo(0.75);
  });
});

describe("OrbitCamera.zoom", () => {
  it("clamps distance to [minDistance, maxDistance]", () => {
    const cam = new OrbitCamera(baseConfig({ distance: 10, minDistance: 2, maxDistance: 50 }));
    cam.zoom(100);
    expect(cam.distance).toBeCloseTo(50);
    cam.zoom(0.001);
    expect(cam.distance).toBeCloseTo(2);
  });
});

describe("OrbitCamera.pan", () => {
  it("shifts the target in the camera's right/up screen plane", () => {
    const cam = new OrbitCamera(baseConfig({ target: [0, 0, 0], yaw: 0, pitch: 0 }));
    const before = cam.target;
    cam.pan(1, 0);
    // At yaw=0,pitch=0, direction=[1,0,0]; right = normalize(cross([0,0,1],[1,0,0])) = [0,1,0].
    expect(cam.target[0]).toBeCloseTo(before[0]);
    expect(cam.target[1]).toBeCloseTo(before[1] + 1);
    expect(cam.target[2]).toBeCloseTo(before[2]);
  });

  it("moves target along +z for dUp when facing along +x", () => {
    const cam = new OrbitCamera(baseConfig({ target: [0, 0, 0], yaw: 0, pitch: 0 }));
    cam.pan(0, 1);
    expect(cam.target[0]).toBeCloseTo(0);
    expect(cam.target[1]).toBeCloseTo(0);
    expect(cam.target[2]).toBeCloseTo(1);
  });
});

describe("OrbitCamera matrices", () => {
  it("viewMatrix + projMatrix produce well-formed 16-length Float32Arrays", () => {
    const cam = new OrbitCamera(baseConfig());
    const view = cam.viewMatrix();
    const proj = cam.projMatrix(16 / 9);
    expect(view).toHaveLength(16);
    expect(proj).toHaveLength(16);
    // proj[11] === -1 is the WebGPU perspective signature (see mat4.perspective).
    expect(proj[11]).toBeCloseTo(-1);
  });
});
