import {
  loadAtlasImage,
  Camera2D,
  Canvas2dRenderer,
  DebugOverlay,
  Profiler,
  createNoiseGeneratorFromUrl,
  ParticleSystem,
  EDG,
} from "@engine/core";
import type { AtlasManifest } from "@engine/core";
import { pushSnapshotSprites, COASTLINE_BUBBLE_TILES, FOAM_FRAMES, FORGE_FIRE_FRAMES, FORGE_OVEN_TILE } from "./render-systems";
import { makeGroundNoiseDecorator } from "./render/ground-noise";
import { washFor } from "./render/day-night";
import { seasonForDay } from "./protocols/weather";
import {
  ObserverPanel,
  LeaderboardPanel,
  SlateBillboardPanel,
  PlaybackControlsPanel,
  HotbarPanel,
  EventFeedPanel,
  createRightColumn,
  WorldClockPanel,
} from "./ui";
import { HomeScreen, formatSeed } from "./screens";
import { HOTBAR_SLOTS } from "./systems/player-control";
import { WORLD_WIDTH, WORLD_HEIGHT } from "./world/regions";
import { Keyboard } from "@engine/core";
import { SimClient } from "./worker/sim-client";
import type { FinalStandingRow, SnapshotSprite } from "./worker/snapshot";
import { serializeRun, parseRun, type RunDescriptor } from "./run-descriptor";

interface BootConfig {
  seed: number;
  tickRateHz: number;
  ticksPerDay: number;
  maxDays: number;
}

const CONFIG: BootConfig = {
  seed: 0xc0ffee,
  tickRateHz: 20,
  // brief 27 — long days. 1200 ticks @ 20Hz = 1 real minute/day (watchable;
  // a 100-day run is ~100 min @ 1×). The Stardew target is 6000 (5 min/day);
  // it's selectable via the run hash (RunDescriptor carries ticksPerDay).
  ticksPerDay: 1200,
  maxDays: 100,
};

const TILE = 16;

// P0 profiling — opt-in via `?profile` (or `?profile=1`) on the URL. When set,
// the worker times tick + snapshot and the render loop times the frame +
// interpolation; both surface in the DebugOverlay. Diagnostic only — never
// touches sim state, so determinism is unaffected.
const PROFILE_ENABLED =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("profile");

const CAMERA_CONFIG = {
  worldUnitsX: WORLD_WIDTH * TILE,
  worldUnitsY: WORLD_HEIGHT * TILE,
  centerX: (WORLD_WIDTH * TILE) / 2,
  centerY: (WORLD_HEIGHT * TILE) / 2,
} as const;

interface Runtime {
  renderer: Canvas2dRenderer;
  noiseGen: import("@engine/core").NoiseGenerator | null;
  keyboard: Keyboard;
}

// brief-11: focus-camera — module-level camera interaction state
let focusedFarmerId: number | null = null;
let panOffset = { x: 0, y: 0 };
let zoom = 1;

// Hover tooltip — tracks raw canvas-relative mouse position in CSS pixels.
const mousePos = { x: -9999, y: -9999 };

// ── Player (Pip) input ───────────────────────────────────────────────────────
// WASD/arrows walk Pip one tile per step (throttled so movement reads cleanly);
// E performs the context-sensitive field action (selected hotbar tool) on the
// tile Pip faces; Space recenters the camera on Pip. Move/action are sent to the
// sim worker, which owns Pip as a real farmer entity. The step CADENCE now lives
// in the sim (PlayerControlSystem.PLAYER_STEP_TICKS) so movement can glide; the
// main thread just reports the held direction, resending only when it changes.
let lastPlayerMoveX: "left" | "right" | null = null;
let lastPlayerMoveY: "up" | "down" | null = null;
// The player farmer's entity id, learned from the first snapshot (the sprite
// labeled "Pip"); used to focus the camera on Pip by default.
let playerFarmerId: number | null = null;

// brief-16: playback — module-level pacing state. These only change the
// wall-clock cadence of worker ticks; sim state for a given tick count is
// unaffected (determinism preserved).
let paused = false;
let speed = 1;

// brief-11: focus-camera — wire canvas drag + scroll listeners onto the canvas
function setupCameraListeners(
  canvas: HTMLCanvasElement,
  camera: Camera2D,
): void {
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let camStartX = 0;
  let camStartY = 0;

  canvas.addEventListener("mousemove", (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = e.clientX - rect.left;
    mousePos.y = e.clientY - rect.top;
  });

  canvas.addEventListener("mouseleave", () => {
    mousePos.x = -9999;
    mousePos.y = -9999;
  });

  canvas.addEventListener("mousedown", (e: MouseEvent) => {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    camStartX = panOffset.x;
    camStartY = panOffset.y;
  });

  window.addEventListener("mousemove", (e: MouseEvent) => {
    if (!isDragging) return;
    // Convert screen-pixel delta to world-pixel delta
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scaleX = (camera.worldUnitsX / canvas.clientWidth) * dpr;
    const scaleY = (camera.worldUnitsY / canvas.clientHeight) * dpr;
    panOffset = {
      x: camStartX - (e.clientX - dragStartX) * scaleX,
      y: camStartY - (e.clientY - dragStartY) * scaleY,
    };
    applyFocusAndPan(camera);
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
  });

  canvas.addEventListener("wheel", (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    zoom = Math.max(0.5, Math.min(3, zoom + delta));
    camera.setZoom(zoom);
    applyFocusAndPan(camera);
  }, { passive: false });
}

