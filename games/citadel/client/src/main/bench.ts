/**
 * `?bench`: Citadel's fixed benchmark scene (corpus brief 06). A reading only compares with another taken
 * the same way, so the scene is the same every time: the fixed seed, a cozy run on the default map with
 * the founding picker skipped, and one camera path over the town. It runs in production builds too (brief
 * 07 runs it on the deployed games, from a phone), and it implies `?profile`.
 *
 * The run: a 3 s warm-up holding the first pose, then the profile is reset and 30 s are sampled. At the
 * end `window.__benchResult` holds the brief-05 export plus the scene name, and a button saves it.
 *
 * The camera path, around the town the opening frame centres on: a circle at the boot zoom (the opening
 * frame's, which is also the closest), a zoom out to the whole map, a wider circle there, and a zoom back
 * in to the town.
 */
import {
  DebugOverlay,
  MAX_ZOOM,
  downloadProfile,
  type Camera2D,
  type FrameProfile,
  type GameEngineProfile,
} from "@engine/core";

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

/** The legs of the path, in ms into the run. */
const CLOSE_LEG_END = 10_000;
const ZOOM_OUT_END = 14_000;
const WIDE_LEG_END = 24_000;
const ZOOM_IN_END = 28_000;
/** The whole-map zoom: the camera's own before the opening frame. */
const WIDE_ZOOM = 1;
/** Circle radii, as a share of the view's width at that zoom. */
const CLOSE_RADIUS = 0.3;
const WIDE_RADIUS = 0.15;

export interface CitadelBenchPose {
  zoom: number;
  /** The offset from the town centre, in world units. */
  x: number;
  y: number;
}

/** Zoom between `a` and `b` at `f` (0 to 1), even in steps of scale rather than of units. */
function zoomBetween(a: number, b: number, f: number): number {
  return a * Math.pow(b / a, Math.min(1, Math.max(0, f)));
}

/** Where the camera is `tMs` into the run, for a map `mapUnitsX` world units wide at zoom 1. */
export function citadelBenchPose(tMs: number, mapUnitsX: number): CitadelBenchPose {
  const circle = (zoom: number, radiusShare: number, f: number): CitadelBenchPose => {
    const r = (radiusShare * mapUnitsX) / zoom;
    const a = 2 * Math.PI * f;
    // Starts and ends at the centre: the circle is drawn around a point `r` to the east.
    return { zoom, x: r * (1 - Math.cos(a)), y: r * Math.sin(a) * 0.5 };
  };
  if (tMs < CLOSE_LEG_END) return circle(MAX_ZOOM, CLOSE_RADIUS, tMs / CLOSE_LEG_END);
  if (tMs < ZOOM_OUT_END) {
    return {
      zoom: zoomBetween(MAX_ZOOM, WIDE_ZOOM, (tMs - CLOSE_LEG_END) / (ZOOM_OUT_END - CLOSE_LEG_END)),
      x: 0,
      y: 0,
    };
  }
  if (tMs < WIDE_LEG_END) return circle(WIDE_ZOOM, WIDE_RADIUS, (tMs - ZOOM_OUT_END) / (WIDE_LEG_END - ZOOM_OUT_END));
  if (tMs < ZOOM_IN_END) {
    return { zoom: zoomBetween(WIDE_ZOOM, MAX_ZOOM, (tMs - WIDE_LEG_END) / (ZOOM_IN_END - WIDE_LEG_END)), x: 0, y: 0 };
  }
  return { zoom: MAX_ZOOM, x: 0, y: 0 };
}

/** The scene name a Citadel result carries. */
export const CITADEL_BENCH_SCENE = "citadel-cozy-town-close-wide";

/**
 * Citadel's scene, flown around where the camera is now (the opening frame's town centre). `mapUnitsX` is
 * the map's width in world units at zoom 1.
 */
export function citadelBenchScene(camera: Camera2D, mapUnitsX: number): BenchScene {
  const cx = camera.centerX;
  const cy = camera.centerY;
  return {
    name: CITADEL_BENCH_SCENE,
    step: (tMs) => {
      const p = citadelBenchPose(tMs, mapUnitsX);
      camera.setZoom(p.zoom);
      camera.setCenter(cx + p.x, cy + p.y);
    },
  };
}

/**
 * Waits for the opening frame (`framed()` turns true once the seeded town is centred), then runs the scene.
 */
export function startCitadelBench(
  profile: FrameProfile,
  camera: () => Camera2D,
  mapUnitsX: number,
  framed: () => boolean,
): void {
  const wait = (): void => {
    if (!framed()) {
      requestAnimationFrame(wait);
      return;
    }
    runBench(profile, citadelBenchScene(camera(), mapUnitsX));
  };
  requestAnimationFrame(wait);
}
