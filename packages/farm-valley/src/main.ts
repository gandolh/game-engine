import {
  loadAtlasImage,
  Camera2D,
  Canvas2dRenderer,
  DebugOverlay,
  createNoiseGeneratorFromUrl,
  ParticleSystem,
  EDG,
} from "@engine/core";
import type { AtlasManifest } from "@engine/core";
import { pushSnapshotSprites, OCEAN_TILES, FOAM_FRAMES } from "./render-systems";
import { makeGroundNoiseDecorator } from "./render/ground-noise";
import { washFor } from "./render/day-night";
import { seasonForDay } from "./protocols/weather";
import {
  ObserverPanel,
  LeaderboardPanel,
  SlateBillboardPanel,
  PlaybackControlsPanel,
  EventFeedPanel,
  createRightColumn,
  WorldClockPanel,
} from "./ui";
import { HomeScreen, formatSeed } from "./screens";
import { WORLD_WIDTH, WORLD_HEIGHT, isWalkable } from "./world/regions";
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

// ── Debug player (WASD walkability tester) ──────────────────────────────────
// Starts at village center tile (19,19). Pure render-side — no sim involvement.
// Moves 1 tile per step; movement is throttled to ~8 steps/sec so it's readable.
const debugPlayer = {
  tileX: 19,
  tileY: 19,
  lastMoveMs: 0,
  visible: true,
};
const PLAYER_MOVE_INTERVAL_MS = 120; // ~8 tiles/sec

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
  const observer = new ObserverPanel(rightColumn);
  const leaderboardPanel = new LeaderboardPanel(app);
  const slateBillboard = new SlateBillboardPanel(app);
  const eventFeedPanel = new EventFeedPanel(rightColumn);
  const playback = new PlaybackControlsPanel(app);
  const gameOverPanel = createGameOverPanel(app);
  return {
    overlay,
    worldClock,
    observer,
    leaderboardPanel,
    slateBillboard,
    eventFeedPanel,
    playback,
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

// Keyboard: space = toggle pause, "." = step, 1/2/4 = speed. Ignore keys
// while the user is typing into an input/textarea (e.g. the seed field).
function registerHotkeys(handlers: PlaybackHandlers): void {
  const { applyPaused, applySpeed, doStep } = handlers;
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
      return;
    }
    switch (e.key) {
      case " ":
        e.preventDefault();
        applyPaused(!paused);
        break;
      case ".":
        doStep();
        break;
      case "1":
        applySpeed(1);
        break;
      case "2":
        applySpeed(2);
        break;
      case "4":
        applySpeed(4);
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
    slateBillboard, eventFeedPanel, gameOverPanel,
  } = panels;

  let lastFrameMs = performance.now();
  let gameOverShown = false;

  function renderFrame(): void {
    const nowMs = performance.now();
    const dt = Math.min((nowMs - lastFrameMs) / 1000, 0.1); // cap at 100ms
    lastFrameMs = nowMs;

    // Compute interpolated sprites once per frame — used for rendering,
    // farmer positions, and the hover tooltip.
    const interpolatedSprites = client.getInterpolatedSprites();

    // brief-11: focus-camera — update camera center each frame
    if (_camera !== null && focusedFarmerId !== null) {
      applyFocusAndPan(_camera, interpolatedSprites);
    }

    renderer.beginFrame();

    // Animated water shimmer: cycle foam frames over the in-grid ocean tiles.
    // Render-only; phase is offset per tile so the foam ripples rather than
    // blinking in unison. ~1.8 s per full A→B→C cycle. Layer 1 = on the water
    // (over the baked static ocean at layer 0, under plot dirt / entities).
    const FOAM_PERIOD_MS = 1800;
    const foamStep = nowMs / (FOAM_PERIOD_MS / FOAM_FRAMES.length);
    for (const { tx, ty } of OCEAN_TILES) {
      const phase = tx * 3 + ty * 5; // per-tile offset
      const frame = FOAM_FRAMES[(Math.floor(foamStep) + phase) % FOAM_FRAMES.length]!;
      renderer.push({
        x: tx * TILE + TILE / 2,
        y: ty * TILE + TILE / 2,
        width: TILE,
        height: TILE,
        frame,
        rotation: 0,
        layer: 1,
        alpha: 0.6,
      });
    }

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

    // ── Debug player movement (WASD) ─────────────────────────────────────
    // Throttled to PLAYER_MOVE_INTERVAL_MS so movement stays readable.
    // P toggles visibility. Checks isWalkable before every step.
    if (keyboard.justPressed("KeyP")) {
      debugPlayer.visible = !debugPlayer.visible;
    }
    if (nowMs - debugPlayer.lastMoveMs >= PLAYER_MOVE_INTERVAL_MS) {
      let dx = 0, dy = 0;
      if (keyboard.isDown("KeyW") || keyboard.isDown("ArrowUp"))    dy = -1;
      if (keyboard.isDown("KeyS") || keyboard.isDown("ArrowDown"))  dy =  1;
      if (keyboard.isDown("KeyA") || keyboard.isDown("ArrowLeft"))  dx = -1;
      if (keyboard.isDown("KeyD") || keyboard.isDown("ArrowRight")) dx =  1;
      // Prefer axis-aligned: diagonal is two key presses, process only one
      if (dx !== 0) dy = 0;
      if (dx !== 0 || dy !== 0) {
        const nx = debugPlayer.tileX + dx;
        const ny = debugPlayer.tileY + dy;
        if (nx >= 0 && nx < WORLD_WIDTH && ny >= 0 && ny < WORLD_HEIGHT && isWalkable(nx, ny)) {
          debugPlayer.tileX = nx;
          debugPlayer.tileY = ny;
        }
        debugPlayer.lastMoveMs = nowMs;
      }
    }
    keyboard.endFrame();

    // Draw the debug player on top of everything else (layer 200).
    if (debugPlayer.visible) {
      const px = debugPlayer.tileX * TILE + TILE / 2;
      const py = debugPlayer.tileY * TILE + TILE / 2;
      renderer.pushShadow(px, py + TILE * 0.35, TILE * 0.32, TILE * 0.12, 0.5);
      renderer.push({
        x: px, y: py,
        width: TILE, height: TILE,
        frame: "debug/player",
        rotation: 0,
        layer: 200,
        alpha: 1,
      });
    }

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
  let bestDist = HALF_TILE * HALF_TILE;

  for (const s of sprites) {
    if (!s.label) continue;
    const dx = s.x - wx;
    const dy = s.y - wy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist) {
      bestDist = d2;
      bestLabel = s.label;
    }
  }

  if (bestLabel !== null) {
    tooltip.textContent = bestLabel;
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