// brief-11: focus-camera — module-level client reference for the camera getter
let _simClient: SimClient | null = null;
let _camera: Camera2D | null = null;

// brief-11: focus-camera — center + pan logic
// sprites: precomputed interpolated list for this frame; pass null to let the
// function fetch it lazily via getFarmerInterpolatedPos (e.g. drag handler).
function applyFocusAndPan(
  camera: Camera2D,
  sprites?: import("./worker/snapshot").SnapshotSprite[],
): void {
  let baseX: number;
  let baseY: number;
  if (focusedFarmerId !== null && _simClient !== null) {
    let pos: { x: number; y: number } | null = null;
    if (sprites !== undefined) {
      for (const s of sprites) {
        if (s.id === focusedFarmerId && s.interpolate) {
          pos = { x: s.x, y: s.y };
          break;
        }
      }
    } else {
      pos = _simClient.getFarmerInterpolatedPos(focusedFarmerId);
    }
    baseX = pos?.x ?? camera.centerX;
    baseY = pos?.y ?? camera.centerY;
  } else {
    baseX = (WORLD_WIDTH * TILE) / 2;
    baseY = (WORLD_HEIGHT * TILE) / 2;
  }
  camera.setCenter(baseX + panOffset.x, baseY + panOffset.y);
}

async function setupRuntime(canvas: HTMLCanvasElement): Promise<Runtime> {
  const manifest = await fetchAtlasManifest();
  const atlasImage = await loadAtlasImage(manifest);
  const camera = new Camera2D(CAMERA_CONFIG);
  _camera = camera;
  const renderer = new Canvas2dRenderer(canvas, camera);
  renderer.setAtlas(atlasImage);
  // Ocean backdrop beyond the world edge — the map is islands in an ocean, so
  // the area outside the 40×40 grid is deep water, not black.
  renderer.clearColor = EDG.blue;
  setupCameraListeners(canvas, camera);
  const keyboard = new Keyboard();
  keyboard.attach(window);
  // Stop Space / arrow keys from scrolling the page — they drive Pip's movement
  // and context action. WASD already don't scroll; we guard the rest.
  const SCROLL_KEYS = new Set([
    "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  ]);
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
    if (SCROLL_KEYS.has(e.code)) e.preventDefault();
  });
  const noiseGen = await loadNoiseGenerator();
  return { renderer, noiseGen, keyboard };
}

async function boot(): Promise<void> {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement | null;
  const app = document.getElementById("app") as HTMLElement | null;
  const fatal = document.getElementById("fatal") as HTMLElement | null;
  if (!canvas || !app || !fatal) throw new Error("Missing #canvas/#app/#fatal");

  // brief-17: save/replay — if the URL hash carries a shared run descriptor,
  // use it for this run. Lowest-touch correct option: we do NOT auto-start;
  // instead we pre-fill the home screen's seed with the shared seed (so the
  // run picker still drives the launch) and carry the shared maxDays/ticksPerDay
  // into the run. If no/invalid hash, fall back to CONFIG defaults.
  const shared = parseRun(location.hash);
  const defaultSeed = shared?.seed ?? CONFIG.seed;
  const maxDays = shared?.maxDays ?? CONFIG.maxDays;
  const ticksPerDay = shared?.ticksPerDay ?? CONFIG.ticksPerDay;

  const home = new HomeScreen(app, { defaultSeed });

  const runtimePromise = setupRuntime(canvas);
  runtimePromise.catch(() => {});

  home.onStartClicked((seed) => {
    void startGame(canvas, app, fatal, runtimePromise, { seed, maxDays, ticksPerDay });
  });
}

// ── Panel bundle ─────────────────────────────────────────────────────────────

interface Panels {
  overlay: DebugOverlay;
  worldClock: WorldClockPanel;
  observer: ObserverPanel;
  leaderboardPanel: LeaderboardPanel;
  slateBillboard: SlateBillboardPanel;
  eventFeedPanel: EventFeedPanel;
  playback: PlaybackControlsPanel;
  hotbar: HotbarPanel;
  gameOverPanel: GameOverPanel;
}

