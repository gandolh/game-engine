/**
 * `?bench`: Hollow's fixed benchmark scene (corpus brief 06). A reading only compares with another taken
 * the same way, so the scene is the same every time: a fixed seed, the founding form skipped, the town
 * left at the default speed with the chronicle open (the left rail always shows it), and the camera
 * orbiting the town once. It runs in production builds too (brief 07 runs it on the deployed games, from a
 * phone, and the portal passes `?bench` into its frame), and it implies `?profile`.
 *
 * The run: a 3 s warm-up holding the first pose, then the profile is reset and 30 s are sampled. At the
 * end `window.__benchResult` holds the brief-05 export plus the scene name, and a button saves it.
 */
import { DebugOverlay, downloadProfile, type FrameProfile, type GameEngineProfile } from "@engine/core";
import type { OrbitCamera } from "@engine/core/render3d";

/** The warm-up before sampling starts. */
export const BENCH_WARMUP_MS = 3_000;
/** The sampled run. */
export const BENCH_RUN_MS = 30_000;

/** What `window.__benchResult` holds: the profile export and the scene that produced it. */
export interface BenchResult extends GameEngineProfile {
  scene: string;
  /** What the scene itself counted, when it counts anything (MateQuest's screens). */
  sceneReport?: Record<string, unknown>;
}

declare global {
  interface Window {
    __benchResult?: BenchResult;
  }
}

/** Whether the page asked for the bench scene: `?bench` in its URL. */
export function benchRequested(search: string = typeof location !== "undefined" ? location.search : ""): boolean {
  return new URLSearchParams(search).has("bench");
}

export interface BenchScene {
  readonly name: string;
  /** Drives the scene `tMs` into the sampled run; `tick` counts the display ticks sampled so far. */
  step(tMs: number, tick: number): void;
  /** Runs each display tick of the warm-up. Without it the warm-up holds `step(0, 0)`. */
  warmUp?(): void;
  /** Puts back what the scene changed, once the run ends. */
  end?(): void;
  /** What the scene counted over the sampled run, added to the result. */
  report?(): Record<string, unknown>;
  /**
   * Whether the run may end before sampling display tick `tick`. Without it the run ends at 30 s; with it
   * the run goes on to the first tick it allows, so a scene of screens can end on a whole screen.
   */
  mayEndAt?(tick: number): boolean;
}

/**
 * Runs `scene` against `profile`: the warm-up, a reset, the sampled run, then `window.__benchResult` and
 * `onDone` (by default, a button that saves the result). The frame source and the end are seams for tests.
 */
export function runBench(
  profile: FrameProfile,
  scene: BenchScene,
  requestFrame: (cb: (ts: number) => void) => void = (cb) => requestAnimationFrame(cb),
  onDone: (result: BenchResult) => void = offerDownload,
): void {
  let startTs: number | null = null;
  let sampling = false;
  let tick = 0;
  const frame = (ts: number): void => {
    startTs ??= ts;
    const elapsed = ts - startTs;
    if (elapsed < BENCH_WARMUP_MS) {
      if (scene.warmUp !== undefined) scene.warmUp();
      else scene.step(0, 0);
      requestFrame(frame);
      return;
    }
    if (!sampling) {
      sampling = true;
      profile.reset();
    }
    const t = elapsed - BENCH_WARMUP_MS;
    if (t < BENCH_RUN_MS || scene.mayEndAt?.(tick) === false) {
      scene.step(t, tick);
      tick += 1;
      requestFrame(frame);
      return;
    }
    scene.end?.();
    const result: BenchResult = { ...profile.exportProfile(), scene: scene.name };
    const report = scene.report?.();
    if (report !== undefined) result.sceneReport = report;
    window.__benchResult = result;
    onDone(result);
  };
  requestFrame(frame);
}

/** Shows a button that saves the result as a JSON download (on a phone, where there is no console). */
function offerDownload(result: BenchResult): void {
  const overlay = new DebugOverlay(document.body, { corner: "top-right" });
  overlay.addButton("⤓ Save bench result", () => downloadProfile(result, "bench"));
}

/** The seed a bench run starts: the portal card's. */
export const HOLLOW_BENCH_SEED = 42;

/** The scene name a Hollow result carries. */
export const HOLLOW_BENCH_SCENE = "hollow-town-orbit";

/** The yaw `tMs` into the run: one full turn from `startYaw` over the run. */
export function hollowBenchYaw(tMs: number, startYaw: number): number {
  return startYaw + (2 * Math.PI * Math.min(tMs, BENCH_RUN_MS)) / BENCH_RUN_MS;
}

/** Hollow's scene: the camera orbits once around its target, at its own pitch and distance. */
export function hollowBenchScene(camera: OrbitCamera): BenchScene {
  const startYaw = camera.yaw;
  return {
    name: HOLLOW_BENCH_SCENE,
    step: (tMs) => {
      camera.yaw = hollowBenchYaw(tMs, startYaw);
    },
  };
}
