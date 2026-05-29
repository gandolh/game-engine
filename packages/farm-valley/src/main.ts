import {
  loadAtlasImage,
  Camera2D,
  Canvas2dRenderer,
  DebugOverlay,
  createPathfinderFromUrl,
} from "@engine/core";
import type { AtlasManifest, Pathfinder } from "@engine/core";
import { pushSnapshotSprites } from "./render-systems";
import {
  ObserverPanel,
  LeaderboardPanel,
  SlateBillboardPanel,
  PlaybackControlsPanel,
} from "./ui";
import { HomeScreen, formatSeed } from "./screens";
import { WORLD_WIDTH, WORLD_HEIGHT } from "./world/regions";
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
  ticksPerDay: 20,
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
}

// brief-11: focus-camera — module-level camera interaction state
let focusedFarmerId: number | null = null;
let panOffset = { x: 0, y: 0 };
let zoom = 1;

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
  const pathfinder = await loadPathfinder();
  return { renderer, pathfinder };
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
    const { renderer } = await runtimePromise;

    const client = new SimClient();
    _simClient = client;

    const overlay = new DebugOverlay(app);
    const observer = new ObserverPanel(app);
    const leaderboardPanel = new LeaderboardPanel(app);
    const slateBillboard = new SlateBillboardPanel(app);
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
    client.onStaticLayer((msg) => {
      renderer.bakeStaticLayer(msg.sprites, msg.worldWidthPx, msg.worldHeightPx);
    });

    // brief-18: seed badge — show the chosen seed during play (low-touch,
    // own DOM element so we don't touch the engine DebugOverlay signature).
    createSeedBadge(app, seed);

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

      pushSnapshotSprites(
        renderer,
        client.getInterpolatedSprites(),
        client.meets,
        farmerPositions,
        focusedFarmerId,
      );

      renderer.endFrame();

      // UI updates.
      const snap = client.latestSnapshot();
      const tick = client.tick;
      overlay.update({ tick, alpha: 0, entityCount: client.entityCount });

      const obs = client.observer;
      if (obs !== null) observer.update(obs);

      leaderboardPanel.update(client.leaderboard);
      slateBillboard.update(client.slate);

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
