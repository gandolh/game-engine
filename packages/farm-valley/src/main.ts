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
} from "./ui";
import { HomeScreen } from "./screens";
import { WORLD_WIDTH, WORLD_HEIGHT } from "./world/regions";
import { SimClient } from "./worker/sim-client";
import type { FinalStandingRow } from "./worker/snapshot";

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

  const home = new HomeScreen(app);

  const runtimePromise = setupRuntime(canvas);
  runtimePromise.catch(() => {});

  home.onStartClicked(() => {
    void startGame(app, fatal, runtimePromise);
  });
}

async function startGame(
  app: HTMLElement,
  fatal: HTMLElement,
  runtimePromise: Promise<Runtime>,
): Promise<void> {
  try {
    const { renderer } = await runtimePromise;

    const client = new SimClient();
    _simClient = client;

    const overlay = new DebugOverlay(app);
    const observer = new ObserverPanel(app);
    const leaderboardPanel = new LeaderboardPanel(app);
    const slateBillboard = new SlateBillboardPanel(app);
    const gameOverPanel = createGameOverPanel(app);
    let gameOverShown = false;

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

    // Start the sim worker.
    client.init({
      seed: CONFIG.seed,
      tickRateHz: CONFIG.tickRateHz,
      ticksPerDay: CONFIG.ticksPerDay,
      maxDays: CONFIG.maxDays,
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
          renderGameOver(gameOverPanel, final, snap?.day ?? 0);
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

function createGameOverPanel(parent: HTMLElement): HTMLElement {
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
    "white-space: pre",
  ].join(";");
  parent.appendChild(panel);
  return panel;
}

function renderGameOver(
  panel: HTMLElement,
  rows: FinalStandingRow[],
  finalDay: number,
): void {
  const lines: string[] = [];
  lines.push(`╔══ FARM VALLEY — final standings after ${finalDay} days ══╗`);
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
  panel.textContent = lines.join("\n");
  panel.style.display = "block";
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
