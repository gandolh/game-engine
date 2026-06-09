import { Canvas2dRenderer, Keyboard, ParticleSystem, Profiler } from "@engine/core";
import { EDG } from "@engine/core";
import { pushSnapshotSprites, COASTLINE_BUBBLE_TILES, FOAM_FRAMES, FORGE_FIRE_FRAMES, FORGE_OVEN_TILE, FORGE_SMOKE_FRAMES, FORGE_CHIMNEY_PX, WATERFALL_FRAMES } from "../render-systems";
import { WATERFALL_TILE } from "../world/regions";
import { washFor } from "../render/day-night";
import { seasonForDay } from "../protocols/weather";
import { HOTBAR_SLOTS } from "../systems/player-control";
import { TILE, PROFILE_ENABLED } from "./config";
import {
  focusedFarmerId,
  panOffset,
  recenteringOnPip,
  playerFarmerId,
  lastPlayerMoveX,
  lastPlayerMoveY,
  _camera,
  setFocusedFarmerId,
  setPanOffset,
  setRecenteringOnPip,
  setLastPlayerMoveX,
  setLastPlayerMoveY,
  applyFocusAndPan,
} from "./camera";
import type { Panels } from "./panels";
import type { ParticleDirector } from "./particles";
import { renderGameOver } from "./game-over";
import { updateTooltip } from "./tooltip";
import type { SimClient } from "../worker/sim-client";

