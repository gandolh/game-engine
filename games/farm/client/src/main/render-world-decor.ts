/**
 * World-decor sprite pushes for the Farm render loop (audit-25 slice 2/4): the fixed structures
 * (forge, waterfall, campfire, weather beacon, volcano) plus the ambient particle FX anchored to
 * them, and the mature-crop pollen drift. Split out of `renderFrame`'s inline sequence verbatim —
 * same push calls, same order, same view-culling math — just given explicit parameters instead of
 * closing over renderFrame's locals.
 *
 * Draw order matters: `pushWorldDecor` must run at the same point in `renderFrame` the original
 * inline block did (after `renderer.beginFrame()`/water-scroll setup, before `pushSprites`), since
 * layer numbers alone don't fully order same-layer pushes — push call order is itself part of the
 * renderer's draw sequence for ties.
 */
import type { RendererLike, ParticleSystem } from "@engine/core";
import { EDG } from "@engine/core";
import {
  frameToAtlasId,
  FORGE_OVEN_TILE,
  FORGE_CHIMNEY_PX,
  WEATHER_BEACON_PX,
  sampleCycle,
  cycleIndex,
  FORGE_FIRE_CLIP,
  FORGE_SMOKE_CLIP,
  WATERFALL_FALL_CLIP,
  CAMPFIRE_CLIP,
  WEATHER_BEACON_CLIP,
} from "@farm/sim-core/render-systems";
import { WATERFALL_TILE, CAMPFIRE_TILE, VOLCANO_CRATER_TILE } from "@farm/sim-core/world/regions";
import type { RenderSnapshot } from "@farm/sim-core/snapshot";
import { TILE } from "./config";

/** The view-space bounds (world px, camera-relative) decor pushes cull particle spawns against. */
export interface ViewBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const WATERFALL_FALL_ROWS = 2;

/**
 * Push the fixed-structure sprites (forge fire/smoke, waterfall, campfire, weather beacon, volcano)
 * for this frame, and emit their anchored ambient particles (waterfall mist/spray, volcano ash).
 * Unconditional pushes (always in view logically, since they're few and cheap); the particle
 * emitters are still view-culled, exactly as before.
 */
export function pushWorldDecor(
  renderer: RendererLike,
  particles: ParticleSystem,
  nowMs: number,
  view: ViewBounds,
): void {
  const { left: viewLeft, right: viewRight, top: viewTop, bottom: viewBottom } = view;

  const fireFrame = sampleCycle(FORGE_FIRE_CLIP, nowMs);
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

  const smokeIdx = cycleIndex(FORGE_SMOKE_CLIP, nowMs);
  const smokeFrame = sampleCycle(FORGE_SMOKE_CLIP, nowMs);
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

  for (let r = 0; r < WATERFALL_FALL_ROWS; r++) {

    const frame = sampleCycle(WATERFALL_FALL_CLIP, nowMs, (3 - (r % 3)) % 3);
    renderer.push({
      x: WATERFALL_TILE.x * TILE + TILE / 2,
      y: (WATERFALL_TILE.y + r) * TILE + TILE / 2,
      width: TILE,
      height: TILE,
      frame,
      atlasId: frameToAtlasId(frame),
      rotation: 0,
      layer: 41,
      alpha: 1,
    });
  }

  {
    const wfX = WATERFALL_TILE.x * TILE + TILE / 2;
    const wfFootY = (WATERFALL_TILE.y + WATERFALL_FALL_ROWS + 1) * TILE;
    const wfInView =
      wfX >= viewLeft && wfX <= viewRight && wfFootY >= viewTop && wfFootY <= viewBottom;
    if (wfInView) {
      if (Math.random() < 0.5) {
        particles.emit({
          x: wfX + (Math.random() - 0.5) * TILE * 0.8,
          y: wfFootY,
          count: 1, shape: "circle",
          color: EDG.white, color2: EDG.skyBlue,
          speedMin: 10, speedMax: 26,
          angleMin: -Math.PI * 0.85, angleMax: -Math.PI * 0.15,
          lifetimeMin: 0.3, lifetimeMax: 0.6,
          sizeMin: 0.5, sizeMax: 1.1,
          gravity: 90,
        });
      }
      if (Math.random() < 0.25) {
        particles.emit({
          x: wfX + (Math.random() - 0.5) * TILE,
          y: wfFootY - TILE * 0.3,
          count: 1, shape: "circle",
          color: EDG.white, color2: EDG.silver,
          speedMin: 4, speedMax: 10,
          angleMin: -Math.PI * 0.6, angleMax: -Math.PI * 0.4,
          lifetimeMin: 0.8, lifetimeMax: 1.4,
          sizeMin: 1, sizeMax: 2,
          gravity: -6,
        });
      }
    }
  }

  const campfireFrame = sampleCycle(CAMPFIRE_CLIP, nowMs);
  renderer.push({
    x: CAMPFIRE_TILE.x * TILE + TILE / 2,
    y: CAMPFIRE_TILE.y * TILE + TILE / 2,
    width: TILE,
    height: TILE,
    frame: campfireFrame,
    atlasId: "buildings",
    rotation: 0,
    layer: 41,
    alpha: 1,
  });

  const beaconFrame = sampleCycle(WEATHER_BEACON_CLIP, nowMs);
  renderer.push({
    x: WEATHER_BEACON_PX.x,
    y: WEATHER_BEACON_PX.y,
    width: TILE,
    height: TILE,
    frame: beaconFrame,
    atlasId: "buildings",
    rotation: 0,
    layer: 42,
    alpha: 1,
  });

  {
    const vX = VOLCANO_CRATER_TILE.x * TILE + TILE / 2;
    const vY = VOLCANO_CRATER_TILE.y * TILE + TILE / 2;
    const inView = vX >= viewLeft - TILE && vX <= viewRight + TILE && vY >= viewTop - TILE * 4 && vY <= viewBottom + TILE;
    if (inView && Math.random() < 0.6) {
      particles.emit({
        x: vX + (Math.random() - 0.5) * TILE * 0.7,
        y: vY,
        count: 1, shape: "circle",
        color: EDG.steel, color2: EDG.slate,
        speedMin: 6, speedMax: 16,
        angleMin: -Math.PI * 0.62, angleMax: -Math.PI * 0.38,
        lifetimeMin: 1.6, lifetimeMax: 2.8,
        sizeMin: 1.2, sizeMax: 2.6,
        gravity: -10,
      });
    }
  }
}

/**
 * Occasional pollen drift off mature crop sprites in the latest snapshot — a low-rate, low-chance
 * cosmetic emitter (unchanged 0.15 outer / 0.05 per-sprite gate from the original inline block).
 */
export function spawnCropPollenParticles(
  particles: ParticleSystem,
  snap: RenderSnapshot | null,
): void {
  if (Math.random() >= 0.15) return;
  if (!snap) return;
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
