/**
 * Decorative water life — render-only, no sim/determinism impact (wall-clock + Math.random, like the
 * particle system). Lifecycle events rather than static props:
 *   • Ducks  — a trio flies in from the left (bird flap frames), descends onto a shallow-water spot,
 *              paddles there a while (duck frames), then flies off to the right.
 *   • Whales — a faint deep silhouette swims left→right across the open ocean, hidden while passing
 *              behind land, and now and then splashing a little water up.
 */

import type { RendererLike, ParticleSystem } from "@engine/core";
import { EDG } from "@engine/core";
import { oceanDepthAt } from "@farm/sim-core/render-systems";
import { isWalkable, WORLD_WIDTH, WORLD_HEIGHT } from "@farm/sim-core/world/regions";

const TILE = 16;

interface View { left: number; right: number; top: number; bottom: number; }

// ── Shared world geometry (collected once) ───────────────────────────────────
let shallowSpots: Array<{ x: number; y: number }> | null = null;
function getShallowSpots(): Array<{ x: number; y: number }> {
  if (shallowSpots === null) {
    shallowSpots = [];
    for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
      for (let tx = 0; tx < WORLD_WIDTH; tx++) {
        const d = oceanDepthAt(tx, ty);
        if (d === 1 || d === 2) shallowSpots.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
      }
    }
  }
  return shallowSpots;
}

// Deep-ocean y rows (have a long open-water stretch) for whale lanes.
let deepRows: number[] | null = null;
function getDeepRows(): number[] {
  if (deepRows === null) {
    const rows = new Set<number>();
    for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
      let oceanRun = 0;
      for (let tx = 0; tx < WORLD_WIDTH; tx++) {
        if (!isWalkable(tx, ty) && oceanDepthAt(tx, ty) === 0) oceanRun++;
      }
      if (oceanRun > WORLD_WIDTH * 0.4) rows.add(ty); // mostly-open rows make good lanes
    }
    deepRows = [...rows];
  }
  return deepRows;
}

// NOTE: the volcano + casino are now real walkable landmark *regions* (see world/regions.ts),
// rendered as scaled, bottom-anchored, y-sorting sprites via BIG_STRUCTURES — not the render-only
// corner sprites that used to live here.

// Math.random in a small range.
const rand = (min: number, max: number): number => min + Math.random() * (max - min);
const pick = <T>(arr: T[]): T | null => (arr.length ? arr[(Math.random() * arr.length) | 0]! : null);

// ── Ducks ────────────────────────────────────────────────────────────────────
type DuckPhase = "in" | "stay" | "out";
interface DuckFlock { phase: DuckPhase; t: number; landX: number; landY: number; }
const DUCK_FLY_DIST = TILE * 10;  // horizontal travel of the fly in/out
const DUCK_ALT = TILE * 7;        // how high above the water they start/end
const DUCK_IN_DUR = 3.2;          // seconds: glide down
const DUCK_STAY_DUR = 9;          // seconds: paddling
const DUCK_OUT_DUR = 3.2;         // seconds: climb away
const DUCK_FORMATION = [          // trio: a leader + two trailing
  { x: 0, y: 0 }, { x: -7, y: -5 }, { x: -7, y: 5 },
];
let flock: DuckFlock | null = null;
let duckCooldown = 1.5; // seconds until the next flock may spawn

function ease(p: number): number { return p * p * (3 - 2 * p); } // smoothstep

