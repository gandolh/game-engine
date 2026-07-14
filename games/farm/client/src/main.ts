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
import { loadFontAtlas, computeLayout, renderTree } from "@engine/ui";
import { createUIHost } from "./ui/canvas/ui-host";
import type { UIHost } from "./ui/canvas/ui-host";
import { createHomeScreen } from "./ui/canvas/home-screen";
import { createLoadingScreen } from "./ui/canvas/loading-screen";
import { SimClient } from "./worker/sim-client";
import { parseRun, serializeRun } from "@farm/sim-core/run-descriptor";

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
import { ParticleDirector } from "./main/particles";
import { createRenderLoop } from "./main/render-loop";
import { JuiceLayer } from "./main/juice";
import { showFatal } from "./main/fatal";

interface Runtime {
  renderer: RendererLike;
  noiseGen: NoiseGenerator | null;
  keyboard: Keyboard;
  uiHost: UIHost;
  camera: Camera2D;
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

  const renderer = await createRenderer(canvas, camera, {
    backend: "webgpu",
    onBackend: (b) => console.info("[render] backend:", b),
  });
  for (const atlas of atlasMap.values()) {
    renderer.addAtlas(atlas);
  }
  // Register the @engine/ui bitmap font atlas so in-canvas UI text (drawText) resolves its glyph
  // quads (mirrors Citadel's `renderer.addAtlas(await loadFontAtlas())` at boot).
  renderer.addAtlas(await loadFontAtlas());

  renderer.clearColor = EDG.blue;
  setupCameraListeners(canvas, camera);
  const keyboard = new Keyboard();
  keyboard.attach(window);

  const SCROLL_KEYS = new Set([
    "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",

    "Tab",
  ]);
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
    if (SCROLL_KEYS.has(e.code)) e.preventDefault();
  });
  const noiseGen = await loadNoiseGenerator();

  // The shared in-canvas UI host (surface + per-root dispatchers + capture-phase input routing).
  // Created once, up front, so the canvas home/loading screens can render through it before the
  // sim exists — the game panels register their own roots into the same host later.
  const uiHost = createUIHost(renderer, canvas);

  return { renderer, noiseGen, keyboard, uiHost, camera };
}

/**
 * Anchor the DOM seed input (the one documented DOM exception) onto the empty SLOT the canvas
 * seed row reserves for it (`HomeScreen.seedSlot`).
 *
 * This used to guess — centre horizontally, then `panel.height * 0.52` vertically. The guess
 * was only ever coincidentally right, and it broke visibly the moment the in-canvas font
 * changed (the panel got taller, so 52% stopped landing on the row and the input collided with
 * the Randomize button). Position off the laid-out rect, which tracks whatever the text metrics
 * do, instead of a fraction of the panel.
 */
function positionSeedInput(canvas: HTMLCanvasElement, input: HTMLInputElement, slot: { rect: { x: number; y: number; width: number; height: number } }): void {
  const rect = canvas.getBoundingClientRect();
  input.style.left = `${rect.left + slot.rect.x}px`;
  input.style.top = `${rect.top + slot.rect.y}px`;
}

async function boot(): Promise<void> {
  const canvasEl = document.getElementById("canvas") as HTMLCanvasElement | null;
  const fatalEl = document.getElementById("fatal") as HTMLElement | null;
  if (!canvasEl || !fatalEl) throw new Error("Missing #canvas/#fatal");
  const canvas: HTMLCanvasElement = canvasEl;
  const fatal: HTMLElement = fatalEl;

  const shared = parseRun(location.hash);
  const defaultSeed = shared?.seed ?? CONFIG.seed;
  const maxDays = shared?.maxDays ?? CONFIG.maxDays;
  const ticksPerDay = shared?.ticksPerDay ?? CONFIG.ticksPerDay;

  let runtime: Runtime;
  try {
    runtime = await setupRuntime(canvas);
  } catch (err) {
    showFatal(fatal, err);
    throw err;
  }
  const { renderer, uiHost } = runtime;

  // --- Home screen (in-canvas) ---------------------------------------------------------------
  // Rendered through the shared UI host each frame until Start is clicked. The seed field is the
  // one DOM exception (canvas has no text-input widget); we position it over the panel each frame.
  let screenRafId = 0;
  let homeDismissed = false;
  const home = createHomeScreen(
    {
      onStart: (seed) => {
        if (homeDismissed) return;
        homeDismissed = true;
        cancelAnimationFrame(screenRafId);
        home.destroy(); // removes the DOM seed input
        homeRoot.mirror?.update(home.root); // clears the AT view (getRoot() now null)
        void startGame(canvas, fatal, runtime, { seed, maxDays, ticksPerDay });
      },
    },
    { defaultSeed },
  );
  const homeRoot = uiHost.registerRoot({
    getRoot: () => (homeDismissed ? null : home.root),
    a11yMount: document.getElementById("ui-a11y-home"),
    a11yLabel: "Farm Valley — start a run",
  });

  function renderHome(): void {
    renderer.beginFrame();
    home.refresh();
    computeLayout(home.root, 0, 0);
    const hx = Math.max(0, (canvas.clientWidth - home.root.rect.width) / 2);
    const hy = Math.max(0, (canvas.clientHeight - home.root.rect.height) / 2);
    computeLayout(home.root, hx, hy);
    homeRoot.mirror?.update(home.root);
    positionSeedInput(canvas, home.seedInputEl, home.seedSlot);
    uiHost.surface.begin();
    renderTree(uiHost.surface, home.root);
    uiHost.surface.end();
    renderer.endFrame();
    screenRafId = requestAnimationFrame(renderHome);
  }
  screenRafId = requestAnimationFrame(renderHome);
}

