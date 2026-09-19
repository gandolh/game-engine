import { Keyboard, ParticleSystem, Profiler, RainField, expSmooth } from "@engine/core";
import { EDG } from "@engine/core";
import type { RendererLike } from "@engine/core";
import type { UIHost } from "../ui/canvas/ui-host";
import { pushSnapshotSprites, pushOccluderSprites, pushBuildingSprites, pushBridgeSprites, frameToAtlasId, walkStepsBetween, ACTION_POSE } from "@farm/sim-core/render-systems";
import type { JuiceLayer } from "./juice";
import { isWalkable } from "@farm/sim-core/world/regions";
import { pushWorldDecor, spawnCropPollenParticles } from "./render-world-decor";
import { renderUiPanels, createLayoutCache } from "./render-ui-panels";
import { washFor, nightnessFor } from "../render/day-night";
import { makeLightOverlay } from "../render/lights";
import { seasonForDay } from "@farm/sim-core/protocols/weather";
import { HOTBAR_SIZE } from "@farm/sim-core/systems/player-control";
import { TILE, PROFILE_ENABLED } from "./config";
import {
  focusedFarmerId,
  panOffset,
  recenteringOnPip,
  playerFarmerId,
  lastPlayerMoveX,
  lastPlayerMoveY,
  zoom,
  _camera,
  mousePos,
  setFocusedFarmerId,
  setPanOffset,
  setRecenteringOnPip,
  setLastPlayerMoveX,
  setLastPlayerMoveY,
  applyFocusAndPan,
} from "./camera";
import { screenToTile } from "./screen-to-tile";
import { createPipFarmMarker } from "./pip-farm-marker";
import { pushWaterDecor } from "../render/water-decor";
import { pushFishSchools } from "../render/fish-decor";
import { frameDataUrl } from "./sprite-icon";
import type { Panels } from "./panels";
import type { ParticleDirector } from "./particles";
import type { SimClient } from "../net/sim-client";
import type { AmbientLayer } from "./ambient";
import { setupProfileExport } from "./profile-export";
import { renderWeather } from "./render-weather";


const HELD_TOOL_ANCHOR: Record<"down" | "up" | "side", { dx: number; dy: number; behind: boolean }> = {
  down: { dx: 5, dy: 2, behind: false },
  side: { dx: 5, dy: 2, behind: false },
  up: { dx: 5, dy: 2, behind: true },
};

const HELD_TOOL_SCALE = 0.6;

const HELD_TOOL_FRAME: Record<string, string> = { "tool/can": "tool/can-held" };

export interface RenderLoopDeps {
  client: SimClient;
  renderer: RendererLike;
  keyboard: Keyboard;
  particles: ParticleSystem;
  particleDirector: ParticleDirector;
  rain: RainField;
  canvas: HTMLCanvasElement;
  panels: Panels;
  seed: number;
  maxDays: number;
  ticksPerDay: number;
  ambient: AmbientLayer;
  juice: JuiceLayer;
  /** The shared in-canvas @engine/ui host (surface + per-root dispatchers/mirrors). */
  uiHost: UIHost;
  /** Current share-status text for the game-over panel (host owns the clipboard side effect). */
  getShareStatus: () => string;
  onFirstFrame?: () => void;
}