function updateDucks(
  renderer: Pick<RendererLike, "push">,
  nowMs: number,
  dt: number,
  view: View,
): void {
  if (flock === null) {
    duckCooldown -= dt;
    if (duckCooldown > 0) return;
    // Spawn: land on a shallow spot within (or near) the current view so the arrival is seen.
    const m = TILE * 4;
    const inView = getShallowSpots().filter(
      (s) => s.x >= view.left - m && s.x <= view.right + m && s.y >= view.top - m && s.y <= view.bottom + m,
    );
    const spot = pick(inView.length ? inView : getShallowSpots());
    if (spot === null) { duckCooldown = 2; return; }
    flock = { phase: "in", t: 0, landX: spot.x, landY: spot.y };
  }

  flock.t += dt;
  let baseX = flock.landX;
  let baseY = flock.landY;
  let flying = false;
  if (flock.phase === "in") {
    const p = Math.min(1, flock.t / DUCK_IN_DUR);
    baseX = flock.landX - (1 - ease(p)) * DUCK_FLY_DIST; // approach from the left
    baseY = flock.landY - (1 - ease(p)) * DUCK_ALT;       // descend
    flying = p < 1;
    if (p >= 1) { flock.phase = "stay"; flock.t = 0; }
  } else if (flock.phase === "stay") {
    if (flock.t >= DUCK_STAY_DUR) { flock.phase = "out"; flock.t = 0; }
  } else {
    const p = Math.min(1, flock.t / DUCK_OUT_DUR);
    baseX = flock.landX + ease(p) * DUCK_FLY_DIST; // leave to the right
    baseY = flock.landY - ease(p) * DUCK_ALT;       // climb
    flying = true;
    if (p >= 1) { flock = null; duckCooldown = rand(2.5, 7); return; }
  }

  // Flying → bird flap frames (no swimming-duck-with-wings sprite); landed → duck paddle frames.
  const flap = (Math.floor(nowMs / 120) & 1) === 0 ? "decoration/bird-a" : "decoration/bird-b";
  const paddle = (Math.floor(nowMs / 360) & 1) === 0 ? "decoration/duck-a" : "decoration/duck-b";
  const frame = flying ? flap : paddle;
  const atlasId = "props";
  const drift = flock.phase === "stay" ? nowMs * 0.0011 : 0;
  for (let i = 0; i < DUCK_FORMATION.length; i++) {
    const f = DUCK_FORMATION[i]!;
    const x = baseX + f.x + (drift ? Math.cos(drift + i) * 2 : 0);
    const y = baseY + f.y + (drift ? Math.sin(drift * 0.8 + i) * 1.5 : 0);
    if (x < view.left - TILE || x > view.right + TILE || y < view.top - TILE || y > view.bottom + TILE) continue;
    renderer.push({
      x, y, width: TILE, height: TILE, frame, atlasId,
      rotation: 0, layer: flying ? 60 : 6, alpha: 1, // airborne above the world, landed on the water
    });
  }
}

// ── Whales ─────────────────────────────────────────────────────────────────
interface Whale { x: number; y: number; splashCd: number; }
const WHALE_SPEED = TILE * 0.9; // world px/sec — slow glide
let whale: Whale | null = null;
let whaleCooldown = 3;

function updateWhales(
  renderer: Pick<RendererLike, "push">,
  particles: ParticleSystem,
  nowMs: number,
  dt: number,
  view: View,
): void {
  if (whale === null) {
    whaleCooldown -= dt;
    if (whaleCooldown > 0) return;
    const lane = pick(getDeepRows());
    if (lane === null) { whaleCooldown = 8; return; }
    whale = { x: -TILE * 2, y: lane * TILE + TILE / 2, splashCd: rand(2, 5) }; // enter from the left
  }

  whale.x += WHALE_SPEED * dt;
  if (whale.x > WORLD_WIDTH * TILE + TILE * 2) { whale = null; whaleCooldown = rand(12, 30); return; } // exit right

  const tx = Math.floor(whale.x / TILE);
  const ty = Math.floor(whale.y / TILE);
  const overOcean = !isWalkable(tx, ty); // hide while passing behind land
  const onScreen =
    whale.x >= view.left - TILE * 2 && whale.x <= view.right + TILE * 2 &&
    whale.y >= view.top - TILE && whale.y <= view.bottom + TILE;

  if (overOcean && onScreen) {
    const depthPulse = 0.5 + 0.5 * Math.sin(nowMs * 0.0009 + whale.x * 0.02);
    renderer.push({
      x: whale.x, y: whale.y, width: 32, height: 16,
      frame: "decoration/whale", atlasId: "props",
      rotation: 0, layer: 1, alpha: 0.18 + 0.16 * depthPulse, // faint = deep under the surface
    });
    // Occasional spout/splash: a little water thrown up just ahead of the whale.
    whale.splashCd -= dt;
    if (whale.splashCd <= 0) {
      whale.splashCd = rand(3, 7);
      particles.emit({
        x: whale.x + 10, y: whale.y - 4, count: 7, shape: "circle",
        color: EDG.white, color2: EDG.skyBlue,
        speedMin: 14, speedMax: 40,
        angleMin: -Math.PI * 0.75, angleMax: -Math.PI * 0.25, // upward fountain
        lifetimeMin: 0.4, lifetimeMax: 0.9,
        sizeMin: 0.6, sizeMax: 1.4,
        gravity: 70,
      });
    }
  } else {
    whale.splashCd -= dt; // keep the timer ticking so it doesn't dump on reveal
  }
}

export function pushWaterDecor(
  renderer: Pick<RendererLike, "push">,
  particles: ParticleSystem,
  nowMs: number,
  dt: number,
  view: View,
): void {
  updateWhales(renderer, particles, nowMs, dt, view);
  updateDucks(renderer, nowMs, dt, view);
}
