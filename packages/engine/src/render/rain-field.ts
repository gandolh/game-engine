/** Pseudo-3D weather field (rain / snow). Render-only, world-pixel space, drawn with the camera
 *  transform active (same space as sprites/particles). Uses Math.random — display-only, NOT sim.
 *
 *  Why this exists: the old rain sprinkled a fixed number of drops along the TOP edge of the
 *  viewport every frame, so as the camera followed a walking farmer the leading edge swept into a
 *  column of air that had never been seeded — the curtain visibly "reset". Here the field is a
 *  PERSISTENT recycled pool kept at a constant density across a region that tracks the camera:
 *  drops live in world space and fall on their own; only off-screen drops are repositioned (and
 *  that is invisible). Moving the camera no longer resets anything.
 *
 *  Pseudo-3D: each drop has a ground/impact point (gx, gy) plus a height `z` above it. It is drawn
 *  lifted up the screen (screenY = gy - z) and falls until z ≤ 0, at which point it "lands" — the
 *  caller's onImpact(gx, gy) fires (rain only) so a splash/ripple can be spawned at the ground.
 */

import type { Ctx2D } from "./canvas2d/types";
import { EDG } from "./palette";

export type WeatherKind = "rain" | "snow" | "none";

export interface RainViewRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface RainFieldConfig {
  kind: WeatherKind;
  /** Density/visibility multiplier, 0..~1.5 (storm > rainy). */
  intensity: number;
  /** Streak (rain) or flake (snow) color — pass an EDG swatch. */
  color: string;
  /** Draw alpha for the curtain, 0..1. */
  alpha: number;
}

interface Drop {
  gx: number;   // ground/impact world-x
  gy: number;   // ground/impact world-y
  z: number;    // height above ground, world px (falls to 0)
  vz: number;   // fall speed, world px/s (constant per drop — rain doesn't accelerate)
  wind: number; // horizontal drift, world px/s
  scale: number; // 0.7..1.2 depth cue (longer/larger when "nearer")
  phase: number; // snow sway phase
}

const TILE = 16;
const CULL_MARGIN = TILE * 2;

// Per-kind tuning. maxZ is the fall height; vz the fall speed range; density is drops per tile².
const RAIN = { maxZ: TILE * 5, vzMin: 170, vzMax: 250, windMin: 14, windMax: 34, density: 0.22, splashChance: 0.07, streakLen: 9, lineWidth: 0.7 };
const SNOW = { maxZ: TILE * 6, vzMin: 16, vzMax: 34, windMin: -6, windMax: 10, density: 0.12, swayAmp: 6, flakeSize: 1.1 };
const MAX_DROPS = 900; // hard cap so a huge viewport can't blow up the pool on weak hardware

export class RainField {
  private drops: Drop[] = [];
  private kind: WeatherKind = "none";
  private intensity = 1;
  private color: string = EDG.white;
  private alpha = 0.5;
  private timeSec = 0;

  setConfig(cfg: RainFieldConfig): void {
    this.kind = cfg.kind;
    this.intensity = cfg.intensity;
    this.color = cfg.color;
    this.alpha = cfg.alpha;
  }

