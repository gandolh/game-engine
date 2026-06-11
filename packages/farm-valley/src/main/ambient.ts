/**
 * AmbientLayer — client-side ambient particle layer.
 *
 * Three effects: birds crossing the sky, leaves drifting from trees, and
 * chimney smoke rising from buildings. Everything is seeded mulberry32;
 * no Math.random() calls anywhere in this file.
 *
 * Math.random is intentionally absent — all randomness flows through
 * createRng(seed) to keep "same seed → same movie" intact.
 */

import { createRng } from "@engine/core/runtime";
import type { Rng } from "@engine/core/runtime";
import type { Canvas2dSprite } from "@engine/core/render";
import { FORGE_SMOKE_FRAMES } from "@farm/sim-core/render-systems";
import type { Season } from "@farm/sim-core/protocols/weather";

// ---------------------------------------------------------------------------
// Tunable constants — adjust for taste without touching logic below.
// ---------------------------------------------------------------------------
const CONSTANTS = {
  // Pool sizes (hard caps; never allocate past these)
  BIRD_CAP: 6,
  LEAF_CAP: 20,
  SMOKE_CAP: 12,

  // Sprite layers
  BIRD_LAYER: 95,
  LEAF_LAYER: 50,
  SMOKE_LAYER: 42,

  // Birds: seconds between spawns (uniform random in [min,max])
  BIRD_SPAWN_INTERVAL_MIN_S: 20,
  BIRD_SPAWN_INTERVAL_MAX_S: 60,
  // How many birds spawn per event (1..MAX)
  BIRD_SPAWN_COUNT_MAX: 3,
  // Speed range (world-px / second)
  BIRD_SPEED_MIN: 30,
  BIRD_SPEED_MAX: 60,
  // Wing flap period (ms per full cycle — A→B→A)
  BIRD_FLAP_PERIOD_MS: 400,
  // Vertical sine arc amplitude (px)
  BIRD_ARC_AMP: 4,
  // Arc frequency (full cycles per world-px of horizontal travel)
  BIRD_ARC_FREQ: 0.008,

  // Leaves: seconds between spawns
  LEAF_SPAWN_INTERVAL_MIN_S: 1.5,
  LEAF_SPAWN_INTERVAL_MAX_S: 3.0,
  // Life of one leaf (seconds)
  LEAF_LIFE_S: 2.0,
  // Alpha fade begins at this fraction of life remaining
  LEAF_FADE_FRAC: 0.25,
  // Fall speed (world-px/s)
  LEAF_FALL_SPEED_MIN: 15,
  LEAF_FALL_SPEED_MAX: 30,
  // Horizontal sway sine amplitude (px) and frequency (cycles/s)
  LEAF_SWAY_AMP: 6,
  LEAF_SWAY_FREQ: 0.8,
  // Downwind drift speed (world-px/s; can be negative for left drift)
  LEAF_DRIFT_MIN: -6,
  LEAF_DRIFT_MAX: 8,
  // How many px above/below the tree anchor the leaf spawns
  LEAF_SPAWN_Y_OFFSET: -8,
  // How far outside the current view to still count a tree as "near"
  LEAF_VIEW_MARGIN: 32,

  // Smoke: seconds between per-anchor spawns
  SMOKE_SPAWN_INTERVAL_MIN_S: 1.2,
  SMOKE_SPAWN_INTERVAL_MAX_S: 2.5,
  // Life of one smoke wisp (seconds)
  SMOKE_LIFE_S: 1.8,
  // Rise speed (world-px/s)
  SMOKE_RISE_SPEED: 8,
  // Horizontal drift per second (world-px/s)
  SMOKE_DRIFT_MIN: -2,
  SMOKE_DRIFT_MAX: 3,
  // Night suppression factor: smoke spawn rate × (1 - SMOKE_NIGHT_SUPPRESS * nightness)
  SMOKE_NIGHT_SUPPRESS: 0.6,
  // Alpha of smoke wisps
  SMOKE_ALPHA_MAX: 0.45,
  // Frame cycle period (ms)
  SMOKE_FRAME_PERIOD_MS: 700,

  // Sprite pixel size (all ambient sprites are 16×16)
  SPRITE_PX: 16,
} as const;

// ---------------------------------------------------------------------------
// Frames for bird and leaf sprites
// ---------------------------------------------------------------------------
const BIRD_FRAMES = ["decoration/bird-a", "decoration/bird-b"] as const;
const LEAF_FRAME_GREEN = "decoration/leaf-a";
const LEAF_FRAME_AUTUMN = "decoration/leaf-autumn";

// Building frames that produce smoke anchors (forge-house excluded — its smoke
// is already driven by the forge chimney animation in render-loop.ts).
const SMOKE_BUILDING_FRAMES = new Set([
  "structure/carpenter-workshop",
  "structure/home",
  "structure/shopkeeper",
  "structure/market-wall",
  "structure/blacksmith",
]);

