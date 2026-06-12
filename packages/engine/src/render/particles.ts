/** Canvas-2D particle system. Decoupled from ECS — call emit() on events, update(dt)+draw(ctx) each frame.
 *  Coordinate space: world pixels (same as sprite x/y). Uses Math.random — display-only, not sim.
 *
 *  Brief 14 (task 8) — CPU path fixes:
 *    - Dead-particle removal uses swap-with-last + pop() instead of splice(i,1): O(1) vs O(n).
 *    - Total particle pool capped at MAX_PARTICLES: emit() drops new particles when the pool is full
 *      so a burst of splashes or waterfalls never blows up on weak hardware.
 */

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type ParticleShape = "circle" | "rect" | "star";

/**
 * Read-only snapshot of a single live particle, consumed by GPU renderers.
 * Colors are in the same 0..255 range as stored internally; alpha is derived
 * as max(0, life/maxLife) — identical to the computation in draw().
 */
export interface GpuParticleView {
  x: number;
  y: number;
  size: number;
  shape: ParticleShape;
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
  alpha: number; // 0..1, = max(0, life/maxLife)
}

export interface ParticleEmitOptions {
  x: number;          // world-pixel origin
  y: number;
  count: number;
  shape: ParticleShape;
  color: string;      // EDG32 swatch recommended
  color2?: string;    // random lerp between color and color2
  speedMin: number;   // world-px / second
  speedMax: number;
  angleMin?: number;  // radians; 0 = right, -PI/2 = up; default full circle
  angleMax?: number;
  lifetimeMin: number; // seconds
  lifetimeMax: number;
  sizeMin: number;    // radius (circle) or half-size (rect/star), world px
  sizeMax: number;
  gravity?: number;   // world-px / s², positive = downward
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
  r: number; g: number; b: number;
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

// Hard cap on live particles. Prevents splash/waterfall bursts from blowing up on
// weak hardware. The WebGPU path uploads this many instances per frame at most.
const MAX_PARTICLES = 512;

export class ParticleSystem {
  private particles: Particle[] = [];

  emit(opts: ParticleEmitOptions): void {
    const angleMin = opts.angleMin ?? 0;
    const angleMax = opts.angleMax ?? Math.PI * 2;
    const gravity  = opts.gravity ?? 0;
    const [r1, g1, b1] = hexToRgb(opts.color);
    const [r2, g2, b2] = opts.color2 ? hexToRgb(opts.color2) : [r1, g1, b1];

    for (let i = 0; i < opts.count; i++) {
      // Drop new particles silently when the pool is full — keeps worst-case cost bounded.
      if (this.particles.length >= MAX_PARTICLES) break;
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

  update(dt: number): void {
    // Iterate backwards so the swap-with-last + pop() removal doesn't skip elements:
    // when we swap index i with the last element and pop, the new element at i is one
    // we have NOT yet visited (it came from the end), so we must re-examine it.
    // Backwards iteration naturally handles this — after the swap the element now at i
    // is from the tail which we already processed (or is the same i if it's the last).
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (!p) continue;
      p.life -= dt;
      if (p.life <= 0) {
        // Swap with last element and pop — O(1) removal, order-insensitive.
        const last = this.particles.length - 1;
        if (i !== last) {
          this.particles[i] = this.particles[last]!;
        }
        this.particles.pop();
        continue;
      }
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
      p.vy += p.gravity * dt;
    }
  }

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
        drawStar(ctx, p.x, p.y, p.size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  get count(): number {
    return this.particles.length;
  }

  /**
   * Iterate over all live particles, exposing a read-only view for GPU renderers.
   * The visitor is called synchronously; the view object is reused across calls —
   * do not retain a reference beyond the callback.
   * Alpha is computed identically to draw(): max(0, life / maxLife).
   */
  forEachParticle(visit: (v: GpuParticleView) => void): void {
    const view: GpuParticleView = {
      x: 0, y: 0, size: 0,
      shape: "circle",
      r: 0, g: 0, b: 0,
      alpha: 0,
    };
    for (const p of this.particles) {
      view.x     = p.x;
      view.y     = p.y;
      view.size  = p.size;
      view.shape = p.shape;
      view.r     = p.r;
      view.g     = p.g;
      view.b     = p.b;
      view.alpha = Math.max(0, p.life / p.maxLife);
      visit(view);
    }
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
