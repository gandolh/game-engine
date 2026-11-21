/**
 * One frame profiler for every game (corpus brief 05): named timers, the frame interval from display ticks,
 * the GPU's own time where the browser exposes it, the JS heap where it is readable, GL counters, an overlay
 * and one export format, `game-engine-profile/1`.
 *
 * Each game makes one `FrameProfile` at boot and calls `beginFrame()`/`endFrame()` around the frame it
 * draws. Everything is behind `?profile`: a profile created with `enabled: false` creates no timer query,
 * keeps no samples, schedules no animation frame and leaves the GL context untouched.
 *
 * Display ticks come from the profile's own `requestAnimationFrame` loop, not the game's: they measure what
 * the display shows even in a game whose loop is not paced by it (Farm until brief 08).
 */
import { effectiveDpr } from "../render/dpr";
import {
  SampleRing,
  percentile,
  summarizeFramesDrawn,
  summarizeIntervals,
  type FrameIntervalStats,
  type FramesDrawnStats,
} from "./frame-stats";
import { installGlCounters, type GlCounters } from "./gl-counters";
import { GpuTimer } from "./gpu-timer";
import { DebugOverlay, type OverlayCorner } from "./overlay";
import { Profiler } from "./profiler";

export const PROFILE_SCHEMA = "game-engine-profile/1";

/** Samples kept per series: two minutes at 60 Hz, enough for any bench run. */
const SAMPLE_CAPACITY = 7200;
/** Heap readings kept: ten minutes at one a second. */
const HEAP_CAPACITY = 600;
/** How often the overlay's numbers are recomputed, in frames drawn. */
const OVERLAY_EVERY_FRAMES = 30;

export interface TimerSummary {
  count: number;
  mean: number;
  p95: number;
}

export interface CounterSummary {
  mean: number;
  p95: number;
}

export interface GpuStats {
  frames: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  /** Results dropped because the GPU reported a disjoint event. */
  dropped: number;
  /** Frames not timed because too many queries were in flight. */
  skipped: number;
}

export interface HeapSample {
  /** Milliseconds since the profile started or was last reset. */
  tMs: number;
  usedBytes: number;
}

export interface HeapStats {
  samples: HeapSample[];
  /** Readings lower than the one before: each marks a garbage collection. */
  drops: number;
}

export interface ProfileCounters {
  /** Sprite draw groups in the main pass (2D renderer). */
  drawGroups: CounterSummary | null;
  /** GL draw calls of every kind, per frame. */
  glDrawCalls: CounterSummary | null;
  /** Instances drawn per frame (an un-instanced draw counts one). */
  drawInstances: CounterSummary | null;
  /** Screen-space UI quads flushed per frame (2D renderer). */
  uiQuads: CounterSummary | null;
  /** Bytes `texImage2D`/`texSubImage2D` uploaded per frame. */
  textureBytesPerFrame: CounterSummary | null;
  /** Bytes uploaded since the profile was created, boot uploads included. */
  textureBytesTotal: number;
  textureUploads: number;
  texturesCreated: number;
}

export interface GameEngineProfile {
  schema: typeof PROFILE_SCHEMA;
  game: string;
  build: string;
  url: string | null;
  seed: number | string | null;
  collectedAt: string;
  userAgent: string | null;
  device: {
    renderer: string | null;
    vendor: string | null;
    /** The ratio the engine scales backing stores by (capped, see render/dpr.ts). */
    dpr: number;
    devicePixelRatio: number;
    canvas: { width: number; height: number; clientWidth: number; clientHeight: number } | null;
  };
  frames: {
    /** From the first display tick sampled to the last. */
    durationMs: number;
    displayTicks: number;
    interval: FrameIntervalStats;
    drawn: FramesDrawnStats;
  };
  gpu: GpuStats | "unavailable";
  heap: HeapStats | "unavailable";
  timers: Record<string, TimerSummary>;
  counters: ProfileCounters;
  /** Game-specific fields (Farm's run, camera and worker profile). */
  extra?: Record<string, unknown>;
}

