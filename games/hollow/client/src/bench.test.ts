import { describe, expect, it } from "vitest";
import { OrbitCamera } from "@engine/core/render3d";
import { BENCH_RUN_MS, HOLLOW_BENCH_SCENE, benchRequested, hollowBenchScene, hollowBenchYaw } from "./bench";

describe("hollowBenchScene", () => {
  it("turns the camera once around its target over the run", () => {
    expect(hollowBenchYaw(0, 1)).toBe(1);
    expect(hollowBenchYaw(BENCH_RUN_MS / 2, 1)).toBeCloseTo(1 + Math.PI);
    expect(hollowBenchYaw(BENCH_RUN_MS * 2, 1)).toBeCloseTo(1 + 2 * Math.PI);
  });

  it("changes only the yaw", () => {
    const camera = new OrbitCamera({
      target: [32, 32, 1],
      distance: 50,
      yaw: Math.PI / 4,
      pitch: Math.PI / 4,
      fovy: 1,
      near: 0.1,
      far: 400,
      minPitch: 0.05,
      maxPitch: 1.5,
      minDistance: 4,
      maxDistance: 200,
    });
    const scene = hollowBenchScene(camera);
    expect(scene.name).toBe(HOLLOW_BENCH_SCENE);
    scene.step(BENCH_RUN_MS / 4, 0);
    expect(camera.yaw).toBeCloseTo(Math.PI / 4 + Math.PI / 2);
    expect([camera.pitch, camera.distance]).toEqual([Math.PI / 4, 50]);
    expect(benchRequested("?bench&profile")).toBe(true);
  });
});
