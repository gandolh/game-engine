/**
 * `?bench`: Farm's fixed benchmark scene (corpus brief 06). A reading only compares with another taken
 * the same way, so the scene is the same every time: the boot seed, the home screen skipped, the six
 * collapsible panels open (an in-memory layout, so a player's saved one is untouched), and one camera
 * path. It runs in production builds too (brief 07 runs it on the
 * deployed games, from a phone), and it implies `?profile`.
 *
 * The run: a 3 s warm-up holding the first pose, then the profile is reset and 30 s are sampled. At the
 * end `window.__benchResult` holds the brief-05 export plus the scene name, and a button saves it.
 *
 * The camera path, at the world centre (no farmer followed): one sweep east and west at the default zoom,
 * one diagonal sweep at the widest zoom, then back to the default zoom at the centre.
 */
import { DebugOverlay, MIN_ZOOM, downloadProfile, type FrameProfile, type GameEngineProfile } from "@engine/core";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@farm/sim-core/world/regions";
import { _camera, setFocusedFarmerId, setPanOffset, setRecenteringOnPip, setZoom, zoom } from "./camera";
import { DEFAULT_ZOOM, TILE } from "./config";

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

/** How far the camera sweeps from the world centre, in world units. */
const SWEEP_X = 0.35 * WORLD_WIDTH * TILE;
const SWEEP_Y = 0.35 * WORLD_HEIGHT * TILE;
/** The three legs of the path, in ms into the run. */
const DEFAULT_LEG_END = 12_000;
const WIDE_LEG_END = 24_000;

export interface FarmBenchPose {
  zoom: number;
  /** The pan offset from the world centre, in world units. */
  x: number;
  y: number;
}

/** Where the camera is `tMs` into the run. */
export function farmBenchPose(tMs: number): FarmBenchPose {
  if (tMs < DEFAULT_LEG_END) {
    const turn = Math.sin((2 * Math.PI * tMs) / DEFAULT_LEG_END);
    return { zoom: DEFAULT_ZOOM, x: SWEEP_X * turn, y: 0 };
  }
  if (tMs < WIDE_LEG_END) {
    const turn = Math.sin((2 * Math.PI * (tMs - DEFAULT_LEG_END)) / (WIDE_LEG_END - DEFAULT_LEG_END));
    return { zoom: MIN_ZOOM, x: SWEEP_X * turn, y: SWEEP_Y * turn };
  }
  return { zoom: DEFAULT_ZOOM, x: 0, y: 0 };
}

/** The scene name a Farm result carries. */
export const FARM_BENCH_SCENE = "farm-pan-default-wide-return";

/**
 * Farm's scene: the camera path, with nobody followed. The panels are open already: under `?bench` they
 * are built from the all-open layout (see `panelPrefsConfig`).
 */
export function farmBenchScene(): BenchScene {
  return {
    name: FARM_BENCH_SCENE,
    step: (tMs) => {
      const p = farmBenchPose(tMs);
      // Nobody is followed, so the pan offset is from the world centre (see applyFocusAndPan).
      setFocusedFarmerId(null);
      setRecenteringOnPip(false);
      setPanOffset({ x: p.x, y: p.y });
      if (zoom !== p.zoom) {
        setZoom(p.zoom);
        _camera?.setZoom(p.zoom);
      }
    },
  };
}