// Construct all UI panels and mount them into `app`. The observer and event
// feed share a right-edge flex column (brief 25) so they stack correctly.
function buildPanels(app: HTMLElement): Panels {
  const overlay = new DebugOverlay(app);
  const worldClock = new WorldClockPanel(app);
  // brief 25 — observer + activity feed share one fixed right-edge flex
  // column so they stack instead of overlapping; the feed reflows below the
  // observer when the "why" block expands it.
  const rightColumn = createRightColumn(app);
  // Speed/time controls now live at the TOP of the right sidebar (the bottom-
  // center spot they used to occupy is the player tool hotbar). They mount
  // first so they sit above the observer/feed in the column.
  const playback = new PlaybackControlsPanel(rightColumn);
  const observer = new ObserverPanel(rightColumn);
  const leaderboardPanel = new LeaderboardPanel(app);
  const slateBillboard = new SlateBillboardPanel(app);
  const eventFeedPanel = new EventFeedPanel(rightColumn);
  // Player tool hotbar — bottom-center, where the playback controls used to be.
  const hotbar = new HotbarPanel(app);
  const gameOverPanel = createGameOverPanel(app);
  return {
    overlay,
    worldClock,
    observer,
    leaderboardPanel,
    slateBillboard,
    eventFeedPanel,
    playback,
    hotbar,
    gameOverPanel,
  };
}

// ── Playback controls ────────────────────────────────────────────────────────

interface PlaybackHandlers {
  applyPaused: (next: boolean) => void;
  applySpeed: (next: number) => void;
  doStep: () => void;
}

// brief-16: playback — wire the controls to the worker and keep the panel
// reflecting state. Pause/speed/step only retime when worker ticks run;
// they never alter what a tick computes.
function wirePlayback(
  playback: PlaybackControlsPanel,
  client: SimClient,
): PlaybackHandlers {
  function applyPaused(next: boolean): void {
    paused = next;
    client.setPaused(paused);
    playback.update({ paused, speed });
  }
  function applySpeed(next: number): void {
    speed = next;
    client.setSpeed(speed);
    playback.update({ paused, speed });
  }
  function doStep(): void {
    // Step only makes sense while paused.
    if (!paused) return;
    client.step();
  }

  playback.setOnPause(applyPaused);
  playback.setOnSpeed(applySpeed);
  playback.setOnStep(doStep);
  playback.update({ paused, speed });

  return { applyPaused, applySpeed, doStep };
}

// Keyboard: P = toggle pause, "." = step. (Speed is set via the sidebar
// buttons; number keys 1-7 are the player's hotbar selection.) Ignore keys
// while the user is typing into an input/textarea (e.g. the seed field).
function registerHotkeys(handlers: PlaybackHandlers): void {
  const { applyPaused, doStep } = handlers;
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
      return;
    }
    switch (e.key) {
      // Pause is on "p" — Space is reserved for the player's action, and the
      // number keys 1-7 now select hotbar slots (handled in the input loop), so
      // speed is set via the sidebar buttons rather than 1/2/4 hotkeys.
      case "p":
      case "P":
        e.preventDefault();
        applyPaused(!paused);
        break;
      case ".":
        doStep();
        break;
      default:
        break;
    }
  });
}

// ── Static-layer bake ────────────────────────────────────────────────────────

// Receive the static-layer sprites from the worker and bake them once.
// brief 30 — stamp subtle per-tile ground-noise into the baked layer
// (one-time cost, deterministic on the run seed).
// Pre-generate brightness array via WASM (8× faster than JS hash loop).
// Falls back to JS path if WASM didn't load.
function bakeStaticLayer(
  client: SimClient,
  renderer: Canvas2dRenderer,
  noiseGen: import("@engine/core").NoiseGenerator | null,
  seed: number,
): void {
  const wasmBrightness = noiseGen
    ? noiseGen.fillNoise(
        Math.ceil(WORLD_WIDTH * TILE / TILE),  // cols = WORLD_WIDTH
        Math.ceil(WORLD_HEIGHT * TILE / TILE), // rows = WORLD_HEIGHT
        seed,
        0.12, // GROUND_NOISE_AMPLITUDE
      )
    : undefined;
  const groundNoise = makeGroundNoiseDecorator(seed, TILE, 0.12, wasmBrightness);
  client.onStaticLayer((msg) => {
    renderer.bakeStaticLayer(
      msg.sprites,
      msg.worldWidthPx,
      msg.worldHeightPx,
      groundNoise,
    );
    // Animated water surface tiles the ocean frame under the (ocean-less) static
    // layer. Baked here once the atlas + world size are known. pixelScale 3 →
    // chunky 3×-bigger wave pixels that survive the downscale when zoomed out
    // (at zoom 0.5 a 1px ripple aliases into noise; a 3px one still reads).
    renderer.bakeWaterPattern("tile/ocean", TILE, 3);
  });
}

// ── Particle director ────────────────────────────────────────────────────────

// Manages coin-burst and shock-explosion particle events. Tracks prevGold
// internally so callers only need to pass the current frame's farmer positions.
class ParticleDirector {
  private readonly particles: ParticleSystem;
  private readonly client: SimClient;
  private prevGold = new Map<number, number>(); // farmerId → gold last tick

