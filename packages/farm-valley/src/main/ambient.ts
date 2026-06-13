

import { createRng } from "@engine/core/runtime";
import type { Rng } from "@engine/core/runtime";
import type { Canvas2dSprite } from "@engine/core/render";
import { FORGE_SMOKE_FRAMES } from "@farm/sim-core/render-systems";
import type { Season } from "@farm/sim-core/protocols/weather";

const CONSTANTS = {

  BIRD_CAP: 6,
  LEAF_CAP: 20,
  SMOKE_CAP: 12,

  BIRD_LAYER: 95,
  LEAF_LAYER: 50,
  SMOKE_LAYER: 42,

  BIRD_SPAWN_INTERVAL_MIN_S: 20,
  BIRD_SPAWN_INTERVAL_MAX_S: 60,

  BIRD_SPAWN_COUNT_MAX: 3,

  BIRD_SPEED_MIN: 30,
  BIRD_SPEED_MAX: 60,

  BIRD_FLAP_PERIOD_MS: 400,

  BIRD_ARC_AMP: 4,

  BIRD_ARC_FREQ: 0.008,

  LEAF_SPAWN_INTERVAL_MIN_S: 1.5,
  LEAF_SPAWN_INTERVAL_MAX_S: 3.0,

  LEAF_LIFE_S: 2.0,

  LEAF_FADE_FRAC: 0.25,

  LEAF_FALL_SPEED_MIN: 15,
  LEAF_FALL_SPEED_MAX: 30,

  LEAF_SWAY_AMP: 6,
  LEAF_SWAY_FREQ: 0.8,

  LEAF_DRIFT_MIN: -6,
  LEAF_DRIFT_MAX: 8,

  LEAF_SPAWN_Y_OFFSET: -8,

  LEAF_VIEW_MARGIN: 32,

  SMOKE_SPAWN_INTERVAL_MIN_S: 1.2,
  SMOKE_SPAWN_INTERVAL_MAX_S: 2.5,

  SMOKE_LIFE_S: 1.8,

  SMOKE_RISE_SPEED: 8,

  SMOKE_DRIFT_MIN: -2,
  SMOKE_DRIFT_MAX: 3,

  SMOKE_NIGHT_SUPPRESS: 0.6,

  SMOKE_ALPHA_MAX: 0.45,

  SMOKE_FRAME_PERIOD_MS: 700,

  SPRITE_PX: 16,
} as const;

const BIRD_FRAMES = ["decoration/bird-a", "decoration/bird-b"] as const;
const LEAF_FRAME_GREEN = "decoration/leaf-a";
const LEAF_FRAME_AUTUMN = "decoration/leaf-autumn";

const SMOKE_BUILDING_FRAMES = new Set([
  "structure/carpenter-workshop",
  "structure/home",
  "structure/shopkeeper",
  "structure/market-wall",
  "structure/blacksmith",
]);

interface BirdParticle {
  active: boolean;
  x: number;
  y: number;

  baseY: number;

  travelPx: number;

  speedX: number;

  totalDistPx: number;

  spawnMs: number;
}

interface LeafParticle {
  active: boolean;
  x: number;
  y: number;

  life: number;
  fallSpeed: number;
  swayPhase: number;
  driftX: number;
}

interface SmokeParticle {
  active: boolean;
  x: number;
  y: number;

  life: number;
  driftX: number;

  spawnMs: number;
}

interface SmokeAnchor {
  x: number;
  y: number;

  countdown: number;
}

function makeBirdPool(n: number): BirdParticle[] {
  const arr: BirdParticle[] = [];
  for (let i = 0; i < n; i++) {
    arr.push({ active: false, x: 0, y: 0, baseY: 0, travelPx: 0, speedX: 0, totalDistPx: 0, spawnMs: 0 });
  }
  return arr;
}

function makeLeafPool(n: number): LeafParticle[] {
  const arr: LeafParticle[] = [];
  for (let i = 0; i < n; i++) {
    arr.push({ active: false, x: 0, y: 0, life: 0, fallSpeed: 0, swayPhase: 0, driftX: 0 });
  }
  return arr;
}

function makeSmokePool(n: number): SmokeParticle[] {
  const arr: SmokeParticle[] = [];
  for (let i = 0; i < n; i++) {
    arr.push({ active: false, x: 0, y: 0, life: 0, driftX: 0, spawnMs: 0 });
  }
  return arr;
}

