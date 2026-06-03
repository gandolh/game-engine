import {
  loadAtlasImage,
  Camera2D,
  Canvas2dRenderer,
  DebugOverlay,
  createPathfinderFromUrl,
  createNoiseGeneratorFromUrl,
  ParticleSystem,
} from "@engine/core";
import type { AtlasManifest, Pathfinder } from "@engine/core";
import { pushSnapshotSprites } from "./render-systems";
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
} from "./ui";
import { HomeScreen, formatSeed } from "./screens";
import { WORLD_WIDTH, WORLD_HEIGHT, isWalkable } from "./world/regions";
import { Keyboard } from "@engine/core";
import { SimClient } from "./worker/sim-client";
import type { FinalStandingRow } from "./worker/snapshot";
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
  pathfinder: Pathfinder | null;
  noiseGen: import("@engine/core").NoiseGenerator | null;
  keyboard: Keyboard;
}

// brief-11: focus-camera — module-level camera interaction state
let focusedFarmerId: number | null = null;
let panOffset = { x: 0, y: 0 };
let zoom = 1;

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
function applyFocusAndPan(camera: Camera2D): void {
  let baseX: number;
  let baseY: number;
  if (focusedFarmerId !== null && _simClient !== null) {
    const pos = _simClient.getFarmerInterpolatedPos(focusedFarmerId);
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
  setupCameraListeners(canvas, camera);
  const keyboard = new Keyboard();
  keyboard.attach(window);
  const [pathfinder, noiseGen] = await Promise.all([loadPathfinder(), loadNoiseGenerator()]);
  return { renderer, pathfinder, noiseGen, keyboard };
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
    void startGame(app, fatal, runtimePromise, { seed, maxDays, ticksPerDay });
  });
}

async function startGame(
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

    const overlay = new DebugOverlay(app);
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
    let gameOverShown = false;

    // brief-16: playback — wire the controls to the worker and keep the panel
    // reflecting state. Pause/speed/step only retime when worker ticks run;
    // they never alter what a tick computes.
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

    // Keyboard: space = toggle pause, "." = step, 1/2/4 = speed. Ignore keys
    // while the user is typing into an input/textarea (e.g. the seed field).
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

    // brief-11: focus-camera — set up observer row click handler
    observer.setOnFarmerClick((id) => {
      focusedFarmerId = id;
      panOffset = { x: 0, y: 0 };
      if (_camera !== null) applyFocusAndPan(_camera);
    });

    // Receive the static-layer sprites from the worker and bake them once.
    // brief 30 — stamp subtle per-tile ground-noise into the baked layer
    // (one-time cost, deterministic on the run seed).
    // Pre-generate brightness array via WASM (8× faster than JS hash loop).
    // Falls back to JS path if WASM didn't load.
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

    // brief-18: seed badge — show the chosen seed during play (low-touch,
    // own DOM element so we don't touch the engine DebugOverlay signature).
    createSeedBadge(app, seed);

    // Particle system — lives on the main (render) thread only.
    const particles = new ParticleSystem();
    let prevGold = new Map<number, number>(); // farmerId → gold last tick
    let prevCropTotal = new Map<number, number>(); // farmerId → total crops last tick
    let lastFrameMs = performance.now();

    // Emit particles based on leaderboard diffs (gold up = sell; crop total
    // down while gold up = harvest+sell; just crop down = harvest to inventory).
    function emitParticlesFromDiff(farmerPositions: Map<number, { x: number; y: number }>): void {
      const lb = client.leaderboard;
      for (const row of lb) {
        const pos = farmerPositions.get(row.id);
        if (!pos) continue;
        const prevG = prevGold.get(row.id) ?? row.gold;
        if (row.gold > prevG) {
          // Gold increased → coin burst
          particles.emit({
            x: pos.x, y: pos.y - TILE,
            count: 8,
            shape: "star",
            color: "#f0d238", color2: "#faf0a0",
            speedMin: 10, speedMax: 35,
            angleMin: -Math.PI, angleMax: 0,
            lifetimeMin: 0.5, lifetimeMax: 1.0,
            sizeMin: 1.5, sizeMax: 3,
            gravity: 40,
          });
        }
        prevGold.set(row.id, row.gold);
      }
    }

    // Watch the snapshot for new shock events → dirt explosion.
    client.onSnapshot((snap) => {
      if (snap.shock) {
        // Shock wiped plots — emit a dramatic dirt burst from each affected farmer.
        for (const row of snap.leaderboard) {
          const pos = client.getFarmerInterpolatedPos(row.id);
          if (!pos) continue;
          particles.emit({
            x: pos.x, y: pos.y,
            count: 20,
            shape: "rect",
            color: "#8c6432", color2: "#5a3c1e",
            speedMin: 15, speedMax: 60,
            angleMin: -Math.PI, angleMax: 0,
            lifetimeMin: 0.4, lifetimeMax: 0.9,
            sizeMin: 1, sizeMax: 2.5,
            gravity: 80,
          });
        }
      }
    });

    // Start the sim worker with the run descriptor (seed from the home screen;
    // maxDays/ticksPerDay from a shared run hash or CONFIG defaults).
    client.init({
      seed,
      tickRateHz: CONFIG.tickRateHz,
      ticksPerDay,
      maxDays,
    });

    // rAF render loop — purely rendering, no sim logic.
    function renderFrame(): void {
      const nowMs = performance.now();
      const dt = Math.min((nowMs - lastFrameMs) / 1000, 0.1); // cap at 100ms
      lastFrameMs = nowMs;

      // brief-11: focus-camera — update camera center each frame
      if (_camera !== null && focusedFarmerId !== null) {
        applyFocusAndPan(_camera);
      }

      renderer.beginFrame();

      // Build a position map for all farmer sprites (for meet bubbles + halo).
      const farmerPositions = new Map<number, { x: number; y: number }>();
      for (const s of client.getInterpolatedSprites()) {
        if (s.id !== null && s.interpolate) {
          farmerPositions.set(s.id, { x: s.x, y: s.y });
        }
      }

      // Particle events: diff leaderboard to detect gold gains.
      emitParticlesFromDiff(farmerPositions);

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
                color: "#50c832", color2: "#90e850",
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
        client.getInterpolatedSprites(),
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
    "color: #f5e9c8",
    "background: rgba(20, 18, 28, 0.95)",
    "border: 2px solid #c9a85a",
    "border-radius: 8px",
    "box-shadow: 0 0 60px rgba(201, 168, 90, 0.35)",
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
    "color: #0c0d12",
    "background: #c9a85a",
    "border: 2px solid #c9a85a",
    "border-radius: 6px",
    "cursor: pointer",
  ].join(";");

  const shareStatus = document.createElement("span");
  shareStatus.style.cssText = "font: 12px/1 ui-monospace, monospace; color: #9ba6b8";

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
    "color: #c9a85a",
    "background: rgba(20, 18, 28, 0.8)",
    "border: 1px solid rgba(201, 168, 90, 0.5)",
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

async function loadPathfinder(): Promise<Pathfinder | null> {
  try {
    const pf = await createPathfinderFromUrl("/wasm/pathfinding.wasm");
    console.info("[wasm] pathfinding module loaded");
    return pf;
  } catch (err) {
    console.warn("[wasm] pathfinding module unavailable — run `npm run build-wasm`:", err);
    return null;
  }
}

function showFatal(el: HTMLElement, err: unknown): void {
  el.classList.add("visible");
  const msg = err instanceof Error ? err.message : String(err);
  el.textContent = `Failed to boot: ${msg}`;
}

void boot();