  constructor(particles: ParticleSystem, client: SimClient) {
    this.particles = particles;
    this.client = client;

    // Watch the snapshot for new shock events → dirt explosion.
    client.onSnapshot((snap) => {
      // Learn Pip's entity id once (the farmer sprite labeled "Pip") and focus
      // the camera on it by default so the player starts looking at themselves.
      if (playerFarmerId === null) {
        for (const s of snap.sprites) {
          if (s.id !== null && s.interpolate && s.label === "Pip") {
            playerFarmerId = s.id;
            if (focusedFarmerId === null) {
              focusedFarmerId = s.id;
              panOffset = { x: 0, y: 0 };
              if (_camera !== null) applyFocusAndPan(_camera);
            }
            break;
          }
        }
      }
      if (!snap.shock) return;
      // Shock wiped plots — emit a dramatic dirt burst from each affected farmer.
      for (const row of snap.leaderboard) {
        const pos = client.getFarmerInterpolatedPos(row.id);
        if (!pos) continue;
        this.particles.emit({
          x: pos.x, y: pos.y,
          count: 20,
          shape: "rect",
          color: EDG.wood, color2: EDG.woodDark,
          speedMin: 15, speedMax: 60,
          angleMin: -Math.PI, angleMax: 0,
          lifetimeMin: 0.4, lifetimeMax: 0.9,
          sizeMin: 1, sizeMax: 2.5,
          gravity: 80,
        });
      }
    });
  }

  // Emit a coin-burst particle when a farmer's gold total increases.
  emitFromDiff(farmerPositions: Map<number, { x: number; y: number }>): void {
    const lb = this.client.leaderboard;
    for (const row of lb) {
      const pos = farmerPositions.get(row.id);
      if (!pos) continue;
      const prevG = this.prevGold.get(row.id) ?? row.gold;
      if (row.gold > prevG) {
        // Gold increased → coin burst
        this.particles.emit({
          x: pos.x, y: pos.y - TILE,
          count: 8,
          shape: "star",
          color: EDG.gold, color2: EDG.yellow,
          speedMin: 10, speedMax: 35,
          angleMin: -Math.PI, angleMax: 0,
          lifetimeMin: 0.5, lifetimeMax: 1.0,
          sizeMin: 1.5, sizeMax: 3,
          gravity: 40,
        });
      }
      this.prevGold.set(row.id, row.gold);
    }
  }
}

// ── Render loop ──────────────────────────────────────────────────────────────

interface RenderLoopDeps {
  client: SimClient;
  renderer: Canvas2dRenderer;
  keyboard: Keyboard;
  particles: ParticleSystem;
  particleDirector: ParticleDirector;
  canvas: HTMLCanvasElement;
  panels: Panels;
  tooltip: HTMLElement;
  seed: number;
  maxDays: number;
  ticksPerDay: number;
}