async function startGame(
  canvas: HTMLCanvasElement,
  fatal: HTMLElement,
  runtime: Runtime,
  run: { seed: number; maxDays: number; ticksPerDay: number },
): Promise<void> {
  const { renderer, noiseGen, keyboard, uiHost } = runtime;
  const { seed, maxDays, ticksPerDay } = run;

  // --- Loading screen (in-canvas) ------------------------------------------------------------
  const loading = createLoadingScreen();
  const loadingRoot = uiHost.registerRoot({
    getRoot: () => (loadingActive ? loading.root : null),
    a11yMount: document.getElementById("ui-a11y-loading"),
    a11yLabel: "Loading",
  });
  let loadingActive = true;
  let loadingProgress = "Loading assets…";
  let loadingRafId = 0;
  function renderLoading(): void {
    if (!loadingActive) return;
    renderer.beginFrame();
    if (loading.refresh({ seed, progress: loadingProgress })) {
      computeLayout(loading.root, 0, 0);
      const lx = Math.max(0, (canvas.clientWidth - loading.root.rect.width) / 2);
      const ly = Math.max(0, (canvas.clientHeight - loading.root.rect.height) / 2);
      computeLayout(loading.root, lx, ly);
      loadingRoot.mirror?.update(loading.root);
    }
    uiHost.surface.begin();
    renderTree(uiHost.surface, loading.root);
    uiHost.surface.end();
    renderer.endFrame();
    loadingRafId = requestAnimationFrame(renderLoading);
  }
  loadingRafId = requestAnimationFrame(renderLoading);

  let staticBaked = false;
  let firstFrame = false;
  function maybeDismiss(): void {
    if (staticBaked && firstFrame) {
      loadingActive = false;
      cancelAnimationFrame(loadingRafId);
      loadingRoot.mirror?.update(loading.root); // clears the AT view (getRoot() now null)
    }
  }

  try {
    loadingProgress = "Building world…";

    const client = new SimClient();
    setSimClient(client);

    const juice = new JuiceLayer(document.body);

    const { actions: playbackActions, handlers: playbackHandlers } = wirePlayback(client);

    // Wrap skip-to-highlight so the juice layer resyncs on the jump.
    const origSkip = playbackHandlers.doSkipToHighlight;
    playbackHandlers.doSkipToHighlight = (): void => {
      juice.signalResync();
      origSkip();
    };
    // The playback panel's Skip button goes through playbackActions.skipToHighlight → doSkip; rewire
    // it to the juice-aware version.
    playbackActions.skipToHighlight = playbackHandlers.doSkipToHighlight;

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) juice.signalResync();
    });

    registerHotkeys(playbackHandlers);

    // Share side effect (game-over "Share this run"): serialize the run into the URL + clipboard and
    // stash the resulting status text for the panel to read on its next refresh.
    let shareStatus = "";
    const onShare = (): void => {
      const serialized = serializeRun({ seed, maxDays, ticksPerDay });
      location.hash = "run=" + serialized;
      const url = location.href;
      const clip = navigator.clipboard;
      if (clip && typeof clip.writeText === "function") {
        clip.writeText(url).then(
          () => { shareStatus = "copied URL to clipboard"; },
          () => { shareStatus = "URL in address bar (copy failed)"; },
        );
      } else {
        shareStatus = "URL in address bar";
      }
    };

    const focusFarmer = (id: number | null): void => {
      setFocusedFarmerId(id);
      setPanOffset({ x: 0, y: 0 });
      if (_camera !== null) applyFocusAndPan(_camera);
    };

    const panels = buildPanels(document.body, uiHost, canvas, {
      onSelectFarmer: focusFarmer,
      playback: playbackActions,
      onShare,
      swapSlots: (from, to) => { if (client.owner) client.swapSlots(from, to); },
      isOwner: () => client.owner,
    });

    const ambient = new AmbientLayer();
    bakeStaticLayer(client, renderer, noiseGen, seed, ambient, () => {
      staticBaked = true;
      maybeDismiss();
    });

    const particles = new ParticleSystem();
    const particleDirector = new ParticleDirector(particles, client);
    const rain = new RainField();

    loadingProgress = "Starting sim…";
    client.init({
      seed,
      tickRateHz: CONFIG.tickRateHz,
      ticksPerDay,
      maxDays,
      // Unique per tab so each visitor gets a private server run and always
      // owns their own Pip. UI-side only — never reaches sim logic, so
      // determinism is unaffected.
      clientId: crypto.randomUUID(),
    });

    const renderFrame = createRenderLoop({
      client, renderer, keyboard, particles, particleDirector, rain,
      canvas, panels, seed, maxDays, ticksPerDay, ambient, juice,
      uiHost, getShareStatus: () => shareStatus,
      onFirstFrame: () => {
        firstFrame = true;
        maybeDismiss();
      },
    });

    requestAnimationFrame(renderFrame);
  } catch (err) {
    loadingActive = false;
    cancelAnimationFrame(loadingRafId);
    showFatal(fatal, err);
    throw err;
  }
}

void boot();
