

import type { RendererLike, ParticleSystem } from "@engine/core";
import { EDG, createRng } from "@engine/core";
import { oceanDepthAt, LAYER } from "@farm/sim-core/render-systems";
import { isWalkable, WORLD_WIDTH, WORLD_HEIGHT, WORLD_GEN_SEED } from "@farm/sim-core/world/regions";

const TILE = 16;

const UNDERWATER_TINT = 0xb4ccea_ff; 

interface View { left: number; right: number; top: number; bottom: number; }

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

let deepRows: number[] | null = null;
function getDeepRows(): number[] {
  if (deepRows === null) {
    const rows = new Set<number>();
    for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
      let oceanRun = 0;
      for (let tx = 0; tx < WORLD_WIDTH; tx++) {
        if (!isWalkable(tx, ty) && oceanDepthAt(tx, ty) === 0) oceanRun++;
      }
      if (oceanRun > WORLD_WIDTH * 0.4) rows.add(ty); 
    }
    deepRows = [...rows];
  }
  return deepRows;
}

const rand = (min: number, max: number): number => min + Math.random() * (max - min);
const pick = <T>(arr: T[]): T | null => (arr.length ? arr[(Math.random() * arr.length) | 0]! : null);

type DuckPhase = "in" | "stay" | "out";
interface DuckFlock { phase: DuckPhase; t: number; landX: number; landY: number; }
const DUCK_FLY_DIST = TILE * 10;  
const DUCK_ALT = TILE * 7;        
const DUCK_IN_DUR = 3.2;          
const DUCK_STAY_DUR = 9;          
const DUCK_OUT_DUR = 3.2;         
const DUCK_FORMATION = [          
  { x: 0, y: 0 }, { x: -7, y: -5 }, { x: -7, y: 5 },
];
let flock: DuckFlock | null = null;
let duckCooldown = 1.5; 

function ease(p: number): number { return p * p * (3 - 2 * p); } 

function updateDucks(
  renderer: Pick<RendererLike, "push">,
  nowMs: number,
  dt: number,
  view: View,
): void {
  if (flock === null) {
    duckCooldown -= dt;
    if (duckCooldown > 0) return;

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
    baseX = flock.landX - (1 - ease(p)) * DUCK_FLY_DIST; 
    baseY = flock.landY - (1 - ease(p)) * DUCK_ALT;       
    flying = p < 1;
    if (p >= 1) { flock.phase = "stay"; flock.t = 0; }
  } else if (flock.phase === "stay") {
    if (flock.t >= DUCK_STAY_DUR) { flock.phase = "out"; flock.t = 0; }
  } else {
    const p = Math.min(1, flock.t / DUCK_OUT_DUR);
    baseX = flock.landX + ease(p) * DUCK_FLY_DIST; 
    baseY = flock.landY - ease(p) * DUCK_ALT;       
    flying = true;
    if (p >= 1) { flock = null; duckCooldown = rand(2.5, 7); return; }
  }

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
      rotation: 0, layer: flying ? LAYER.DUCK_FLY : LAYER.DUCK, alpha: 1, 
    });
  }
}

interface Whale { x: number; y: number; splashCd: number; }
const WHALE_SPEED = TILE * 0.9; 
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
    whale = { x: -TILE * 2, y: lane * TILE + TILE / 2, splashCd: rand(2, 5) }; 
  }

  whale.x += WHALE_SPEED * dt;
  if (whale.x > WORLD_WIDTH * TILE + TILE * 2) { whale = null; whaleCooldown = rand(12, 30); return; } 

  const tx = Math.floor(whale.x / TILE);
  const ty = Math.floor(whale.y / TILE);
  const overOcean = !isWalkable(tx, ty); 
  const onScreen =
    whale.x >= view.left - TILE * 2 && whale.x <= view.right + TILE * 2 &&
    whale.y >= view.top - TILE && whale.y <= view.bottom + TILE;

  if (overOcean && onScreen) {
    const depthPulse = 0.5 + 0.5 * Math.sin(nowMs * 0.0009 + whale.x * 0.02);
    renderer.push({
      x: whale.x, y: whale.y, width: 32, height: 16,
      frame: "decoration/whale", atlasId: "props",
      rotation: 0, layer: LAYER.WHALE, alpha: 0.18 + 0.16 * depthPulse, 
    });

    whale.splashCd -= dt;
    if (whale.splashCd <= 0) {
      whale.splashCd = rand(3, 7);
      particles.emit({
        x: whale.x + 10, y: whale.y - 4, count: 7, shape: "circle",
        color: EDG.white, color2: EDG.skyBlue,
        speedMin: 14, speedMax: 40,
        angleMin: -Math.PI * 0.75, angleMax: -Math.PI * 0.25, 
        lifetimeMin: 0.4, lifetimeMax: 0.9,
        sizeMin: 0.6, sizeMax: 1.4,
        gravity: 70,
      });
    }
  } else {
    whale.splashCd -= dt; 
  }
}