// Returns the `renderFrame` callback to pass directly to requestAnimationFrame.
// All mutable frame state (lastFrameMs, gameOverShown) is owned inside this
// closure, keeping it out of startGame's scope without changing semantics.
function createRenderLoop(deps: RenderLoopDeps): () => void {
  const {
    client, renderer, keyboard, particles, particleDirector,
    canvas, panels, tooltip, seed, maxDays, ticksPerDay,
  } = deps;
  const {
    overlay, worldClock, observer, leaderboardPanel,
    slateBillboard, eventFeedPanel, hotbar, gameOverPanel,
  } = panels;

  let lastFrameMs = performance.now();
  let gameOverShown = false;

  // P0 profiling — main-thread sampler for the frame + interpolation cost. The
  // worker reports its own tick/snapshot timings via client.onProfile below.
  const frameProfiler = new Profiler({ enabled: PROFILE_ENABLED });
  if (PROFILE_ENABLED) {
    client.setProfiling(true);
    client.onProfile((_tick, report) => overlay.setWorkerReport(report));
  }
  // Emit the main-thread frame report to the overlay periodically (every ~60
  // frames) so the numbers tick over without per-frame string churn.
  let frameReportCounter = 0;

  function renderFrame(): void {
    const frameStart = performance.now();
    const nowMs = frameStart;
    const dt = Math.min((nowMs - lastFrameMs) / 1000, 0.1); // cap at 100ms
    lastFrameMs = nowMs;

    // Compute interpolated sprites once per frame — used for rendering,
    // farmer positions, and the hover tooltip. Timed separately (T1.2 target).
    const interpolatedSprites = frameProfiler.time("interp", () =>
      client.getInterpolatedSprites(),
    );

    // brief-11: focus-camera — update camera center each frame
    if (_camera !== null && focusedFarmerId !== null) {
      applyFocusAndPan(_camera, interpolatedSprites);
    }

    renderer.beginFrame();

    // Animated water surface (brief: water rendering perf). The whole ocean is
    // ONE tiling pattern filled by the renderer under the static islands; we
    // just advance its scroll offset here so the water flows. sin/cos drift
    // gives a gentle, non-linear current rather than a constant slide. Render-
    // only (no determinism impact). This replaces the old ~5k-draws/frame foam
    // grid — the open sea is now a single fillRect.
    const t = nowMs / 1000;
    const WATER_DRIFT = TILE * 0.6; // peak scroll amplitude, world px
    renderer.setWaterScroll(
      Math.sin(t * 0.25) * WATER_DRIFT,
      Math.cos(t * 0.17) * WATER_DRIFT,
    );

    // Sparse foam bubbles at the coastline only, culled to the visible camera
    // rect (plus a 1-tile margin). Tens of draws instead of one per water cell.
    // Phase offset per tile so bubbles pop out of sync; ~1.8 s A→B→C cycle.
    //
    // Zoom-aware density: when zoomed out the viewport cull stops helping (the
    // whole archipelago is on screen) AND a 16px bubble shrinks to a few pixels
    // that don't read — so we thin them by a stride that grows as zoom drops.
    // The chunky water pattern carries the surface at far zoom; bubbles return
    // to full density as you zoom in. Keeps far-zoom frame time flat.
    const zoom = _camera!.zoom;
    const bubbleStride = zoom >= 1 ? 1 : zoom >= 0.75 ? 2 : zoom >= 0.6 ? 3 : 4;
    const FOAM_PERIOD_MS = 1800;
    const foamStep = nowMs / (FOAM_PERIOD_MS / FOAM_FRAMES.length);
    const viewLeft = _camera!.centerX - _camera!.worldUnitsX / 2 - TILE;
    const viewRight = _camera!.centerX + _camera!.worldUnitsX / 2 + TILE;
    const viewTop = _camera!.centerY - _camera!.worldUnitsY / 2 - TILE;
    const viewBottom = _camera!.centerY + _camera!.worldUnitsY / 2 + TILE;
    for (let i = 0; i < COASTLINE_BUBBLE_TILES.length; i++) {
      if (i % bubbleStride !== 0) continue; // thin out at low zoom
      const { tx, ty } = COASTLINE_BUBBLE_TILES[i]!;
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      if (cx < viewLeft || cx > viewRight || cy < viewTop || cy > viewBottom) continue;
      const phase = tx * 3 + ty * 5; // per-tile offset
      const frame = FOAM_FRAMES[(Math.floor(foamStep) + phase) % FOAM_FRAMES.length]!;
      renderer.push({
        x: cx,
        y: cy,
        width: TILE,
        height: TILE,
        frame,
        rotation: 0,
        layer: 1,
        alpha: 0.6,
      });
    }

    // Animated forge fire in the blacksmith oven's mouth. Layer 41 = just above
    // the oven body (layer 40), below the NPC (50). ~0.4 s per A→B→C flicker.
    const FIRE_PERIOD_MS = 420;
    const fireFrame = FORGE_FIRE_FRAMES[
      Math.floor(nowMs / (FIRE_PERIOD_MS / FORGE_FIRE_FRAMES.length)) % FORGE_FIRE_FRAMES.length
    ]!;
    renderer.push({
      x: FORGE_OVEN_TILE.x * TILE + TILE / 2,
      y: FORGE_OVEN_TILE.y * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: fireFrame,
      rotation: 0,
      layer: 41,
      alpha: 1,
    });

    // Build a position map for all farmer sprites (for meet bubbles + halo).
    const farmerPositions = new Map<number, { x: number; y: number }>();
    for (const s of interpolatedSprites) {
      if (s.id !== null && s.interpolate) {
        farmerPositions.set(s.id, { x: s.x, y: s.y });
      }
    }

    // Particle events: diff leaderboard to detect gold gains.
    particleDirector.emitFromDiff(farmerPositions);

    // Emit ambient leaf/sparkle particles from crop plots (slow rate).
    if (Math.random() < 0.15) {
      const snap = client.latestSnapshot();
      if (snap) {
        for (const s of snap.sprites) {
          if (s.id === null && s.frame.includes("/mature") && Math.random() < 0.05) {
            particles.emit({
              x: s.x + (Math.random() - 0.5) * 8,
              y: s.y - 4,
              count: 1,
              shape: "circle",
              color: EDG.green, color2: EDG.green,
              speedMin: 3, speedMax: 8,
              angleMin: -Math.PI * 0.8, angleMax: -Math.PI * 0.2,
              lifetimeMin: 0.8, lifetimeMax: 1.4,
              sizeMin: 1, sizeMax: 2,
              gravity: -5,
            });
          }
        }
      }
    }

    particles.update(dt);

    pushSnapshotSprites(
      renderer,
      interpolatedSprites,
      client.meets,
      farmerPositions,
      focusedFarmerId,
      nowMs,
    );

    // ── Player (Pip) input → sim worker ──────────────────────────────────
    // WASD/arrows set the HELD move direction; the sim (PlayerControlSystem)
    // owns the step cadence and glides Pip between tiles, so we just report which
    // direction is held and let the worker pace it. E requests the context field
    // action (selected hotbar tool) on the tile Pip faces; Space recenters the
    // camera back on Pip. The worker owns Pip as a real farmer entity.
    {
      // Two independent axes so holding two keys (e.g. W+A) moves diagonally.
      // Opposite keys cancel (first-checked wins, then overridden — net: the
      // last branch that matches sets the axis, so down-beats-up / right-beats-
      // left when both are held; harmless, the player isn't pressing both).
      let moveX: "left" | "right" | null = null;
      let moveY: "up" | "down" | null = null;
      if (keyboard.isDown("KeyW") || keyboard.isDown("ArrowUp"))         moveY = "up";
      if (keyboard.isDown("KeyS") || keyboard.isDown("ArrowDown"))       moveY = "down";
      if (keyboard.isDown("KeyA") || keyboard.isDown("ArrowLeft"))       moveX = "left";
      if (keyboard.isDown("KeyD") || keyboard.isDown("ArrowRight"))      moveX = "right";
      // Space recenters the camera on Pip (clears any pan/observer focus).
      if (keyboard.justPressed("Space") && playerFarmerId !== null) {
        focusedFarmerId = playerFarmerId;
        panOffset = { x: 0, y: 0 };
        if (_camera !== null) applyFocusAndPan(_camera);
      }
      // E fires the selected hotbar tool's action once per key press.
      const action = keyboard.justPressed("KeyE");
      // Number keys 1-7 select a hotbar slot (Digit1→slot 0, … Digit7→slot 6).
      let selectSlot: number | null = null;
      for (let n = 1; n <= HOTBAR_SLOTS.length && n <= 9; n++) {
        if (keyboard.justPressed(`Digit${n}`)) {
          selectSlot = n - 1;
          break;
        }
      }
      // Send when either held axis CHANGES (incl. press→null on release, so the
      // worker stops Pip), or on any discrete action/slot event. Avoids flooding
      // the worker with an identical held-dir message every frame.
      if (
        moveX !== lastPlayerMoveX ||
        moveY !== lastPlayerMoveY ||
        action ||
        selectSlot !== null
      ) {
        client.sendInput(moveX, moveY, action, selectSlot);
        lastPlayerMoveX = moveX;
        lastPlayerMoveY = moveY;
      }
    }
    keyboard.endFrame();

    // Hover tooltip: convert CSS mouse position → world pixels → find nearest
    // labeled sprite within half-a-tile radius.
    updateTooltip(tooltip, canvas, interpolatedSprites, _camera);

    // brief 26 — day/night + seasonal color wash (render-only, tick-synced;
    // looks right now that days are long, brief 27).
    const wash = washFor({
      tick: client.tick,
      ticksPerDay,
      season: seasonForDay(client.day),
    });
    renderer.endFrame(wash, particles);

    // UI updates.
    const snap = client.latestSnapshot();
    const tick = client.tick;
    overlay.update({ tick, alpha: 0, entityCount: client.entityCount });

    worldClock.update({ tick: client.tick, ticksPerDay, day: client.day });

    const obs = client.observer;
    if (obs !== null) observer.update(obs);

    leaderboardPanel.update(client.leaderboard);
    slateBillboard.update(client.slate);
    eventFeedPanel.update(client.events);
    hotbar.update(client.playerHotbar);

    // Game over — show once.
    if (client.gameOver && !gameOverShown) {
      gameOverShown = true;
      const final = client.finalSummary;
      if (final !== null) {
        renderGameOver(gameOverPanel, final, snap?.day ?? 0, {
          seed,
          maxDays,
          ticksPerDay,
        });
      }
    }

    // P0 — record total frame cost and refresh the overlay's frame report
    // periodically (string formatting every frame would itself be noise).
    if (PROFILE_ENABLED) {
      frameProfiler.add("frame", performance.now() - frameStart);
      frameReportCounter += 1;
      if (frameReportCounter >= 60) {
        frameReportCounter = 0;
        overlay.setFrameReport(frameProfiler.report());
      }
    }

    requestAnimationFrame(renderFrame);
  }

  return renderFrame;
}

