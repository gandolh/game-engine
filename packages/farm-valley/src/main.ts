import {
  loadAllAtlasSheets,
  Camera2D,
  createRenderer,
  EDG,
  Keyboard,
  ParticleSystem,
  RainField,
  createNoiseGeneratorFromUrl,
} from "@engine/core";
import type { NoiseGenerator, RendererLike } from "@engine/core";
import { HomeScreen, LoadingScreen } from "./screens";
import { SimClient } from "./worker/sim-client";
import { parseRun } from "@farm/sim-core/run-descriptor";

import { CONFIG, CAMERA_CONFIG } from "./main/config";
import {
  setupCameraListeners,
  setSimClient,
  setCamera,
  setFocusedFarmerId,
  setPanOffset,
  applyFocusAndPan,
  _camera,
} from "./main/camera";
import { buildPanels } from "./main/panels";
import { wirePlayback, registerHotkeys } from "./main/playback";
import { bakeStaticLayer } from "./main/static-layer";
import { AmbientLayer } from "./main/ambient";
import { createSeedBadge } from "./main/game-over";
import { createTooltip } from "./main/tooltip";
import { ParticleDirector } from "./main/particles";
import { createRenderLoop } from "./main/render-loop";
import { JuiceLayer } from "./main/juice";
import { showFatal } from "./main/fatal";

interface Runtime {
  renderer: RendererLike;
  noiseGen: NoiseGenerator | null;
  keyboard: Keyboard;
}

async function loadNoiseGenerator(): Promise<NoiseGenerator | null> {
  try {
    const gen = await createNoiseGeneratorFromUrl(`${import.meta.env.BASE_URL}wasm/noise.wasm`);
    console.info("[wasm] noise module loaded");
    return gen;
  } catch (err) {
    console.warn("[wasm] noise module unavailable:", err);
    return null;
  }
}

async function setupRuntime(canvas: HTMLCanvasElement): Promise<Runtime> {
  const atlasMap = await loadAllAtlasSheets("/atlas/index.json", import.meta.env.BASE_URL);
  const camera = new Camera2D(CAMERA_CONFIG);
  setCamera(camera);
  // Farm Valley is WebGPU-only — no Canvas2D fallback in the game (the Canvas2dRenderer stays in the
  // engine for tests/other consumers). Forcing "webgpu" makes createRenderer throw if the GPU path is
  // unavailable rather than silently dropping to Canvas2D.
  const renderer = await createRenderer(canvas, camera, {
    backend: "webgpu",
    onBackend: (b) => console.info("[render] backend:", b),
  });
  for (const atlas of atlasMap.values()) {
    renderer.addAtlas(atlas);
  }
  // Ocean backdrop beyond the world edge (deep water, not black).
  renderer.clearColor = EDG.blue;
  setupCameraListeners(canvas, camera);
  const keyboard = new Keyboard();
  keyboard.attach(window);
  // Prevent Space/arrow scroll — these drive Pip; WASD already don't scroll.
  const SCROLL_KEYS = new Set([
    "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    // Tab toggles the standings panel; suppress default focus traversal.
    "Tab",
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

  // Shared run URL: pre-fill seed from hash; don't auto-start.
  const shared = parseRun(location.hash);
  const defaultSeed = shared?.seed ?? CONFIG.seed;
  const maxDays = shared?.maxDays ?? CONFIG.maxDays;
  const ticksPerDay = shared?.ticksPerDay ?? CONFIG.ticksPerDay;

  const home = new HomeScreen(app, { defaultSeed });

  const runtimePromise = setupRuntime(canvas);
  runtimePromise.catch(() => {});

  home.onStartClicked((seed) => {
    const loading = new LoadingScreen(app, { seed });
    loading.show();
    loading.setProgress("Loading assets…");
    void startGame(canvas, app, fatal, runtimePromise, { seed, maxDays, ticksPerDay }, loading);
  });
}

async function startGame(
  canvas: HTMLCanvasElement,
  app: HTMLElement,
  fatal: HTMLElement,
  runtimePromise: Promise<Runtime>,
  run: { seed: number; maxDays: number; ticksPerDay: number },
  loadingScreen: LoadingScreen,
): Promise<void> {
  const { seed, maxDays, ticksPerDay } = run;

  let staticBaked = false;
  let firstFrame = false;

  function maybeDismiss(): void {
    if (staticBaked && firstFrame) {
      loadingScreen.hide();
    }
  }

  try {
    const { renderer, noiseGen, keyboard } = await runtimePromise;
    loadingScreen.setProgress("Building world…");

    const client = new SimClient();
    setSimClient(client);

    const panels = buildPanels(app);
    const { observer, playback } = panels;

    const juice = new JuiceLayer(app);

    const playbackHandlers = wirePlayback(playback, client);

    // Brief 86 — resync guard: signal juice when tab becomes visible again or
    // when the player skips to a highlight (H key), so stale events aren't
    // replayed as a burst of popups/shake.
    const origSkip = playbackHandlers.doSkipToHighlight;
    const juiceAwareSkip = (): void => {
      juice.signalResync();
      origSkip();
    };
    // Re-bind the skip handler so playback buttons and H hotkey both signal resync.
    panels.playback.setOnSkipToHighlight(juiceAwareSkip);
    // Override the exported handler reference so registerHotkeys uses the wrapped version.
    playbackHandlers.doSkipToHighlight = juiceAwareSkip;

    // Tab-hide resync: when the tab becomes visible again, the sim may have
    // advanced many ticks. Signal resync so existing events are skipped.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) juice.signalResync();
    });

    registerHotkeys(playbackHandlers);

    // Brief 72 — when the server assigns owner=false (spectator), hide playback
    // controls so the spectator cannot issue control commands to the shared run.
    client.onAttach((isOwner) => {
      playback.setVisible(isOwner);
    });

    observer.setOnFarmerClick((id) => {
      setFocusedFarmerId(id);
      setPanOffset({ x: 0, y: 0 });
      if (_camera !== null) applyFocusAndPan(_camera);
    });

    panels.eventFeedPanel.setOnFarmerClick((id) => {
      setFocusedFarmerId(id);
      setPanOffset({ x: 0, y: 0 });
      if (_camera !== null) applyFocusAndPan(_camera);
    });

    const ambient = new AmbientLayer();
    bakeStaticLayer(client, renderer, noiseGen, seed, ambient, () => {
      staticBaked = true;
      maybeDismiss();
    });

    createSeedBadge(app, seed);

    const tooltip = createTooltip(app);

    const particles = new ParticleSystem();
    const particleDirector = new ParticleDirector(particles, client);
    const rain = new RainField();

    loadingScreen.setProgress("Starting sim…");
    client.init({
      seed,
      tickRateHz: CONFIG.tickRateHz,
      ticksPerDay,
      maxDays,
    });

    const renderFrame = createRenderLoop({
      client, renderer, keyboard, particles, particleDirector, rain,
      canvas, panels, tooltip, seed, maxDays, ticksPerDay, ambient, juice,
      onFirstFrame: () => {
        firstFrame = true;
        maybeDismiss();
      },
    });

    requestAnimationFrame(renderFrame);
  } catch (err) {
    loadingScreen.hide();
    showFatal(fatal, err);
    throw err;
  }
}

void boot();