  /** Advance the field for `dtSec`, keeping a constant-density volume over `view`.
   *  `onImpact(gx, gy)` fires when a rain drop lands (a fraction of drops, see splashChance). */
  update(dtSec: number, view: RainViewRect, onImpact?: (gx: number, gy: number) => void): void {
    this.timeSec += dtSec;
    if (this.kind === "none") {
      if (this.drops.length > 0) this.drops.length = 0;
      return;
    }
    const tune = this.kind === "snow" ? SNOW : RAIN;
    const vw = view.right - view.left;
    const vh = view.bottom - view.top;
    const target = Math.min(
      MAX_DROPS,
      Math.max(0, Math.round((vw / TILE) * (vh / TILE) * tune.density * this.intensity)),
    );

    // Advance + recycle existing drops.
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i]!;
      d.z -= d.vz * dtSec;
      d.gx += d.wind * dtSec;
      if (d.z <= 0) {
        // Landed: rain splashes (a fraction of impacts, to decouple splash cost from streak count).
        if (this.kind === "rain" && onImpact && Math.random() < RAIN.splashChance) {
          onImpact(d.gx, d.gy);
        }
        this.respawn(d, view, tune, true); // re-drop from the sky
      } else if (
        d.gx < view.left - CULL_MARGIN || d.gx > view.right + CULL_MARGIN ||
        d.gy < view.top - CULL_MARGIN || d.gy > view.bottom + CULL_MARGIN
      ) {
        // Drifted out of view because the camera moved — reposition into view at a random height
        // (fills a newly-revealed edge with a full vertical column, so panning shows no gap).
        this.respawn(d, view, tune, false);
      }
    }

    // Grow toward target (spread across the whole volume so density is uniform immediately).
    while (this.drops.length < target) {
      const d: Drop = { gx: 0, gy: 0, z: 0, vz: 0, wind: 0, scale: 1, phase: 0 };
      this.respawn(d, view, tune, false);
      this.drops.push(d);
    }
    // Shrink toward target (viewport got smaller / intensity dropped).
    if (this.drops.length > target) this.drops.length = target;
  }

  private respawn(
    d: Drop,
    view: RainViewRect,
    tune: typeof RAIN | typeof SNOW,
    fromTop: boolean,
  ): void {
    d.gx = view.left + Math.random() * (view.right - view.left);
    d.gy = view.top + Math.random() * (view.bottom - view.top);
    d.z = fromTop ? tune.maxZ : Math.random() * tune.maxZ;
    d.vz = tune.vzMin + Math.random() * (tune.vzMax - tune.vzMin);
    d.wind = tune.windMin + Math.random() * (tune.windMax - tune.windMin);
    d.scale = 0.7 + Math.random() * 0.5;
    d.phase = Math.random() * Math.PI * 2;
  }

  draw(ctx: Ctx2D): void {
    if (this.kind === "none" || this.drops.length === 0) return;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    if (this.kind === "rain") {
      // One batched stroke for the whole curtain — cheap on weak hardware.
      ctx.strokeStyle = this.color;
      ctx.lineWidth = RAIN.lineWidth;
      ctx.beginPath();
      for (const d of this.drops) {
        const len = RAIN.streakLen * d.scale;
        const spd = Math.hypot(d.wind, d.vz) || 1;
        const drawX = d.gx;
        const drawY = d.gy - d.z;
        // Streak trails up-and-against the velocity direction (wind + fall).
        ctx.moveTo(drawX, drawY);
        ctx.lineTo(drawX - (d.wind / spd) * len, drawY - (d.vz / spd) * len);
      }
      ctx.stroke();
    } else {
      // Snow: small squares, gentle horizontal sway. Single fillStyle, batched fillRect.
      ctx.fillStyle = this.color;
      for (const d of this.drops) {
        const s = SNOW.flakeSize * d.scale;
        const sway = Math.sin(this.timeSec * 1.5 + d.phase) * SNOW.swayAmp;
        ctx.fillRect(d.gx + sway - s, d.gy - d.z - s, s * 2, s * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  get count(): number {
    return this.drops.length;
  }

  // ── GPU read API (Wave 4b) ────────────────────────────────────────────────
  // These expose the final screen/world geometry used by draw() so the GPU
  // weather pass can replicate the exact same math without duplicating it.
  // draw(ctx) remains the authoritative Canvas-2D fallback; these are read-only.

  /** The current weather kind. Named `weatherKind` to avoid clashing with the private `kind` field. */
  get weatherKind(): WeatherKind {
    return this.kind;
  }

  /** The EDG color string (CSS hex). Parse at the call site via `rgbOf()` to get floats. */
  get streakColor(): string {
    return this.color;
  }

  /** The draw-alpha for the curtain (globalAlpha in draw()). */
  get curtainAlpha(): number {
    return this.alpha;
  }

  /**
   * Visits the two endpoints of every rain streak using the EXACT same math as draw().
   * (x0, y0) is the head (impact point lifted by z); (x1, y1) is the tail.
   * Only meaningful when weatherKind === "rain".
   */
  forEachRainStreak(
    visit: (x0: number, y0: number, x1: number, y1: number) => void,
  ): void {
    for (const d of this.drops) {
      const len = RAIN.streakLen * d.scale;
      const spd = Math.hypot(d.wind, d.vz) || 1;
      const drawX = d.gx;
      const drawY = d.gy - d.z;
      visit(
        drawX,
        drawY,
        drawX - (d.wind / spd) * len,
        drawY - (d.vz / spd) * len,
      );
    }
  }

  /**
   * Visits the center + half-size of every snow flake using the EXACT same math as draw().
   * `cx` includes the sin-sway; `halfSize` is the s value (SNOW.flakeSize × scale).
   * Only meaningful when weatherKind === "snow".
   */
  forEachSnowFlake(
    visit: (cx: number, cy: number, halfSize: number) => void,
  ): void {
    for (const d of this.drops) {
      const s = SNOW.flakeSize * d.scale;
      const sway = Math.sin(this.timeSec * 1.5 + d.phase) * SNOW.swayAmp;
      visit(d.gx + sway, d.gy - d.z, s);
    }
  }
}