// ── startGame orchestrator ───────────────────────────────────────────────────

async function startGame(
  canvas: HTMLCanvasElement,
  app: HTMLElement,
  fatal: HTMLElement,
  runtimePromise: Promise<Runtime>,
  run: { seed: number; maxDays: number; ticksPerDay: number },
): Promise<void> {
  const { seed, maxDays, ticksPerDay } = run;
  try {
    const { renderer, noiseGen, keyboard } = await runtimePromise;

    const client = new SimClient();
    _simClient = client;

    const panels = buildPanels(app);
    const { observer, playback } = panels;

    const playbackHandlers = wirePlayback(playback, client);
    registerHotkeys(playbackHandlers);

    // brief-11: focus-camera — set up observer row click handler
    observer.setOnFarmerClick((id) => {
      focusedFarmerId = id;
      panOffset = { x: 0, y: 0 };
      if (_camera !== null) applyFocusAndPan(_camera);
    });

    bakeStaticLayer(client, renderer, noiseGen, seed);

    // brief-18: seed badge — show the chosen seed during play (low-touch,
    // own DOM element so we don't touch the engine DebugOverlay signature).
    createSeedBadge(app, seed);

    const tooltip = createTooltip(app);

    const particles = new ParticleSystem();
    const particleDirector = new ParticleDirector(particles, client);

    // Start the sim worker with the run descriptor (seed from the home screen;
    // maxDays/ticksPerDay from a shared run hash or CONFIG defaults).
    client.init({
      seed,
      tickRateHz: CONFIG.tickRateHz,
      ticksPerDay,
      maxDays,
    });

    const renderFrame = createRenderLoop({
      client, renderer, keyboard, particles, particleDirector,
      canvas, panels, tooltip, seed, maxDays, ticksPerDay,
    });

    requestAnimationFrame(renderFrame);
  } catch (err) {
    showFatal(fatal, err);
    throw err;
  }
}