let openWaterTiles: Array<{ x: number; y: number }> | null = null;
function getOpenWater(): Array<{ x: number; y: number }> {
  if (openWaterTiles === null) {
    openWaterTiles = [];
    for (let ty = 1; ty < WORLD_HEIGHT - 1; ty++) {
      for (let tx = 1; tx < WORLD_WIDTH - 1; tx++) {
        if (isWalkable(tx, ty)) continue;
        let nearLand = false;
        for (let dy = -1; dy <= 1 && !nearLand; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (isWalkable(tx + dx, ty + dy)) { nearLand = true; break; }
          }
        }
        if (!nearLand) openWaterTiles.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
      }
    }
  }
  return openWaterTiles;
}

interface Kelp { x: number; y: number; phase: number; flip: boolean; }
let kelpBeds: Kelp[] | null = null;
const KELP_TARGET = 90;
function getKelp(): Kelp[] {
  if (kelpBeds === null) {

    const rng = createRng(WORLD_GEN_SEED).fork("kelp-beds");
    const water = getOpenWater();
    kelpBeds = [];
    if (water.length > 0) {
      const want = Math.min(KELP_TARGET, water.length);
      const used = new Set<number>();
      let guard = 0;
      while (kelpBeds.length < want && guard < want * 30) {
        guard++;
        const i = rng.int(0, water.length);
        if (used.has(i)) continue;
        used.add(i);
        const spot = water[i]!;
        kelpBeds.push({ x: spot.x, y: spot.y, phase: rng.nextFloat() * Math.PI * 2, flip: rng.nextFloat() < 0.5 });
      }
    }
  }
  return kelpBeds;
}

function pushKelp(renderer: Pick<RendererLike, "push">, nowMs: number, view: View): void {
  const t = nowMs * 0.0016;
  for (const k of getKelp()) {
    if (k.x < view.left - TILE || k.x > view.right + TILE || k.y < view.top - TILE || k.y > view.bottom + TILE) continue;
    const sway = Math.sin(t + k.phase);
    const frame = sway >= 0 ? "decoration/kelp-a" : "decoration/kelp-b";
    renderer.push({
      x: k.x + sway * 1.5, y: k.y, width: TILE, height: TILE,
      frame, atlasId: "props", rotation: 0, layer: LAYER.KELP, alpha: 0.6,
      tintRgba: UNDERWATER_TINT, flipX: k.flip,
    });
  }
}

interface Vent { x: number; y: number; cd: number; }
let vents: Vent[] | null = null;
const VENT_TARGET = 14;
function getVents(): Vent[] {
  if (vents === null) {
    const rng = createRng(WORLD_GEN_SEED).fork("bubble-vents");
    const water = getOpenWater();
    vents = [];
    const want = Math.min(VENT_TARGET, water.length);
    const used = new Set<number>();
    let guard = 0;
    while (vents.length < want && guard < want * 30) {
      guard++;
      const i = rng.int(0, water.length);
      if (used.has(i)) continue;
      used.add(i);
      const spot = water[i]!;
      vents.push({ x: spot.x, y: spot.y, cd: rand(1, 5) });
    }
  }
  return vents;
}

function updateBubbles(particles: ParticleSystem, dt: number, view: View): void {
  for (const v of getVents()) {
    v.cd -= dt;
    if (v.cd > 0) continue;
    v.cd = rand(3, 8);
    if (v.x < view.left - TILE || v.x > view.right + TILE || v.y < view.top - TILE || v.y > view.bottom + TILE) continue;
    particles.emit({
      x: v.x, y: v.y + 4, count: 5, shape: "circle",
      color: EDG.skyBlue, color2: EDG.silver,
      speedMin: 6, speedMax: 16,
      angleMin: -Math.PI * 0.6, angleMax: -Math.PI * 0.4, 
      lifetimeMin: 1.0, lifetimeMax: 2.0,
      sizeMin: 0.5, sizeMax: 1.2,
      gravity: -8, 
    });
  }
}