/** Per-frame counts a game reads off its renderer and hands to `endFrame`. */
export interface FrameCounts {
  drawGroups?: number | undefined;
  uiQuads?: number | undefined;
}

export interface FrameProfileOptions {
  /** `farm`, `citadel`, `hollow` or `mathquest`. Also names the downloaded file. */
  game: string;
  enabled: boolean;
  /** The game's WebGL2 canvas. Its existing context is read for the GPU timer, counters and device info. */
  canvas?: HTMLCanvasElement | null;
  /** The build the page came from, for example `import.meta.env.MODE`. */
  build?: string;
  seed?: number | string | null;
  /** An overlay the game already draws and updates itself (Farm, Citadel). */
  overlay?: DebugOverlay;
  /** Where to mount an overlay the profile owns and updates once per frame drawn (Hollow, MateQuest). */
  overlayParent?: HTMLElement;
  overlayCorner?: OverlayCorner;
  /** When true (the default), `endFrame` records the frame's CPU time as the `frame` timer. */
  recordFrameTimer?: boolean;
  // Test seams.
  gl?: WebGL2RenderingContext | null;
  requestFrame?: (cb: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
  now?: () => number;
  heapBytes?: () => number | null;
}

interface Live {
  intervals: SampleRing;
  cpu: SampleRing;
  gpu: SampleRing;
  heap: HeapSample[];
  heapDrops: number;
  counters: Profiler;
  glCounters: GlCounters | null;
  gpuTimer: GpuTimer | null;
}

function defaultHeapBytes(): number | null {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
  return typeof memory?.usedJSHeapSize === "number" ? memory.usedJSHeapSize : null;
}

function counterSummary(profiler: Profiler, key: string): CounterSummary | null {
  const s = profiler.stats(key);
  return s === null ? null : { mean: s.mean, p95: s.p95 };
}

function rendererInfo(gl: WebGL2RenderingContext | null): { renderer: string | null; vendor: string | null } {
  if (gl === null) return { renderer: null, vendor: null };
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info") as {
      UNMASKED_RENDERER_WEBGL: number;
      UNMASKED_VENDOR_WEBGL: number;
    } | null;
    if (ext !== null) {
      return {
        renderer: String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)),
        vendor: String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)),
      };
    }
    return { renderer: String(gl.getParameter(gl.RENDERER)), vendor: String(gl.getParameter(gl.VENDOR)) };
  } catch {
    return { renderer: null, vendor: null };
  }
}