function makeSpritePool(n: number): Canvas2dSprite[] {
  const arr: Canvas2dSprite[] = [];
  for (let i = 0; i < n; i++) {
    arr.push({ x: 0, y: 0, width: 16, height: 16, frame: "", atlasId: "", rotation: 0, layer: 0, alpha: 1 });
  }
  return arr;
}

export interface ViewRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export class AmbientLayer {
  private rng: Rng;

  private treeAnchors: Array<{ x: number; y: number }> = [];
  private smokeAnchors: SmokeAnchor[] = [];

  private birds: BirdParticle[];
  private leaves: LeafParticle[];
  private smoke: SmokeParticle[];

  private birdSprites: Canvas2dSprite[];
  private leafSprites: Canvas2dSprite[];
  private smokeSprites: Canvas2dSprite[];

  private birdCountdown: number = 0;

  private leafCountdown: number = 0;

  constructor() {

    this.rng = createRng(0);
    this.birds = makeBirdPool(CONSTANTS.BIRD_CAP);
    this.leaves = makeLeafPool(CONSTANTS.LEAF_CAP);
    this.smoke = makeSmokePool(CONSTANTS.SMOKE_CAP);
    this.birdSprites = makeSpritePool(CONSTANTS.BIRD_CAP);
    this.leafSprites = makeSpritePool(CONSTANTS.LEAF_CAP);
    this.smokeSprites = makeSpritePool(CONSTANTS.SMOKE_CAP);
  }

  init(staticSprites: readonly Canvas2dSprite[], seed: number): void {

    this.rng = createRng((seed ^ 0xdeadbeef) >>> 0);
    this.treeAnchors = [];
    this.smokeAnchors = [];

    for (const s of staticSprites) {
      if (s.frame.startsWith("structure/tree")) {
        this.treeAnchors.push({ x: s.x, y: s.y });
      } else if (SMOKE_BUILDING_FRAMES.has(s.frame)) {

        const chimneyX = s.x;
        const chimneyY = s.y - s.height / 2 + 2;
        this.smokeAnchors.push({
          x: chimneyX,
          y: chimneyY,

          countdown: this.rng.range(
            CONSTANTS.SMOKE_SPAWN_INTERVAL_MIN_S,
            CONSTANTS.SMOKE_SPAWN_INTERVAL_MAX_S,
          ),
        });
      }
    }

    this.birdCountdown = this.rng.range(
      CONSTANTS.BIRD_SPAWN_INTERVAL_MIN_S,
      CONSTANTS.BIRD_SPAWN_INTERVAL_MAX_S,
    );
    this.leafCountdown = this.rng.range(
      CONSTANTS.LEAF_SPAWN_INTERVAL_MIN_S,
      CONSTANTS.LEAF_SPAWN_INTERVAL_MAX_S,
    );
  }

  update(
    dtMs: number,
    nowMs: number,
    view: ViewRect,
    nightness: number,
    season: Season,
  ): void {

    this._season = season;
    this._nowMs = nowMs;

    const dtS = dtMs / 1000;

    this._updateBirds(dtS, nowMs, view);
    this._updateLeaves(dtS, view);
    this._updateSmoke(dtS, nowMs, nightness, view);
  }

  private _season: Season = "spring";

  private _nowMs: number = 0;