interface Jelly { x: number; y: number; vx: number; phase: number; t: number; life: number; }
const jellies: Jelly[] = [];
const MAX_JELLIES = 4;
let jellyCd = 2;
const JELLY_FADE = 2;
function updateJellies(renderer: Pick<RendererLike, "push">, nowMs: number, dt: number, view: View): void {
  jellyCd -= dt;
  if (jellyCd <= 0 && jellies.length < MAX_JELLIES) {
    jellyCd = rand(4, 11);
    const spot = pick(getOpenWater());
    if (spot !== null) {
      jellies.push({ x: spot.x, y: spot.y, vx: rand(-6, 6), phase: rand(0, Math.PI * 2), t: 0, life: rand(14, 26) });
    }
  }
  for (let i = jellies.length - 1; i >= 0; i--) {
    const j = jellies[i]!;
    j.t += dt;
    if (j.t >= j.life) { jellies.splice(i, 1); continue; }

    const pulse = Math.sin(nowMs * 0.004 + j.phase);
    j.x += j.vx * dt;
    j.y -= (4 + 3 * pulse) * dt; 
    const tx = Math.floor(j.x / TILE), ty = Math.floor(j.y / TILE);
    if (j.x < 0 || j.y < 0 || tx >= WORLD_WIDTH || ty >= WORLD_HEIGHT || isWalkable(tx, ty)) {

      jellies.splice(i, 1);
      continue;
    }
    if (j.x < view.left - TILE || j.x > view.right + TILE || j.y < view.top - TILE || j.y > view.bottom + TILE) continue;
    const fadeIn = Math.min(1, j.t / JELLY_FADE);
    const fadeOut = Math.min(1, (j.life - j.t) / JELLY_FADE);
    const frame = pulse >= 0 ? "decoration/jelly-a" : "decoration/jelly-b";
    renderer.push({
      x: j.x, y: j.y, width: TILE, height: TILE,
      frame, atlasId: "props", rotation: 0,
      layer: LAYER.JELLY, alpha: 0.55 * Math.min(fadeIn, fadeOut),
      tintRgba: UNDERWATER_TINT,
    });
  }
}

interface Turtle { x: number; y: number; dir: 1 | -1; }
let turtle: Turtle | null = null;
let turtleCd = 6;
const TURTLE_SPEED = TILE * 1.2;
function updateTurtles(renderer: Pick<RendererLike, "push">, nowMs: number, dt: number, view: View): void {
  if (turtle === null) {
    turtleCd -= dt;
    if (turtleCd > 0) return;
    const lane = pick(getDeepRows());
    if (lane === null) { turtleCd = 8; return; }
    const dir: 1 | -1 = (Math.floor(nowMs / 1000) & 1) === 0 ? 1 : -1;
    const startX = dir === 1 ? -TILE * 2 : WORLD_WIDTH * TILE + TILE * 2;
    turtle = { x: startX, y: lane * TILE + TILE / 2, dir };
  }
  turtle.x += TURTLE_SPEED * dt * turtle.dir;
  if (turtle.x < -TILE * 3 || turtle.x > WORLD_WIDTH * TILE + TILE * 3) { turtle = null; turtleCd = rand(10, 24); return; }
  const tx = Math.floor(turtle.x / TILE), ty = Math.floor(turtle.y / TILE);
  const overOcean = tx >= 0 && tx < WORLD_WIDTH && !isWalkable(tx, ty);
  const onScreen =
    turtle.x >= view.left - TILE * 2 && turtle.x <= view.right + TILE * 2 &&
    turtle.y >= view.top - TILE && turtle.y <= view.bottom + TILE;
  if (overOcean && onScreen) {
    const frame = (Math.floor(nowMs / 420) & 1) === 0 ? "decoration/turtle-a" : "decoration/turtle-b";
    renderer.push({
      x: turtle.x, y: turtle.y, width: TILE, height: TILE,
      frame, atlasId: "props", rotation: 0,
      layer: LAYER.TURTLE, alpha: 0.5, tintRgba: UNDERWATER_TINT, flipX: turtle.dir === -1,
    });
  }
}

export function pushWaterDecor(
  renderer: Pick<RendererLike, "push">,
  particles: ParticleSystem,
  nowMs: number,
  dt: number,
  view: View,
): void {
  pushKelp(renderer, nowMs, view);
  updateBubbles(particles, dt, view);
  updateJellies(renderer, nowMs, dt, view);
  updateTurtles(renderer, nowMs, dt, view);
  updateWhales(renderer, particles, nowMs, dt, view);
  updateDucks(renderer, nowMs, dt, view);
}