export interface RenderLoopDeps {
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
export function createRenderLoop(deps: RenderLoopDeps): () => void {
  const {
    client, renderer, keyboard, particles, particleDirector,
    canvas, panels, tooltip, seed, maxDays, ticksPerDay,
  } = deps;
  const {
    overlay, worldClock, observer, leaderboardPanel,
    slateBillboard, eventFeedPanel, hotbar, gameOverPanel, relationshipMatrix,
    wealthGraph,
  } = panels;

  let lastFrameMs = performance.now();
  let gameOverShown = false;

  // Render FPS cap. The sim runs in the worker (decoupled from rendering), so
  // this only paces the main-thread draw — it never affects tick output or
  // determinism. requestAnimationFrame fires at the display's refresh rate
  // (120/144Hz monitors render faster than needed and waste CPU/GPU); we gate
  // the per-frame work so we draw at most ~60×/sec. A small epsilon avoids
  // dropping a frame that lands a hair early on a 60Hz vsync boundary.
  const TARGET_FPS = 60;
  const MIN_FRAME_MS = 1000 / TARGET_FPS - 1; // ~15.67ms; epsilon = 1ms
  let lastRenderMs = performance.now() - MIN_FRAME_MS;

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

    // FPS cap: if this rAF callback fired sooner than the target frame interval
    // (e.g. on a high-refresh display), skip all work and reschedule. We keep
    // using rAF (vsync-aligned, auto-throttles on hidden tabs) rather than a
    // setInterval, just gating the work. dt is measured from the last RENDERED
    // frame so interpolation stays smooth at the capped rate.
    if (frameStart - lastRenderMs < MIN_FRAME_MS) {
      requestAnimationFrame(renderFrame);
      return;
    }
    lastRenderMs = frameStart;

    const nowMs = frameStart;
    const dt = Math.min((nowMs - lastFrameMs) / 1000, 0.1); // cap at 100ms
    lastFrameMs = nowMs;

    // Compute interpolated sprites once per frame — used for rendering,
    // farmer positions, and the hover tooltip. Timed separately (T1.2 target).
    const interpolatedSprites = frameProfiler.time("interp", () =>
      client.getInterpolatedSprites(),
    );

    // Smoothly decay any pan offset back to zero while re-centering on Pip, so
    // the view glides onto him instead of snapping (the "jump back to a previous
    // position" on move-start). Exponential ease toward 0; snap+stop when close.
    if (recenteringOnPip) {
      setPanOffset({ x: panOffset.x * 0.8, y: panOffset.y * 0.8 });
      if (Math.abs(panOffset.x) < 0.5 && Math.abs(panOffset.y) < 0.5) {
        setPanOffset({ x: 0, y: 0 });
        setRecenteringOnPip(false);
      }
    }

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
        atlasId: "terrain",
        rotation: 0,
        layer: 1,
        alpha: 0.6,
      });
    }

    // The fishing-spot's rising-bubble animation is handled inside
    // `pushSnapshotSprites` → `resolveFrameAndBob` (it cycles the single layer-4
    // `structure/fishing-spot` snapshot sprite through its A→B→C bubble frames),
    // so no separate overlay pass is needed here.

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
      atlasId: "buildings",
      rotation: 0,
      layer: 41,
      alpha: 1,
    });

    // Animated chimney smoke rising from the forge-house chimney. Cycled slower
    // than the fire (~0.7 s per A→B→C) and drawn behind the work-yard (layer 6,
    // just above the baked forge-house at layer 5) with a soft alpha so it reads
    // as drifting smoke, not a solid sprite. The smoke also bobs up a couple of
    // pixels over the cycle for a touch of motion.
    const SMOKE_PERIOD_MS = 700;
    const smokeIdx = Math.floor(nowMs / (SMOKE_PERIOD_MS / FORGE_SMOKE_FRAMES.length)) % FORGE_SMOKE_FRAMES.length;
    const smokeFrame = FORGE_SMOKE_FRAMES[smokeIdx]!;
    renderer.push({
      x: FORGE_CHIMNEY_PX.x,
      y: FORGE_CHIMNEY_PX.y - smokeIdx * 2,
      width: TILE,
      height: TILE,
      frame: smokeFrame,
      atlasId: "buildings",
      rotation: 0,
      layer: 6,
      alpha: 0.55,
    });

    // brief 52 — animated waterfall cascade on the decorative waterfall island.
    // Drawn EXACTLY like the forge-fire overlay above: a 3-frame array cycled by
    // wall-clock (Math.floor(nowMs / (PERIOD/len)) % len) and pushed as an overlay
    // at the island's anchor tile, on top of the static `structure/waterfall` base
    // cliff (layer 40). Layer 41 sits just above the base, like the forge fire over
    // the oven. ~540ms A→B→C so the bright streaks step downward and read as
    // continuously falling water. Render-only / wall-clock — NO sim, NO snapshot,
    // NO determinism impact.
    const WATERFALL_PERIOD_MS = 540;
    const waterfallFrame = WATERFALL_FRAMES[
      Math.floor(nowMs / (WATERFALL_PERIOD_MS / WATERFALL_FRAMES.length)) % WATERFALL_FRAMES.length
    ]!;
    renderer.push({
      x: WATERFALL_TILE.x * TILE + TILE / 2,
      y: WATERFALL_TILE.y * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame: waterfallFrame,
      atlasId: "buildings",
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

    // brief 45 — weather ambient overlay (render-only). Rain on rainy/storm days;
    // snow in winter (or winter storm). Particles spawn across the visible
    // viewport and fall, so the season + sky read at a glance. EDG palette only;
    // wall-clock animated like the foam/forge effects; no determinism impact.
    {
      const snap = client.latestSnapshot();
      const w = snap?.weather;
      if (w) {
        const vw = viewRight - viewLeft;
        const spawnAcross = (count: number, fn: (x: number, y: number) => void): void => {
          for (let i = 0; i < count; i++) {
            fn(viewLeft + Math.random() * vw, viewTop - Math.random() * TILE * 2);
          }
        };
        const isWinter = w.season === "winter";
        if (isWinter) {
          // Snow: slow, drifting white flecks. Density scales with the viewport.
          const flakes = Math.round((vw / TILE) * (w.condition === "storm" ? 0.9 : 0.5));
          spawnAcross(flakes, (x, y) =>
            particles.emit({
              x, y, count: 1, shape: "circle",
              color: EDG.white, color2: EDG.silver,
              speedMin: 8, speedMax: 18,
              angleMin: Math.PI * 0.45, angleMax: Math.PI * 0.55,
              lifetimeMin: 1.6, lifetimeMax: 2.6,
              sizeMin: 0.8, sizeMax: 1.6,
              gravity: 6,
            }),
          );
        } else if (w.condition === "rainy" || w.condition === "storm") {
          // Rain: fast, near-vertical blue streaks. Heavier in a storm.
          const drops = Math.round((vw / TILE) * (w.condition === "storm" ? 2.2 : 1.2));
          spawnAcross(drops, (x, y) =>
            particles.emit({
              x, y, count: 1, shape: "rect",
              color: EDG.skyBlue, color2: EDG.silver,
              speedMin: 220, speedMax: 320,
              angleMin: Math.PI * 0.46, angleMax: Math.PI * 0.5,
              lifetimeMin: 0.5, lifetimeMax: 0.9,
              sizeMin: 0.4, sizeMax: 0.9,
              gravity: 80,
            }),
          );
        }
      }
    }

    particles.update(dt);

    pushSnapshotSprites(
      renderer,
      interpolatedSprites,
      client.meets,
      farmerPositions,
      nowMs,
      seasonForDay(client.day),
    );

    // Yellow follow arrow bobbing above the head of whichever farmer the camera
    // is currently following (Pip by default, or an AI farmer clicked in the
    // observer panel). Layer 91 = above the meet bubble (90). A gentle sine bob
    // keeps it lively without distracting.
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
      // Space recenters the camera on Pip (clears any pan/observer focus). Eases
      // the pan offset back to 0 (smooth recenter) rather than snapping.
      if (keyboard.justPressed("Space") && playerFarmerId !== null) {
        setFocusedFarmerId(playerFarmerId);
        setRecenteringOnPip(true);
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
      const moveChanged = moveX !== lastPlayerMoveX || moveY !== lastPlayerMoveY;
      // Focus the camera on Pip the moment the player STARTS moving (a held axis
      // goes from idle→direction). If the observer had panned/clicked elsewhere,
      // this eases the view back to Pip so the player sees who they're driving.
      // Only fires on the start of a fresh move (moveChanged + something held),
      // not every frame, and not on release (both axes null). We set the focus
      // target and flag a smooth recenter (panOffset decays to 0 in the render
      // loop) rather than zeroing panOffset here — an instant setCenter looked
      // like the camera "jumping back to a previous position".
      if (moveChanged && (moveX !== null || moveY !== null) && playerFarmerId !== null) {
        setFocusedFarmerId(playerFarmerId);
        setRecenteringOnPip(true);
      }
      if (
        moveChanged ||
        action ||
        selectSlot !== null
      ) {
        client.sendInput(moveX, moveY, action, selectSlot);
        setLastPlayerMoveX(moveX);
        setLastPlayerMoveY(moveY);
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
    relationshipMatrix.update(client.relationships);
    // brief 39 — per-day redraw of the wealth-over-time graph.
    wealthGraph.update(client.wealthSeries, client.day);

    // Game over — show once.
    if (client.gameOver && !gameOverShown) {
      gameOverShown = true;
      const final = client.finalSummary;
      if (final !== null) {
        renderGameOver(gameOverPanel, final, snap?.day ?? 0, {
          seed,
          maxDays,
          ticksPerDay,
        }, client.recap);
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