/** Game-over panel parts: the outer panel, the monospace standings text node,
 *  and the "Share this run" button (whose handler is (re)bound per run). */
interface GameOverPanel {
  panel: HTMLElement;
  standings: HTMLElement;
  shareBtn: HTMLButtonElement;
  shareStatus: HTMLElement;
}

function createGameOverPanel(parent: HTMLElement): GameOverPanel {
  const panel = document.createElement("div");
  panel.style.cssText = [
    "position: absolute",
    "left: 50%",
    "top: 50%",
    "transform: translate(-50%, -50%)",
    "min-width: 480px",
    "padding: 24px 32px",
    "font: 13px/1.5 ui-monospace, monospace",
    `color: ${EDG.cream}`,
    "background: rgba(24, 20, 37, 0.95)", // EDG.black
    `border: 2px solid ${EDG.tan}`,
    "border-radius: 8px",
    "box-shadow: 0 0 60px rgba(228, 166, 114, 0.35)", // EDG.tan
    "z-index: 200",
    "display: none",
  ].join(";");

  // Standings text keeps the monospace pre layout it always had.
  const standings = document.createElement("div");
  standings.style.cssText = "white-space: pre";
  panel.appendChild(standings);

  // brief-17: save/replay — "Share this run" control row.
  const shareRow = document.createElement("div");
  shareRow.style.cssText = [
    "display: flex",
    "align-items: center",
    "gap: 12px",
    "margin-top: 18px",
  ].join(";");

  const shareBtn = document.createElement("button");
  shareBtn.type = "button";
  shareBtn.textContent = "Share this run";
  shareBtn.style.cssText = [
    "padding: 8px 18px",
    "font: 13px/1 ui-monospace, monospace",
    "font-weight: 600",
    `color: ${EDG.black}`,
    `background: ${EDG.tan}`,
    `border: 2px solid ${EDG.tan}`,
    "border-radius: 6px",
    "cursor: pointer",
  ].join(";");

  const shareStatus = document.createElement("span");
  shareStatus.style.cssText = `font: 12px/1 ui-monospace, monospace; color: ${EDG.steel}`;

  shareRow.appendChild(shareBtn);
  shareRow.appendChild(shareStatus);
  panel.appendChild(shareRow);

  parent.appendChild(panel);
  return { panel, standings, shareBtn, shareStatus };
}

function createSeedBadge(parent: HTMLElement, seed: number): HTMLElement {
  const badge = document.createElement("div");
  badge.textContent = `seed ${formatSeed(seed)}`;
  badge.style.cssText = [
    "position: absolute",
    "right: 12px",
    "bottom: 12px",
    "padding: 4px 10px",
    "font: 12px/1 ui-monospace, monospace",
    `color: ${EDG.tan}`,
    "background: rgba(24, 20, 37, 0.8)", // EDG.black
    "border: 1px solid rgba(228, 166, 114, 0.5)", // EDG.tan
    "border-radius: 5px",
    "z-index: 150",
    "pointer-events: none",
  ].join(";");
  parent.appendChild(badge);
  return badge;
}

