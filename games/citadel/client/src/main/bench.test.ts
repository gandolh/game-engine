import { describe, expect, it } from "vitest";
import { Camera2D, MAX_ZOOM } from "@engine/core";
import { CITADEL_BENCH_SCENE, benchRequested, citadelBenchPose, citadelBenchScene } from "./bench";

const MAP_UNITS = 6000;

describe("citadelBenchPose", () => {
  it("starts and ends on the town at the opening frame's zoom, the closest", () => {
    const start = citadelBenchPose(0, MAP_UNITS);
    expect(start.zoom).toBe(MAX_ZOOM);
    expect(Math.abs(start.x) + Math.abs(start.y)).toBeLessThan(1e-9);
    expect(citadelBenchPose(29_999, MAP_UNITS)).toEqual({ zoom: MAX_ZOOM, x: 0, y: 0 });
  });

  it("circles close, zooms out to the whole map, circles wider, and zooms back in", () => {
    const close = citadelBenchPose(5_000, MAP_UNITS);
    expect(close.zoom).toBe(MAX_ZOOM);
    expect(close.x).toBeGreaterThan(0);
    const out = citadelBenchPose(12_000, MAP_UNITS);
    expect(out.zoom).toBeLessThan(MAX_ZOOM);
    expect(out.zoom).toBeGreaterThan(1);
    const wide = citadelBenchPose(19_000, MAP_UNITS);
    expect(wide.zoom).toBe(1);
    expect(wide.x).toBeGreaterThan(close.x);
    expect(citadelBenchPose(26_000, MAP_UNITS).zoom).toBeGreaterThan(1);
  });
});

describe("citadelBenchScene", () => {
  it("flies around where the camera was when it started", () => {
    const camera = new Camera2D({ worldUnitsX: MAP_UNITS, worldUnitsY: 3000, centerX: 1200, centerY: 800 });
    const scene = citadelBenchScene(camera, MAP_UNITS);
    expect(scene.name).toBe(CITADEL_BENCH_SCENE);
    scene.step(19_000, 0);
    expect(camera.zoom).toBe(1);
    expect(camera.centerX).toBeGreaterThan(1200);
    scene.step(29_000, 1);
    expect(camera.zoom).toBe(MAX_ZOOM);
    expect([camera.centerX, camera.centerY]).toEqual([1200, 800]);
  });

  it("reads ?bench from the query string", () => {
    expect(benchRequested("?bench")).toBe(true);
    expect(benchRequested("?cozy")).toBe(false);
  });
});