export function createRenderLoop(deps: RenderLoopDeps): () => void {
  const {
    client, renderer, keyboard, particles, particleDirector, rain,
    canvas, panels, seed, maxDays, ticksPerDay, ambient, juice,
    uiHost, getShareStatus,
  } = deps;

  // Connection-lost banner (review item 19): onConnectionLost previously had no registered
  // caller, so a dropped WebSocket froze the game with no visible feedback. No auto-reconnect
  // this wave — this only makes the failure visible.
  const connectionLostBanner = document.createElement("div");
  connectionLostBanner.textContent = "Connection lost — reload the page to reconnect.";
  connectionLostBanner.style.cssText = [
    "position: fixed",
    "top: 0",
    "left: 0",
    "right: 0",
    "z-index: 10000",
    "padding: 10px 16px",
    "text-align: center",
    "font: bold 14px/1.4 ui-monospace, monospace",
    `color: ${EDG.white}`,
    `background: ${EDG.crimson}`,
    `border-bottom: 1px solid ${EDG.black}`,
    "pointer-events: none",
    "display: none",
  ].join(";");
  document.body.appendChild(connectionLostBanner);
  client.onConnectionLost(() => {
    connectionLostBanner.style.display = "block";
  });

  let firstFrameSignaled = false;
  // Only the panel refs render-loop.ts itself still touches directly (hotkeys, the *Ctl wrapper
  // casts) are destructured here — every panel renderUiPanels drives now reads straight off the
  // `panels` bundle it's passed each frame (see render-ui-panels.ts).
  const {
    overlay, rightColumn, leaderboard, playback, relationshipMatrix,
    wealthToggle, gameOverPanel, inventory, inspectPanel,
  } = panels;

  const inspectCtl = inspectPanel as typeof inspectPanel & { setVisible(v: boolean): void };

  // Diegetic HUD summon: J toggles the notice-board + standings-post from their world anchors to a
  // screen-centred readout (todo decision #7 — in-world home + summon-on-demand).
  let hudSummoned = false;

  // Pip's-farm marker — folded into the widget tree as a custom escape-hatch node (built once;
  // per-frame it takes the live camera/zoom/time via setFrame, then lays out + renders like a panel).
  const pipMarker = createPipFarmMarker();

  // The panels expose leaderboard/game-over open state via a wrapper the builder attached.
  const leaderboardCtl = leaderboard as typeof leaderboard & {
    setOpen(v: boolean): void; isOpen(): boolean; toggle(): void;
  };
  const gameOverCtl = gameOverPanel as typeof gameOverPanel & {
    setOpen(v: boolean): void; isOpen(): boolean;
  };

  // Wheel over the scrollable right column scrolls the panel under the cursor instead of zooming
  // the world. Capture-phase so it precedes the world's zoom handler; consume only when a panel
  // actually took it.
  canvas.addEventListener(
    "wheel",
    (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (rightColumn.wheel(x, y, e.deltaY)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    { capture: true, passive: false },
  );

  let lastFrameMs = performance.now();
  let gameOverShown = false;
  // Layout caches: relayout a fixed-content panel on canvas-size change even when refresh() is
  // unchanged (its screen anchor depends on canvas dimensions).
  const layoutCache = createLayoutCache();
  // Keys typed BEFORE the first game frame (home-screen seed input, loading screen) accumulate
  // in Keyboard.justPressed — nothing calls endFrame() until this loop runs — and would fire
  // hotkeys (E/J/Tab + the panel toggles) spuriously on frame 1, write-through persisting bogus
  // panel state. Drained once at the top of the first frame.
  let staleInputDrained = false;

  const spawnRainSplash = (wx: number, wy: number): void => {
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    if (!isWalkable(tx, ty)) {

      particles.emit({
        x: wx, y: wy, count: 4, shape: "circle",
        color: EDG.skyBlue, color2: EDG.white,
        speedMin: 10, speedMax: 26,
        angleMin: 0, angleMax: Math.PI, 
        lifetimeMin: 0.25, lifetimeMax: 0.5,
        sizeMin: 0.5, sizeMax: 1.1,
        gravity: 24,
      });
    } else {

      particles.emit({
        x: wx, y: wy, count: 3, shape: "rect",
        color: EDG.silver, color2: EDG.skyBlue,
        speedMin: 14, speedMax: 30,
        angleMin: -Math.PI * 0.75, angleMax: -Math.PI * 0.25, 
        lifetimeMin: 0.2, lifetimeMax: 0.4,
        sizeMin: 0.3, sizeMax: 0.7,
        gravity: 130,
      });
    }
  };

  const frameProfiler = new Profiler({ enabled: PROFILE_ENABLED });
  if (PROFILE_ENABLED) {
    // Ask the renderer to time its screen-space UI flush (brief 118: the glyph-tint
    // cost hides under render.endFrame, invisible to the panels sub-timer).
    renderer.profileUi = true;
    client.setProfiling(true);
    client.onProfile((_tick, report) => overlay.setWorkerReport(report));

    (window as unknown as { __frameProfile?: () => unknown }).__frameProfile = () =>
      frameProfiler.report();

    setupProfileExport({
      parent: document.body,
      overlay,
      camera: renderer.camera,
      canvas,
      frameReport: () => frameProfiler.report(),
      context: { seed, maxDays, ticksPerDay },
    });
  }

  let frameReportCounter = 0;

  let clickStartX = 0;
  let clickStartY = 0;

  canvas.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button !== 2) return;
    clickStartX = e.clientX;
    clickStartY = e.clientY;
  });

  canvas.addEventListener("mouseup", (e: MouseEvent) => {
    if (e.button !== 2) return;
    if (!client.owner) return;

    const dist = Math.hypot(e.clientX - clickStartX, e.clientY - clickStartY);
    if (dist >= 5) return; 

    const cam = _camera;
    if (cam === null) return;

    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const tile = screenToTile(cam, canvas, cx, cy);

    client.sendInput(lastPlayerMoveX, lastPlayerMoveY, true, null, tile);
  });

  let lastCursorKey = "";

  function applyToolCursor(): void {
    const snap = client.playerHotbar;
    const slot = snap ? snap.slots[snap.selected] : undefined;
    const frame = slot?.frame;
    const key = frame ?? "default";
    if (key === lastCursorKey) return;
    lastCursorKey = key;
    if (!frame) {
      canvas.style.cursor = "default";
      return;
    }
    const url = frameDataUrl(renderer, frame, 2); 
    canvas.style.cursor = url ? `url(${url}) 16 16, crosshair` : "crosshair";
  }

  function renderFrame(): void {
    if (!staleInputDrained) {
      staleInputDrained = true;
      keyboard.endFrame();
    }
    const frameStart = performance.now();
    const nowMs = frameStart;
    const dt = Math.min((nowMs - lastFrameMs) / 1000, 0.1); 
    lastFrameMs = nowMs;

    const interpolatedSprites = frameProfiler.time("interp", () =>
      client.getInterpolatedSprites(),
    );

    if (!firstFrameSignaled && interpolatedSprites.length > 0) {
      firstFrameSignaled = true;
      deps.onFirstFrame?.();
    }

    if (recenteringOnPip) {
      setPanOffset({
        x: expSmooth(panOffset.x, 0, 12, dt),
        y: expSmooth(panOffset.y, 0, 12, dt),
      });
      if (Math.abs(panOffset.x) < 0.5 && Math.abs(panOffset.y) < 0.5) {
        setPanOffset({ x: 0, y: 0 });
        setRecenteringOnPip(false);
      }
    }

    const sx = _camera !== null ? canvas.width / _camera.worldUnitsX : 1;
    if (_camera !== null) {
      applyFocusAndPan(_camera, interpolatedSprites, dt, sx);
    }

    const farmerPositions = new Map<number, { x: number; y: number }>();
    for (const s of interpolatedSprites) {
      if (s.id !== null && s.interpolate) {
        farmerPositions.set(s.id, { x: s.x, y: s.y });
      }
    }

    if (_camera !== null) {
      juice.update(client.events, farmerPositions, _camera, canvas, dt);
      const hitstopN = juice.consumeHitstopFrames();
      if (hitstopN > 0) client.freezeInterp(hitstopN);

      const shk = juice.shake;
      if (shk.x !== 0 || shk.y !== 0) {
        _camera.setCenter(_camera.centerX + shk.x, _camera.centerY + shk.y);
      }
    }

    renderer.beginFrame();

    const t = nowMs / 1000;
    const WATER_DRIFT = TILE * 0.6; 
    renderer.setWaterScroll(
      Math.sin(t * 0.25) * WATER_DRIFT,
      Math.cos(t * 0.17) * WATER_DRIFT,
    );

    const SWELL_PERIOD_S = 7.5;
    const swellPhase = (t * (2 * Math.PI)) / SWELL_PERIOD_S; 
    const SWELL_ALPHA_MID = 0.08;
    const SWELL_ALPHA_AMP = 0.02; 
    const swellAlpha = SWELL_ALPHA_MID + SWELL_ALPHA_AMP * Math.sin(swellPhase);
    const SWELL_DRIFT = TILE * 0.4; 
    renderer.setWaterSwell(
      swellAlpha,
      Math.cos(t * 0.19) * SWELL_DRIFT, 
      Math.sin(t * 0.13) * SWELL_DRIFT,
    );

    const viewLeft = _camera!.centerX - _camera!.worldUnitsX / 2 - TILE;
    const viewRight = _camera!.centerX + _camera!.worldUnitsX / 2 + TILE;
    const viewTop = _camera!.centerY - _camera!.worldUnitsY / 2 - TILE;
    const viewBottom = _camera!.centerY + _camera!.worldUnitsY / 2 + TILE;

    pushWorldDecor(renderer, particles, nowMs, { left: viewLeft, right: viewRight, top: viewTop, bottom: viewBottom });

    particleDirector.emitFromDiff(farmerPositions);

    spawnCropPollenParticles(particles, client.latestSnapshot());

    frameProfiler.time("weather", () => {
      renderWeather(
        client.latestSnapshot()?.weather,
        rain,
        { left: viewLeft, right: viewRight, top: viewTop, bottom: viewBottom },
        dt,
        spawnRainSplash,
      );
    });

    frameProfiler.time("particles.update", () => particles.update(dt));

    frameProfiler.time("pushSprites", () => {
      pushSnapshotSprites(
        renderer,
        interpolatedSprites,
        client.meets,
        farmerPositions,
        nowMs,
        seasonForDay(client.day), 
        playerFarmerId, 
      );

      pushOccluderSprites(renderer);

      pushBuildingSprites(renderer, seasonForDay(client.day));

      pushBridgeSprites(renderer, nowMs);

      pushWaterDecor(renderer, particles, nowMs, dt, { left: viewLeft, right: viewRight, top: viewTop, bottom: viewBottom });

      pushFishSchools(renderer, nowMs, dt, { left: viewLeft, right: viewRight, top: viewTop, bottom: viewBottom });

      const stepPrevMs = nowMs - dt * 1000;
      for (const s of interpolatedSprites) {
        if (s.id === null || s.moving !== true || !s.frame.startsWith("farmer/")) continue;
        if (s.x < viewLeft || s.x > viewRight || s.y < viewTop || s.y > viewBottom) continue;
        if (walkStepsBetween(s.id, stepPrevMs, nowMs) === 0) continue;
        if (!isWalkable(Math.floor(s.x / TILE), Math.floor((s.y + TILE * 0.3) / TILE))) continue;
        particles.emit({
          x: s.x + (Math.random() - 0.5) * TILE * 0.3,
          y: s.y + TILE * 0.42, 
          count: 2, shape: "circle",
          color: EDG.silver, color2: EDG.white,
          speedMin: 3, speedMax: 10,
          angleMin: -Math.PI * 0.75, angleMax: -Math.PI * 0.25, 
          lifetimeMin: 0.22, lifetimeMax: 0.4,
          sizeMin: 0.5, sizeMax: 1.1,
          gravity: 26, 
        });
      }

      const hb = client.playerHotbar;
      const heldSlot = hb ? hb.slots[hb.selected] : undefined;
      const heldFrame = heldSlot?.frame;
      if (playerFarmerId !== null && heldFrame && heldFrame.startsWith("tool/")) {
        for (const s of interpolatedSprites) {
          if (s.id !== playerFarmerId) continue;
          if (s.action !== null && s.action in ACTION_POSE) break; 
          const facing = s.facing ?? "down";
          const a = HELD_TOOL_ANCHOR[facing];
          const facingLeft = facing === "side" && (s.flipX ?? false);
          const toolFrame = HELD_TOOL_FRAME[heldFrame] ?? heldFrame;

          const carryFlip = heldFrame !== "tool/can";
          const size = TILE * HELD_TOOL_SCALE; 
          renderer.push({
            x: s.x + (facingLeft ? -a.dx : a.dx), 
            y: s.y + a.dy,
            width: size,
            height: size,
            frame: toolFrame,
            atlasId: frameToAtlasId(toolFrame),
            rotation: 0,
            layer: s.layer,

            sortY: s.y + (a.behind ? -0.1 : 0.1),
            alpha: 1,
            flipX: carryFlip !== facingLeft, 
          });
          break;
        }
      }
    });

    if (focusedFarmerId !== null) {
      const followed = farmerPositions.get(focusedFarmerId);
      if (followed) {
        const bob = Math.sin(nowMs / 300) * 1.5;
        renderer.push({
          x: followed.x,
          y: followed.y - TILE - 2 + bob,
          width: TILE,
          height: TILE,
          frame: "indicator/follow",
          atlasId: "items-ui",
          rotation: 0,
          layer: 91,
          alpha: 1,
        });
      }
    }

    {
      let moveX: "left" | "right" | null = null;
      let moveY: "up" | "down" | null = null;
      if (keyboard.isDown("KeyW") || keyboard.isDown("ArrowUp"))         moveY = "up";
      if (keyboard.isDown("KeyS") || keyboard.isDown("ArrowDown"))       moveY = "down";
      if (keyboard.isDown("KeyA") || keyboard.isDown("ArrowLeft"))       moveX = "left";
      if (keyboard.isDown("KeyD") || keyboard.isDown("ArrowRight"))      moveX = "right";
      if (keyboard.justPressed("Space") && playerFarmerId !== null) {
        setFocusedFarmerId(playerFarmerId);
        setRecenteringOnPip(true);
      }

      if (keyboard.justPressed("KeyE")) inventory.toggle();
      if (keyboard.justPressed("Escape")) {
        if (inventory.isOpen()) inventory.setOpen(false);
        else if (playback.isHelpOpen()) playback.closeHelp();
        else if (leaderboardCtl.isOpen()) leaderboardCtl.setOpen(false);
        else if (gameOverCtl.isOpen()) gameOverCtl.setOpen(false);
      }

      if (keyboard.justPressed("Tab")) leaderboardCtl.toggle();
      if (keyboard.justPressed("KeyJ")) hudSummoned = !hudSummoned; // summon/dismiss diegetic HUD

      // Collapsible HUD panels (brief 117) — each toggles its own PanelPrefs entry + restructures
      // its tree; the layout blocks below react to the next refresh()/toggleOpen() signal.
      if (keyboard.justPressed("KeyR")) relationshipMatrix.toggleOpen();
      if (keyboard.justPressed("KeyG")) wealthToggle.toggleOpen();
      if (keyboard.justPressed("KeyF")) rightColumn.toggleSection("observer");
      if (keyboard.justPressed("KeyO")) rightColumn.toggleSection("slate");
      if (keyboard.justPressed("KeyT")) rightColumn.toggleSection("events");
      if (client.owner) {

        let selectSlot: number | null = null;
        for (let n = 1; n <= HOTBAR_SIZE && n <= 9; n++) {
          if (keyboard.justPressed(`Digit${n}`)) {
            selectSlot = n - 1;
            break;
          }
        }

        const moveChanged = moveX !== lastPlayerMoveX || moveY !== lastPlayerMoveY;
        if (moveChanged && (moveX !== null || moveY !== null) && playerFarmerId !== null) {
          setFocusedFarmerId(playerFarmerId);
          setRecenteringOnPip(true);
        }
        if (
          moveChanged ||
          selectSlot !== null
        ) {
          client.sendInput(moveX, moveY, false, selectSlot);
          setLastPlayerMoveX(moveX);
          setLastPlayerMoveY(moveY);
        }
      }
    }
    keyboard.endFrame();

    const season = seasonForDay(client.day);
    const wash = washFor({
      tick: client.tick,
      ticksPerDay,
      season,
    });
    const nightness = nightnessFor({
      tick: client.tick,
      ticksPerDay,
      season,
    });
    const dtMs = dt * 1000;
    const view = { left: viewLeft, right: viewRight, top: viewTop, bottom: viewBottom };
    frameProfiler.time("ambient", () => {
      ambient.update(dtMs, nowMs, view, nightness, season);
      ambient.pushSprites(renderer);
    });

    // setCloudOptions is required on RendererLike (one backend), so no capability
    // guard is needed. Options are CONSUMED each frame — re-set every frame.
    const wSnap = client.latestSnapshot()?.weather;
    const condition = wSnap?.condition ?? "normal";
    let cloudCoverage: number;
    let cloudDrift: number;
    if (condition === "sunny") {
      cloudCoverage = 0.06;
      cloudDrift = 3;
    } else if (condition === "rainy") {
      cloudCoverage = 0.52;
      cloudDrift = 9;
    } else if (condition === "storm") {
      cloudCoverage = 0.72;
      cloudDrift = 14;
    } else {

      cloudCoverage = 0.22;
      cloudDrift = 6;
    }
    renderer.setCloudOptions({
      color: EDG.ink,
      coverage: cloudCoverage,
      driftSpeed: cloudDrift,
      timeSec: nowMs / 1000,
    });
    const lightOverlay = makeLightOverlay(nightness, view);

    const snap = client.latestSnapshot();

    if (client.gameOver && !gameOverShown) {
      gameOverShown = true;
      gameOverCtl.setOpen(true);
    }

    // In-canvas UI: submit the whole @engine/ui layer through the shared surface BEFORE endFrame()
    // (the renderer flushes the UI draw-list inside endFrame, painting it over the world). Each
    // panel's refresh() returns whether LAYOUT-AFFECTING content changed; gate the expensive
    // computeLayout + a11y-mirror reconcile behind it (content changes at sim-tick rate, not frame
    // rate). renderTree re-submits the (already laid-out) tree EVERY frame; drawIcons/drawGhost run
    // after renderTree (they need up-to-date rects) and before surface.end(). This mirrors the
    // Citadel main.ts UI-driving block (one surface, many roots, each anchored independently).
    frameProfiler.time("panels", () => {
      renderUiPanels(panels, {
        surface: uiHost.surface, canvas, camera: _camera, zoom, nowMs, ticksPerDay, seed,
        mousePos, interpolatedSprites, focusedFarmerId, farmerPositions, hudSummoned,
        client, snap, getShareStatus, applyToolCursor, layoutCache,
        leaderboardCtl, gameOverCtl, inspectCtl, pipMarker,
      });
    });

    frameProfiler.time("render.endFrame", () => renderer.endFrame(wash, particles, rain, lightOverlay));
    if (PROFILE_ENABLED && renderer.lastUiFlush !== undefined) {
      frameProfiler.add("ui.flush", renderer.lastUiFlush.ms);
      frameProfiler.add("ui.quads", renderer.lastUiFlush.quads);
    }
    // sweep-05: draw-group coalescing counters. `draw.groups` is the MAIN sprite
    // pass only; `draw.ghostGroups` is the separate occluder-redraw pass, kept
    // apart so it can't inflate the groups/sprites ratio this exists to measure.
    if (PROFILE_ENABLED && renderer.lastDrawStats !== undefined) {
      frameProfiler.add("draw.groups", renderer.lastDrawStats.groups);
      frameProfiler.add("draw.ghostGroups", renderer.lastDrawStats.ghostGroups);
      frameProfiler.add("draw.sprites", renderer.lastDrawStats.sprites);
      frameProfiler.add("draw.atlases", renderer.lastDrawStats.atlases);
    }

    overlay.update({ tick: client.tick, alpha: 0, entityCount: client.entityCount });

    if (PROFILE_ENABLED) {
      frameProfiler.add("frame", performance.now() - frameStart);
      frameReportCounter += 1;
      if (frameReportCounter >= 60) {
        frameReportCounter = 0;
        overlay.setFrameReport(frameProfiler.report());
      }
    }

    setTimeout(renderFrame, 0);
  }

  return renderFrame;
}