  private _updateBirds(dtS: number, nowMs: number, view: ViewRect): void {

    for (const bird of this.birds) {
      if (!bird.active) continue;
      const dx = bird.speedX * dtS;
      bird.travelPx += Math.abs(dx);
      bird.x += dx;

      bird.y = bird.baseY + Math.sin(bird.travelPx * CONSTANTS.BIRD_ARC_FREQ * Math.PI * 2) * CONSTANTS.BIRD_ARC_AMP;

      if (
        (bird.speedX > 0 && bird.x > view.right + CONSTANTS.SPRITE_PX) ||
        (bird.speedX < 0 && bird.x < view.left - CONSTANTS.SPRITE_PX) ||
        bird.travelPx >= bird.totalDistPx
      ) {
        bird.active = false;
      }
    }

    this.birdCountdown -= dtS;
    if (this.birdCountdown <= 0) {
      this.birdCountdown = this.rng.range(
        CONSTANTS.BIRD_SPAWN_INTERVAL_MIN_S,
        CONSTANTS.BIRD_SPAWN_INTERVAL_MAX_S,
      );
      const count = this.rng.int(1, CONSTANTS.BIRD_SPAWN_COUNT_MAX + 1);
      const goRight = this.rng.nextFloat() < 0.5;
      const viewW = view.right - view.left;
      const viewH = view.bottom - view.top;

      for (let i = 0; i < count; i++) {
        const slot = this._findFreeSlot(this.birds);
        if (slot === -1) break; 

        const bird = this.birds[slot]!;
        bird.active = true;
        const speed = this.rng.range(CONSTANTS.BIRD_SPEED_MIN, CONSTANTS.BIRD_SPEED_MAX);
        bird.speedX = goRight ? speed : -speed;

        bird.x = goRight ? view.left - CONSTANTS.SPRITE_PX : view.right + CONSTANTS.SPRITE_PX;
        bird.baseY = view.top + this.rng.range(viewH * 0.05, viewH * 0.4);
        bird.y = bird.baseY;
        bird.travelPx = 0;
        bird.totalDistPx = viewW + CONSTANTS.SPRITE_PX * 4 + i * 12;

        bird.spawnMs = nowMs - i * 80;
      }
    }
  }

  private _updateLeaves(dtS: number, view: ViewRect): void {

    for (const leaf of this.leaves) {
      if (!leaf.active) continue;
      leaf.life += dtS;
      leaf.x += leaf.driftX * dtS +
        Math.sin(leaf.swayPhase + leaf.life * CONSTANTS.LEAF_SWAY_FREQ * Math.PI * 2) * CONSTANTS.LEAF_SWAY_AMP * dtS;
      leaf.y += leaf.fallSpeed * dtS;

      if (leaf.life >= CONSTANTS.LEAF_LIFE_S) {
        leaf.active = false;
      }
    }

    this.leafCountdown -= dtS;
    if (this.leafCountdown <= 0) {
      this.leafCountdown = this.rng.range(
        CONSTANTS.LEAF_SPAWN_INTERVAL_MIN_S,
        CONSTANTS.LEAF_SPAWN_INTERVAL_MAX_S,
      );

      if (this.treeAnchors.length === 0) return;

      const margin = CONSTANTS.LEAF_VIEW_MARGIN;
      const near = this.treeAnchors.filter(
        (a) =>
          a.x >= view.left - margin &&
          a.x <= view.right + margin &&
          a.y >= view.top - margin &&
          a.y <= view.bottom + margin,
      );
      if (near.length === 0) return;

      const slot = this._findFreeSlot(this.leaves);
      if (slot === -1) return;

      const anchor = near[this.rng.int(0, near.length)]!;
      const leaf = this.leaves[slot]!;
      leaf.active = true;
      leaf.x = anchor.x + this.rng.range(-4, 4);
      leaf.y = anchor.y + CONSTANTS.LEAF_SPAWN_Y_OFFSET;
      leaf.life = 0;
      leaf.fallSpeed = this.rng.range(CONSTANTS.LEAF_FALL_SPEED_MIN, CONSTANTS.LEAF_FALL_SPEED_MAX);
      leaf.swayPhase = this.rng.range(0, Math.PI * 2);
      leaf.driftX = this.rng.range(CONSTANTS.LEAF_DRIFT_MIN, CONSTANTS.LEAF_DRIFT_MAX);
    }
  }

