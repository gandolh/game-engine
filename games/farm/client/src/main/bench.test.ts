import { describe, expect, it, vi } from "vitest";
import { FrameProfile, MIN_ZOOM } from "@engine/core";
import { createPanelPrefs } from "@engine/ui";
import {
  BENCH_RUN_MS,
  BENCH_WARMUP_MS,
  FARM_BENCH_SCENE,
  benchRequested,
  farmBenchPose,
  farmBenchScene,
  runBench,
  type BenchResult,
  type BenchScene,
} from "./bench";
import { DEFAULT_ZOOM } from "./config";
import { panelPrefsConfig, type PanelId } from "./panels";

const PANEL_IDS: readonly PanelId[] = ["observer", "slate", "events", "relations", "wealth", "column"];

/** Drives `runBench` with display ticks `stepMs` apart, until it stops asking for frames. */
function drive(scene: BenchScene, stepMs: number) {
  const profile = new FrameProfile({ game: "farm", enabled: false });
  const reset = vi.spyOn(profile, "reset");
  let pending: ((ts: number) => void) | null = null;
  let done: BenchResult | null = null;
  runBench(
    profile,
    scene,
    (cb) => {
      pending = cb;
    },
    (result) => {
      done = result;
    },
  );
  let ts = 1000;
  let ticks = 0;
  while (pending !== null) {
    const cb: (ts: number) => void = pending;
    pending = null;
    cb(ts);
    ts += stepMs;
    ticks += 1;
  }
  return { reset, done: done as BenchResult | null, ticks };
}

describe("runBench", () => {
  it("warms up, resets the profile once, samples the run and publishes the result", () => {
    const steps: { t: number; tick: number }[] = [];
    let warm = 0;
    const scene: BenchScene = {
      name: "test-scene",
      warmUp: () => {
        warm += 1;
      },
      step: (t, tick) => steps.push({ t, tick }),
    };
    const { reset, done, ticks } = drive(scene, 100);
    expect(warm).toBe(BENCH_WARMUP_MS / 100);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(steps).toHaveLength(BENCH_RUN_MS / 100);
    expect(steps[0]).toEqual({ t: 0, tick: 0 });
    expect(steps.at(-1)?.t).toBeLessThan(BENCH_RUN_MS);
    expect(ticks).toBe((BENCH_WARMUP_MS + BENCH_RUN_MS) / 100 + 1);
    expect(done?.scene).toBe("test-scene");
    expect(done?.schema).toBe("game-engine-profile/1");
    expect(window.__benchResult).toBe(done);
  });

  it("holds the first pose through the warm-up when the scene has no warm-up of its own", () => {
    const ts: number[] = [];
    drive({ name: "hold", step: (t) => ts.push(t) }, 500);
    expect(ts.slice(0, BENCH_WARMUP_MS / 500).every((t) => t === 0)).toBe(true);
  });

  it("runs past 30 s until the scene may end", () => {
    let sampled = 0;
    const scene: BenchScene = {
      name: "screens",
      warmUp: () => {},
      step: () => {
        sampled += 1;
      },
      mayEndAt: (tick) => tick % 7 === 0,
    };
    drive(scene, 100);
    expect(sampled).toBe(Math.ceil(BENCH_RUN_MS / 100 / 7) * 7);
  });

  it("reads ?bench from the query string", () => {
    expect(benchRequested("?bench&profile")).toBe(true);
    expect(benchRequested("?profile")).toBe(false);
  });
});

describe("farmBenchPose", () => {
  it("starts and ends at the world centre at the default zoom", () => {
    expect(farmBenchPose(0)).toEqual({ zoom: DEFAULT_ZOOM, x: 0, y: 0 });
    expect(farmBenchPose(BENCH_RUN_MS - 1)).toEqual({ zoom: DEFAULT_ZOOM, x: 0, y: 0 });
  });

  it("sweeps east and west at the default zoom, then pans at the widest zoom", () => {
    expect(farmBenchPose(3_000).x).toBeGreaterThan(0);
    expect(farmBenchPose(9_000).x).toBeLessThan(0);
    expect(farmBenchPose(3_000).y).toBe(0);
    const wide = farmBenchPose(15_000);
    expect(wide.zoom).toBe(MIN_ZOOM);
    expect(wide.x).toBeGreaterThan(0);
    expect(wide.y).toBeGreaterThan(0);
  });
});

describe("the bench layout", () => {
  it("opens every collapsible panel in memory, leaving the player's saved layout alone", () => {
    const config = panelPrefsConfig(true);
    expect(config.storage).toBeNull();
    const prefs = createPanelPrefs<PanelId>(config);
    expect(PANEL_IDS.every((id) => prefs.isOpen(id))).toBe(true);
    expect(farmBenchScene().name).toBe(FARM_BENCH_SCENE);
  });
});