// ---------------------------------------------------------------------------
// Particle record types (reused objects to avoid per-frame allocation)
// ---------------------------------------------------------------------------
interface BirdParticle {
  active: boolean;
  x: number;
  y: number;
  /** Y baseline (sine arc is relative to this) */
  baseY: number;
  /** Horizontal travel from spawn (accumulated) */
  travelPx: number;
  /** Pixels per second; negative = left-moving */
  speedX: number;
  /** Total horizontal distance until despawn (positive) */
  totalDistPx: number;
  /** Wall-clock ms at spawn (for flap phase) */
  spawnMs: number;
}

interface LeafParticle {
  active: boolean;
  x: number;
  y: number;
  /** Elapsed life in seconds */
  life: number;
  fallSpeed: number;
  swayPhase: number;
  driftX: number;
}

interface SmokeParticle {
  active: boolean;
  x: number;
  y: number;
  /** Elapsed life in seconds */
  life: number;
  driftX: number;
  /** Wall-clock ms at spawn (for frame cycle) */
  spawnMs: number;
}

// ---------------------------------------------------------------------------
// Per-building-anchor state
// ---------------------------------------------------------------------------
interface SmokeAnchor {
  x: number;
  y: number;
  /** Countdown in seconds until next smoke spawn for this anchor */
  countdown: number;
}

// ---------------------------------------------------------------------------
// Utility: build a preallocated pool of N records
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Sprite record pool (reused Canvas2dSprite objects for pushSprites)
// ---------------------------------------------------------------------------
function makeSpritePool(n: number): Canvas2dSprite[] {
  const arr: Canvas2dSprite[] = [];
  for (let i = 0; i < n; i++) {
    arr.push({ x: 0, y: 0, width: 16, height: 16, frame: "", atlasId: "", rotation: 0, layer: 0, alpha: 1 });
  }
  return arr;
}

// ---------------------------------------------------------------------------
// AmbientLayer
// ---------------------------------------------------------------------------

export interface ViewRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export class AmbientLayer {
  private rng: Rng;

  // Anchor lists populated by init()
  private treeAnchors: Array<{ x: number; y: number }> = [];
  private smokeAnchors: SmokeAnchor[] = [];

  // Particle pools
  private birds: BirdParticle[];
  private leaves: LeafParticle[];
  private smoke: SmokeParticle[];

  // Sprite record pools for pushSprites (no per-frame allocation)
  private birdSprites: Canvas2dSprite[];
  private leafSprites: Canvas2dSprite[];
  private smokeSprites: Canvas2dSprite[];

  // Global countdown for the next bird flock event
  private birdCountdown: number = 0;
  // Leaf spawn countdown
  private leafCountdown: number = 0;

  constructor() {
    // Rng is seeded in init(); provide a stable placeholder.
    this.rng = createRng(0);
    this.birds = makeBirdPool(CONSTANTS.BIRD_CAP);
    this.leaves = makeLeafPool(CONSTANTS.LEAF_CAP);
    this.smoke = makeSmokePool(CONSTANTS.SMOKE_CAP);
    this.birdSprites = makeSpritePool(CONSTANTS.BIRD_CAP);
    this.leafSprites = makeSpritePool(CONSTANTS.LEAF_CAP);
    this.smokeSprites = makeSpritePool(CONSTANTS.SMOKE_CAP);
  }

  /**
   * Call once when the static layer is baked. Extracts tree and building anchors
   * from the rendered sprite list; seeds the local rng.
   */
  init(staticSprites: readonly Canvas2dSprite[], seed: number): void {
    // Derive a distinct seed so ambient rng diverges from any sim rng.
    this.rng = createRng((seed ^ 0xdeadbeef) >>> 0);
    this.treeAnchors = [];
    this.smokeAnchors = [];

    for (const s of staticSprites) {
      if (s.frame.startsWith("structure/tree")) {
        this.treeAnchors.push({ x: s.x, y: s.y });
      } else if (SMOKE_BUILDING_FRAMES.has(s.frame)) {
        // Chimney at top-center of the sprite
        const chimneyX = s.x;
        const chimneyY = s.y - s.height / 2 + 2;
        this.smokeAnchors.push({
          x: chimneyX,
          y: chimneyY,
          // Stagger initial countdowns so buildings don't all puff at once
          countdown: this.rng.range(
            CONSTANTS.SMOKE_SPAWN_INTERVAL_MIN_S,
            CONSTANTS.SMOKE_SPAWN_INTERVAL_MAX_S,
          ),
        });
      }
    }

    // Initialise global bird/leaf countdowns
    this.birdCountdown = this.rng.range(
      CONSTANTS.BIRD_SPAWN_INTERVAL_MIN_S,
      CONSTANTS.BIRD_SPAWN_INTERVAL_MAX_S,
    );
    this.leafCountdown = this.rng.range(
      CONSTANTS.LEAF_SPAWN_INTERVAL_MIN_S,
      CONSTANTS.LEAF_SPAWN_INTERVAL_MAX_S,
    );
  }