function renderGameOver(
  panel: GameOverPanel,
  rows: FinalStandingRow[],
  finalDay: number,
  run: RunDescriptor,
): void {
  const lines: string[] = [];
  lines.push(`╔══ FARM VALLEY — final standings after ${finalDay} days ══╗`);
  lines.push(`  Run #${(run.seed >>> 0).toString(16)}  (seed ${formatSeed(run.seed)})`);
  lines.push("");
  lines.push("  rank  name      personality      gold  unsold  total   crops");
  lines.push("  " + "─".repeat(60));
  rows.forEach((r, i) => {
    const cropStr = `r${r.crops.radish} w${r.crops.wheat} p${r.crops.pumpkin}`;
    lines.push(
      `  ${String(i + 1).padEnd(5)} ${r.name.padEnd(9)} ${r.personality.padEnd(15)} ${String(r.gold).padStart(5)}  ${String(r.unsoldValue).padStart(5)}  ${String(r.totalValue).padStart(5)}   ${cropStr}`,
    );
  });
  lines.push("");
  lines.push(`  winner: ${rows[0]?.name ?? "—"} (${rows[0]?.totalValue ?? 0}g total value)`);
  panel.standings.textContent = lines.join("\n");

  // brief-17: save/replay — wire the Share button for this finished run.
  panel.shareBtn.onclick = () => {
    const serialized = serializeRun(run);
    location.hash = "run=" + serialized;
    const url = location.href;
    const clip = navigator.clipboard;
    if (clip && typeof clip.writeText === "function") {
      clip.writeText(url).then(
        () => {
          panel.shareStatus.textContent = "copied URL to clipboard";
        },
        () => {
          panel.shareStatus.textContent = "URL in address bar (copy failed)";
        },
      );
    } else {
      panel.shareStatus.textContent = "URL in address bar";
    }
  };

  panel.panel.style.display = "block";
}

function createTooltip(parent: HTMLElement): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = [
    "position: absolute",
    "padding: 3px 8px",
    "font: 11px/1.4 ui-monospace, monospace",
    `color: ${EDG.cream}`,
    "background: rgba(24, 20, 37, 0.88)", // EDG.black
    "border: 1px solid rgba(228, 166, 114, 0.6)", // EDG.tan
    "border-radius: 4px",
    "pointer-events: none",
    "z-index: 180",
    "display: none",
    "white-space: nowrap",
  ].join(";");
  parent.appendChild(el);
  return el;
}

function updateTooltip(
  tooltip: HTMLElement,
  canvas: HTMLCanvasElement,
  sprites: SnapshotSprite[],
  camera: Camera2D | null,
): void {
  if (camera === null || mousePos.x < 0) {
    tooltip.style.display = "none";
    return;
  }

  // Convert CSS pixel mouse position to world pixels via the camera viewport.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scaleX = (camera.worldUnitsX / canvas.clientWidth) * dpr;
  const scaleY = (camera.worldUnitsY / canvas.clientHeight) * dpr;
  const wx = mousePos.x * scaleX + (camera.centerX - camera.worldUnitsX / 2);
  const wy = mousePos.y * scaleY + (camera.centerY - camera.worldUnitsY / 2);

  const HALF_TILE = TILE / 2;
  let bestLabel: string | null = null;
  let bestDescription: string | null = null;
  let bestDist = HALF_TILE * HALF_TILE;

  for (const s of sprites) {
    if (!s.label) continue;
    const dx = s.x - wx;
    const dy = s.y - wy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist) {
      bestDist = d2;
      bestLabel = s.label;
      bestDescription = s.description ?? null;
    }
  }

  if (bestLabel !== null) {
    // Title line (bold) + optional description line beneath it.
    tooltip.replaceChildren();
    const title = document.createElement("div");
    title.textContent = bestLabel;
    title.style.fontWeight = "700";
    tooltip.appendChild(title);
    if (bestDescription !== null) {
      const desc = document.createElement("div");
      desc.textContent = bestDescription;
      desc.style.fontWeight = "400";
      desc.style.opacity = "0.85";
      desc.style.marginTop = "2px";
      desc.style.maxWidth = "220px";
      desc.style.whiteSpace = "normal";
      tooltip.appendChild(desc);
    }
    tooltip.style.display = "block";
    // Position just above and to the right of the cursor.
    tooltip.style.left = `${mousePos.x + 12}px`;
    tooltip.style.top = `${mousePos.y - 20}px`;
  } else {
    tooltip.style.display = "none";
  }
}

async function fetchAtlasManifest(): Promise<AtlasManifest> {
  const res = await fetch("/atlas/main.json");
  if (!res.ok) throw new Error(`Atlas manifest fetch failed: ${res.status}`);
  return (await res.json()) as AtlasManifest;
}

async function loadNoiseGenerator(): Promise<import("@engine/core").NoiseGenerator | null> {
  try {
    const gen = await createNoiseGeneratorFromUrl("/wasm/noise.wasm");
    console.info("[wasm] noise module loaded");
    return gen;
  } catch (err) {
    console.warn("[wasm] noise module unavailable:", err);
    return null;
  }
}

function showFatal(el: HTMLElement, err: unknown): void {
  el.classList.add("visible");
  const msg = err instanceof Error ? err.message : String(err);
  el.textContent = `Failed to boot: ${msg}`;
}

void boot();
