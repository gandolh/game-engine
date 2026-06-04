/**
 * Lightweight canvas-2D particle system.
 *
 * Particles are pure canvas primitives (no atlas), drawn directly by the
 * ParticleSystem each frame using the renderer's world-space transform.
 * The system is completely decoupled from the ECS — game code calls
 * `emit()` whenever an event fires (sell, plant, harvest, …) and
 * `update(dt)` + `draw(ctx)` each render frame.
 *
 * Coordinate space: world pixels, same as sprite x/y.
 */

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type ParticleShape = "circle" | "rect" | "star";

export interface ParticleEmitOptions {
  /** World-pixel origin. */
  x: number;
  y: number;
  /** Number of particles to spawn. */
  count: number;
  /** Particle shape. */
  shape: ParticleShape;
  /** CSS colour string — use an EDG32 swatch (e.g. EDG.gold). */
  color: string;
  /** Optional second colour — random lerp between color and color2. */
  color2?: string;
  /** Initial speed range [min, max] in world-px / second. */
  speedMin: number;
  speedMax: number;
  /** Emission angle range in radians [minAngle, maxAngle].
   *  0 = right, -PI/2 = up. Default: full circle. */
  angleMin?: number;
  angleMax?: number;
  /** Particle lifetime in seconds [min, max]. */
  lifetimeMin: number;
  lifetimeMax: number;
  /** Radius (circle) or half-size (rect/star) in world pixels. */
  sizeMin: number;
  sizeMax: number;
  /** Gravity acceleration in world-px / s² (positive = downward). */
  gravity?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;    // remaining seconds
  maxLife: number;
  size: number;
  shape: ParticleShape;
  r: number; g: number; b: number; // colour components
  gravity: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  const n = parseInt(c.length === 3
    ? c.split("").map(ch => ch + ch).join("")
    : c, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class ParticleSystem {
  private particles: Particle[] = [];

  /** Emit a burst of particles at a world-pixel position. */
  emit(opts: ParticleEmitOptions): void {
    const angleMin = opts.angleMin ?? 0;
    const angleMax = opts.angleMax ?? Math.PI * 2;
    const gravity  = opts.gravity ?? 0;
    const [r1, g1, b1] = hexToRgb(opts.color);
    const [r2, g2, b2] = opts.color2 ? hexToRgb(opts.color2) : [r1, g1, b1];

    for (let i = 0; i < opts.count; i++) {
      const t    = Math.random();
      const angle = rand(angleMin, angleMax);
      const speed = rand(opts.speedMin, opts.speedMax);
      const life  = rand(opts.lifetimeMin, opts.lifetimeMax);
      this.particles.push({
        x: opts.x,
        y: opts.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: rand(opts.sizeMin, opts.sizeMax),
        shape: opts.shape,
        r: lerp(r1, r2, t),
        g: lerp(g1, g2, t),
        b: lerp(b1, b2, t),
        gravity,
      });
    }
  }

  /** Advance all particles by `dt` seconds. */
  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (!p) continue;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
      p.vy += p.gravity * dt;
    }
  }

  /** Draw all live particles into ctx (which should already have the world transform set). */
  draw(ctx: Ctx2D): void {
    if (this.particles.length === 0) return;
    ctx.save();
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${p.r|0},${p.g|0},${p.b|0})`;
      if (p.shape === "circle") {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === "rect") {
        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      } else {
        // 4-point star
        drawStar(ctx, p.x, p.y, p.size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  get count(): number {
    return this.particles.length;
  }
}

function drawStar(ctx: Ctx2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(angle) * rr;
    const py = y + Math.sin(angle) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}