  /**
   * Advance all particles by dtMs milliseconds.
   *
   * @param dtMs      - Frame delta in milliseconds (already capped at 100ms by render-loop).
   * @param nowMs     - Current wall-clock time in milliseconds (performance.now()).
   * @param view      - Current visible world rect in world-px coordinates.
   * @param nightness - 0 = full day, 1 = full night; scales smoke spawn rate down.
   * @param season    - Current season (for leaf frame selection in pushSprites).
   */
  update(
    dtMs: number,
    nowMs: number,
    view: ViewRect,
    nightness: number,
    season: Season,
  ): void {
    // Store season for pushSprites
    this._season = season;
    this._nowMs = nowMs;

    const dtS = dtMs / 1000;

    this._updateBirds(dtS, nowMs, view);
    this._updateLeaves(dtS, view);
    this._updateSmoke(dtS, nowMs, nightness, view);
  }

  /** Current season — stored by update() and consumed by pushSprites(). */
  private _season: Season = "spring";
  /** nowMs stored by update() for frame cycling in pushSprites(). */
  private _nowMs: number = 0;

  // ---------------------------------------------------------------------------
  // Bird logic
  // ---------------------------------------------------------------------------
  private _updateBirds(dtS: number, nowMs: number, view: ViewRect): void {
    // Advance active birds
    for (const bird of this.birds) {
      if (!bird.active) continue;
      const dx = bird.speedX * dtS;
      bird.travelPx += Math.abs(dx);
      bird.x += dx;

      // Sine arc relative to baseline
      bird.y = bird.baseY + Math.sin(bird.travelPx * CONSTANTS.BIRD_ARC_FREQ * Math.PI * 2) * CONSTANTS.BIRD_ARC_AMP;

      // Despawn when fully past the view
      if (
        (bird.speedX > 0 && bird.x > view.right + CONSTANTS.SPRITE_PX) ||
        (bird.speedX < 0 && bird.x < view.left - CONSTANTS.SPRITE_PX) ||
        bird.travelPx >= bird.totalDistPx
      ) {
        bird.active = false;
      }
    }

    // Countdown to next flock
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
        if (slot === -1) break; // pool full

        const bird = this.birds[slot]!;
        bird.active = true;
        const speed = this.rng.range(CONSTANTS.BIRD_SPEED_MIN, CONSTANTS.BIRD_SPEED_MAX);
        bird.speedX = goRight ? speed : -speed;
        // Spawn just off the view edge; flock birds stagger by a few px vertically
        bird.x = goRight ? view.left - CONSTANTS.SPRITE_PX : view.right + CONSTANTS.SPRITE_PX;
        bird.baseY = view.top + this.rng.range(viewH * 0.05, viewH * 0.4);
        bird.y = bird.baseY;
        bird.travelPx = 0;
        bird.totalDistPx = viewW + CONSTANTS.SPRITE_PX * 4 + i * 12;
        bird.spawnMs = nowMs + i * 80; // stagger flap phase per bird
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Leaf logic
  // ---------------------------------------------------------------------------
  private _updateLeaves(dtS: number, view: ViewRect): void {
    // Advance active leaves
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

    // Countdown to next leaf spawn
    this.leafCountdown -= dtS;
    if (this.leafCountdown <= 0) {
      this.leafCountdown = this.rng.range(
        CONSTANTS.LEAF_SPAWN_INTERVAL_MIN_S,
        CONSTANTS.LEAF_SPAWN_INTERVAL_MAX_S,
      );

      if (this.treeAnchors.length === 0) return;

      // Find a tree anchor near the view
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

  // ---------------------------------------------------------------------------
  // Smoke logic
  // ---------------------------------------------------------------------------
  private _updateSmoke(dtS: number, nowMs: number, nightness: number, _view: ViewRect): void {
    // Advance active wisps
    for (const wisp of this.smoke) {
      if (!wisp.active) continue;
      wisp.life += dtS;
      wisp.y -= CONSTANTS.SMOKE_RISE_SPEED * dtS;
      wisp.x += wisp.driftX * dtS;
      if (wisp.life >= CONSTANTS.SMOKE_LIFE_S) {
        wisp.active = false;
      }
    }

    // Per-anchor spawn countdown
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

  // ---------------------------------------------------------------------------
  // Push sprites into the renderer's dynamic queue
  // ---------------------------------------------------------------------------
  pushSprites(renderer: { push(s: Canvas2dSprite): void }): void {
    const nowMs = this._nowMs;
    const season = this._season;
    const leafFrame = season === "autumn" ? LEAF_FRAME_AUTUMN : LEAF_FRAME_GREEN;
    const px = CONSTANTS.SPRITE_PX;

    // Birds
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

    // Leaves
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

    // Smoke
    let smokeSpriteIdx = 0;
    for (const wisp of this.smoke) {
      if (!wisp.active) continue;
      if (smokeSpriteIdx >= this.smokeSprites.length) break;
      const t = wisp.life / CONSTANTS.SMOKE_LIFE_S; // 0→1 over life
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

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private _findFreeSlot(pool: ReadonlyArray<{ active: boolean }>): number {
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i]!.active) return i;
    }
    return -1;
  }
}