  private _updateSmoke(dtS: number, nowMs: number, nightness: number, _view: ViewRect): void {

    for (const wisp of this.smoke) {
      if (!wisp.active) continue;
      wisp.life += dtS;
      wisp.y -= CONSTANTS.SMOKE_RISE_SPEED * dtS;
      wisp.x += wisp.driftX * dtS;
      if (wisp.life >= CONSTANTS.SMOKE_LIFE_S) {
        wisp.active = false;
      }
    }

    const nightSuppression = 1 - CONSTANTS.SMOKE_NIGHT_SUPPRESS * nightness;
    for (const anchor of this.smokeAnchors) {
      anchor.countdown -= dtS;
      if (anchor.countdown <= 0) {
        const interval = this.rng.range(
          CONSTANTS.SMOKE_SPAWN_INTERVAL_MIN_S,
          CONSTANTS.SMOKE_SPAWN_INTERVAL_MAX_S,
        ) / nightSuppression;
        anchor.countdown = interval;

        const slot = this._findFreeSlot(this.smoke);
        if (slot === -1) continue;

        const wisp = this.smoke[slot]!;
        wisp.active = true;
        wisp.x = anchor.x + this.rng.range(-2, 2);
        wisp.y = anchor.y;
        wisp.life = 0;
        wisp.driftX = this.rng.range(CONSTANTS.SMOKE_DRIFT_MIN, CONSTANTS.SMOKE_DRIFT_MAX);
        wisp.spawnMs = nowMs;
      }
    }
  }

  pushSprites(renderer: { push(s: Canvas2dSprite): void }): void {
    const nowMs = this._nowMs;
    const season = this._season;
    const leafFrame = season === "autumn" ? LEAF_FRAME_AUTUMN : LEAF_FRAME_GREEN;
    const px = CONSTANTS.SPRITE_PX;

    let birdSpriteIdx = 0;
    for (const bird of this.birds) {
      if (!bird.active) continue;
      if (birdSpriteIdx >= this.birdSprites.length) break;
      const elapsed = nowMs - bird.spawnMs;
      const flapStep = Math.floor(elapsed / (CONSTANTS.BIRD_FLAP_PERIOD_MS / 2)) % 2;
      const frame = BIRD_FRAMES[flapStep]!;
      const sprite = this.birdSprites[birdSpriteIdx++]!;
      sprite.x = bird.x;
      sprite.y = bird.y;
      sprite.width = px;
      sprite.height = px;
      sprite.frame = frame;
      sprite.atlasId = "props";
      sprite.rotation = 0;
      sprite.layer = CONSTANTS.BIRD_LAYER;
      sprite.alpha = 1;
      sprite.flipX = bird.speedX < 0;
      renderer.push(sprite);
    }

    let leafSpriteIdx = 0;
    for (const leaf of this.leaves) {
      if (!leaf.active) continue;
      if (leafSpriteIdx >= this.leafSprites.length) break;
      const lifeRemaining = CONSTANTS.LEAF_LIFE_S - leaf.life;
      const fadeFrac = CONSTANTS.LEAF_FADE_FRAC * CONSTANTS.LEAF_LIFE_S;
      const alpha = lifeRemaining < fadeFrac ? lifeRemaining / fadeFrac : 1;
      const sprite = this.leafSprites[leafSpriteIdx++]!;
      sprite.x = leaf.x;
      sprite.y = leaf.y;
      sprite.width = px;
      sprite.height = px;
      sprite.frame = leafFrame;
      sprite.atlasId = "props";
      sprite.rotation = 0;
      sprite.layer = CONSTANTS.LEAF_LAYER;
      sprite.alpha = alpha;
      renderer.push(sprite);
    }

    let smokeSpriteIdx = 0;
    for (const wisp of this.smoke) {
      if (!wisp.active) continue;
      if (smokeSpriteIdx >= this.smokeSprites.length) break;
      const t = wisp.life / CONSTANTS.SMOKE_LIFE_S; 
      const alpha = CONSTANTS.SMOKE_ALPHA_MAX * (1 - t);
      const frameIdx =
        Math.floor((nowMs - wisp.spawnMs) / (CONSTANTS.SMOKE_FRAME_PERIOD_MS / FORGE_SMOKE_FRAMES.length)) %
        FORGE_SMOKE_FRAMES.length;
      const frame = FORGE_SMOKE_FRAMES[frameIdx]!;
      const sprite = this.smokeSprites[smokeSpriteIdx++]!;
      sprite.x = wisp.x;
      sprite.y = wisp.y;
      sprite.width = px;
      sprite.height = px;
      sprite.frame = frame;
      sprite.atlasId = "buildings";
      sprite.rotation = 0;
      sprite.layer = CONSTANTS.SMOKE_LAYER;
      sprite.alpha = alpha;
      renderer.push(sprite);
    }
  }

  private _findFreeSlot(pool: ReadonlyArray<{ active: boolean }>): number {
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i]!.active) return i;
    }
    return -1;
  }
}