/** Saves a profile as a JSON download named for the game, the seed and the time. */
export function downloadProfile(data: GameEngineProfile, name = "profile"): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = data.collectedAt.replace(/[:.]/g, "-");
  const seed = data.seed === null ? "" : `-seed-${typeof data.seed === "number" ? data.seed.toString(16) : data.seed}`;
  a.href = url;
  a.download = `${data.game}-${name}${seed}-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export class FrameProfile {
  readonly enabled: boolean;
  readonly game: string;
  /** The game's named timers (`interp`, `ui.draw`, …). A disabled profiler records nothing. */
  readonly timers: Profiler;

  private readonly live: Live | null;
  private readonly canvas: HTMLCanvasElement | null;
  private readonly gl: WebGL2RenderingContext | null;
  private readonly build: string;
  private seed: number | string | null;
  private readonly recordFrameTimer: boolean;
  private readonly requestFrame: (cb: FrameRequestCallback) => number;
  private readonly cancelFrame: (handle: number) => void;
  private readonly now: () => number;
  private readonly heapBytes: () => number | null;
  private overlay: DebugOverlay | null;
  private readonly ownsOverlay: boolean;
  private extra: (() => Record<string, unknown>) | null = null;

  private rafHandle: number | null = null;
  private running = false;
  private lastTickTs: number | null = null;
  private firstTickTs: number | null = null;
  private displayTicks = 0;
  private lastHeapAt = Number.NEGATIVE_INFINITY;
  private resetAt = 0;
  private cpuStart = 0;
  private framesDrawn = 0;
  private firstDrawnAt: number | null = null;
  private lastDrawnAt = 0;

  constructor(opts: FrameProfileOptions) {
    this.enabled = opts.enabled;
    this.game = opts.game;
    this.timers = new Profiler({ enabled: opts.enabled, capacity: SAMPLE_CAPACITY });
    this.canvas = opts.canvas ?? null;
    this.build = opts.build ?? "unknown";
    this.seed = opts.seed ?? null;
    this.recordFrameTimer = opts.recordFrameTimer ?? true;
    this.requestFrame = opts.requestFrame ?? ((cb) => requestAnimationFrame(cb));
    this.cancelFrame = opts.cancelFrame ?? ((h) => cancelAnimationFrame(h));
    this.now = opts.now ?? (() => performance.now());
    this.heapBytes = opts.heapBytes ?? defaultHeapBytes;

    if (!opts.enabled) {
      this.live = null;
      this.gl = null;
      this.overlay = null;
      this.ownsOverlay = false;
      return;
    }

    const gl =
      opts.gl !== undefined ? opts.gl : ((this.canvas?.getContext("webgl2") as WebGL2RenderingContext | null) ?? null);
    this.gl = gl;
    this.live = {
      intervals: new SampleRing(SAMPLE_CAPACITY),
      cpu: new SampleRing(SAMPLE_CAPACITY),
      gpu: new SampleRing(SAMPLE_CAPACITY),
      heap: [],
      heapDrops: 0,
      counters: new Profiler({ enabled: true, capacity: SAMPLE_CAPACITY }),
      glCounters: gl === null ? null : installGlCounters(gl),
      gpuTimer: gl === null ? null : GpuTimer.probe(gl),
    };
    if (opts.overlay !== undefined) {
      this.overlay = opts.overlay;
      this.ownsOverlay = false;
    } else if (opts.overlayParent !== undefined) {
      this.overlay = new DebugOverlay(
        opts.overlayParent,
        opts.overlayCorner === undefined ? undefined : { corner: opts.overlayCorner },
      );
      this.ownsOverlay = true;
    } else {
      this.overlay = null;
      this.ownsOverlay = false;
    }
    this.resetAt = this.now();
  }

  /** Whether a GPU timer is running (the browser exposes `EXT_disjoint_timer_query_webgl2`). */
  get gpuAvailable(): boolean {
    return this.live !== null && this.live.gpuTimer !== null;
  }

  /** Samples held across every series. 0 for a disabled profile, which keeps none. */
  sampleCount(): number {
    const live = this.live;
    if (live === null) return 0;
    return live.intervals.length + live.cpu.length + live.gpu.length + live.heap.length;
  }

  /** Game-specific fields added to the export under `extra`. */
  setExtra(fn: () => Record<string, unknown>): void {
    this.extra = fn;
  }

  /** Sets the seed the export reports, for a game that picks it after boot (Farm's home screen). */
  setSeed(seed: number | string | null): void {
    this.seed = seed;
  }

  /**
   * Shows the profile in an overlay the game builds after boot and updates itself (Farm's panels). Call
   * before `start()`, which adds the export button. A disabled profile ignores it.
   */
  attachOverlay(overlay: DebugOverlay): void {
    if (this.live === null || this.overlay !== null) return;
    this.overlay = overlay;
  }

  /**
   * Starts the display-tick loop, `window.__exportProfile()` and the overlay's export button. A disabled
   * profile does nothing.
   */
  start(): void {
    if (this.live === null || this.running) return;
    this.running = true;
    const tick = (ts: number): void => {
      if (!this.running) return;
      this.displayTick(ts);
      this.rafHandle = this.requestFrame(tick);
    };
    this.rafHandle = this.requestFrame(tick);
    if (typeof window !== "undefined") {
      (window as unknown as { __exportProfile?: () => GameEngineProfile }).__exportProfile = () => this.exportProfile();
    }
    if (this.overlay !== null) {
      const btn = this.overlay.addButton("⤓ Export profile", () => {
        downloadProfile(this.exportProfile());
        btn.textContent = "✓ Saved";
        setTimeout(() => {
          btn.textContent = "⤓ Export profile";
        }, 1200);
      });
    }
  }

  /** Stops the loop, restores the GL context, deletes the queries and removes what `start()` added. */
  dispose(): void {
    const live = this.live;
    if (live === null) return;
    this.running = false;
    if (this.rafHandle !== null) this.cancelFrame(this.rafHandle);
    this.rafHandle = null;
    live.glCounters?.uninstall();
    live.gpuTimer?.dispose();
    if (typeof window !== "undefined") {
      delete (window as unknown as { __exportProfile?: unknown }).__exportProfile;
    }
    if (this.ownsOverlay) this.overlay?.destroy();
    this.overlay = null;
  }

  /** Records one display tick at a `requestAnimationFrame` timestamp. Exposed for tests. */
  displayTick(ts: number): void {
    const live = this.live;
    if (live === null) return;
    if (this.lastTickTs !== null) live.intervals.push(ts - this.lastTickTs);
    if (this.firstTickTs === null) this.firstTickTs = ts;
    this.lastTickTs = ts;
    this.displayTicks += 1;
    const t = this.now();
    if (t - this.lastHeapAt >= 1000) {
      this.lastHeapAt = t;
      const bytes = this.heapBytes();
      if (bytes !== null) {
        const prev = live.heap[live.heap.length - 1];
        if (prev !== undefined && bytes < prev.usedBytes) live.heapDrops += 1;
        live.heap.push({ tMs: t - this.resetAt, usedBytes: bytes });
        if (live.heap.length > HEAP_CAPACITY) live.heap.shift();
      }
    }
  }

  /** Call at the start of the frame the game draws, before its first GL call. */
  beginFrame(): void {
    const live = this.live;
    if (live === null) return;
    const gpu = live.gpuTimer;
    if (gpu !== null) {
      gpu.poll();
      for (const ms of gpu.take()) live.gpu.push(ms);
      gpu.begin();
    }
    live.glCounters?.frameReset();
    this.cpuStart = this.now();
  }

  /** Call when the frame's draw is submitted. `counts` are what the game reads off its renderer. */
  endFrame(counts?: FrameCounts): void {
    const live = this.live;
    if (live === null) return;
    live.gpuTimer?.end();
    const end = this.now();
    const cpu = end - this.cpuStart;
    live.cpu.push(cpu);
    if (this.recordFrameTimer) this.timers.add("frame", cpu);
    const gl = live.glCounters;
    if (gl !== null) {
      live.counters.add("gl.drawCalls", gl.frame.drawCalls);
      live.counters.add("gl.instances", gl.frame.instances);
      live.counters.add("gl.textureBytes", gl.frame.textureBytes);
    }
    if (counts?.drawGroups !== undefined) live.counters.add("draw.groups", counts.drawGroups);
    if (counts?.uiQuads !== undefined) live.counters.add("ui.quads", counts.uiQuads);
    if (this.firstDrawnAt === null) this.firstDrawnAt = end;
    this.lastDrawnAt = end;
    this.framesDrawn += 1;

    const overlay = this.overlay;
    if (overlay !== null) {
      if (this.framesDrawn % OVERLAY_EVERY_FRAMES === 0) {
        overlay.setFrameReport(this.timers.report());
        const interval = summarizeIntervals(live.intervals.values());
        const gpuSorted = live.gpu.values().sort();
        overlay.setFrameStats({
          p50: interval.p50,
          p95: interval.p95,
          p99: interval.p99,
          over16_7: interval.over16_7,
          over33_3: interval.over33_3,
          gpuMs: live.gpuTimer === null || gpuSorted.length === 0 ? null : percentile(gpuSorted, 0.5),
        });
      }
      if (this.ownsOverlay) overlay.update();
    }
  }

  /** Drops every sample so far: a bench calls it after its warm-up. Totals since boot are kept. */
  reset(): void {
    const live = this.live;
    if (live === null) return;
    live.intervals.clear();
    live.cpu.clear();
    live.gpu.clear();
    live.heap.length = 0;
    live.heapDrops = 0;
    live.counters.reset();
    live.gpuTimer?.take();
    this.timers.reset();
    this.lastTickTs = null;
    this.firstTickTs = null;
    this.displayTicks = 0;
    this.framesDrawn = 0;
    this.firstDrawnAt = null;
    this.lastHeapAt = Number.NEGATIVE_INFINITY;
    this.resetAt = this.now();
  }

  /** The profile in `game-engine-profile/1`. A disabled profile reports zeros and `"unavailable"`. */
  exportProfile(): GameEngineProfile {
    const live = this.live;
    const canvas = this.canvas;
    const timers: Record<string, TimerSummary> = {};
    for (const [key, s] of Object.entries(this.timers.report())) {
      timers[key] = { count: s.count, mean: s.mean, p95: s.p95 };
    }
    const intervals = live?.intervals.values() ?? new Float64Array(0);
    const gpuValues = live?.gpu.values().sort() ?? new Float64Array(0);
    const drawnSpan = this.firstDrawnAt === null ? 0 : this.lastDrawnAt - this.firstDrawnAt;
    let gpu: GpuStats | "unavailable" = "unavailable";
    if (live !== null && live.gpuTimer !== null) {
      let sum = 0;
      for (const v of gpuValues) sum += v;
      gpu = {
        frames: gpuValues.length,
        mean: gpuValues.length === 0 ? 0 : sum / gpuValues.length,
        p50: percentile(gpuValues, 0.5),
        p95: percentile(gpuValues, 0.95),
        p99: percentile(gpuValues, 0.99),
        dropped: live.gpuTimer.dropped,
        skipped: live.gpuTimer.skipped,
      };
    }
    const heapReadable = live !== null && this.heapBytes() !== null;
    const totals = live?.glCounters?.totals;
    const counters = live?.counters;
    const out: GameEngineProfile = {
      schema: PROFILE_SCHEMA,
      game: this.game,
      build: this.build,
      url: typeof location !== "undefined" ? location.href : null,
      seed: this.seed,
      collectedAt: new Date().toISOString(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      device: {
        ...rendererInfo(this.gl),
        dpr: typeof window !== "undefined" ? effectiveDpr() : 1,
        devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
        canvas:
          canvas === null
            ? null
            : {
                width: canvas.width,
                height: canvas.height,
                clientWidth: canvas.clientWidth,
                clientHeight: canvas.clientHeight,
              },
      },
      frames: {
        durationMs: this.firstTickTs === null || this.lastTickTs === null ? 0 : this.lastTickTs - this.firstTickTs,
        displayTicks: this.displayTicks,
        interval: summarizeIntervals(intervals),
        drawn: summarizeFramesDrawn(live?.cpu.values() ?? new Float64Array(0), drawnSpan),
      },
      gpu,
      heap: heapReadable && live !== null ? { samples: [...live.heap], drops: live.heapDrops } : "unavailable",
      timers,
      counters: {
        drawGroups: counters === undefined ? null : counterSummary(counters, "draw.groups"),
        glDrawCalls: counters === undefined ? null : counterSummary(counters, "gl.drawCalls"),
        drawInstances: counters === undefined ? null : counterSummary(counters, "gl.instances"),
        uiQuads: counters === undefined ? null : counterSummary(counters, "ui.quads"),
        textureBytesPerFrame: counters === undefined ? null : counterSummary(counters, "gl.textureBytes"),
        textureBytesTotal: totals?.textureBytes ?? 0,
        textureUploads: totals?.textureUploads ?? 0,
        texturesCreated: totals?.texturesCreated ?? 0,
      },
    };
    if (this.extra !== null) out.extra = this.extra();
    return out;
  }
}

/** Whether the page asked for the profiler: `?profile` in its URL. */
export function profileRequested(search: string = typeof location !== "undefined" ? location.search : ""): boolean {
  return new URLSearchParams(search).has("profile");
}
