/**
 * Decorative fish schools — render-only reef life (wall-clock + Math.random, like
 * water-decor / the particle system; no sim or determinism impact). Shoals of one
 * reef-fish type drift around the coral reefs: each school is bound to a reef and
 * slowly orbits it (weaving through/around the coral), each fish undulating with a
 * two-frame tail-wiggle. Rendered with a cool blue tint + reduced alpha + a depth
 * pulse so the fish read as *below* the water surface. Hidden over land/off-screen.
 */

import type { RendererLike } from "@engine/core";
import { CORAL, LAYER } from "@farm/sim-core/render-systems";
import { isWalkable, WORLD_WIDTH, WORLD_HEIGHT } from "@farm/sim-core/world/regions";

const TILE = 16;

interface View { left: number; right: number; top: number; bottom: number; }

const rand = (min: number, max: number): number => min + Math.random() * (max - min);
const pick = <T>(arr: readonly T[]): T | null => (arr.length ? arr[(Math.random() * arr.length) | 0]! : null);

// Underwater rendering: a cool blue RGB multiply tint (submerged cast) + base alpha.
const UNDERWATER_TINT = 0xb4ccea_ff; // 0xRRGGBBAA — cool, slightly darkened
const BASE_ALPHA = 0.72;

// Reef-fish kinds: each is a pair of swim frames (tail-wiggle) under decoration/.
const FISH_KINDS = [
  { a: "decoration/fish-clown-a", b: "decoration/fish-clown-b" },
  { a: "decoration/fish-blue-a", b: "decoration/fish-blue-b" },
  { a: "decoration/fish-yellow-a", b: "decoration/fish-yellow-b" },
  { a: "decoration/fish-green-a", b: "decoration/fish-green-b" },
] as const;

// Loose wedge formation (local px; y = vertical spread within the shoal).
const FORMATION = [
  { x: 0, y: 0 },
  { x: -9, y: -6 }, { x: -9, y: 6 },
  { x: -18, y: -2 }, { x: -18, y: 3 },
  { x: -18, y: -11 }, { x: -27, y: -7 }, { x: -27, y: 8 },
] as const;

// Coral reefs (connected coral clusters) — center + half-extent, collected once.
interface Reef { x: number; y: number; rx: number; ry: number; }
let reefs: Reef[] | null = null;
function getReefs(): Reef[] {
  if (reefs === null) {
    reefs = [];
    const key = (tx: number, ty: number) => ty * WORLD_WIDTH + tx;
    const coralSet = new Set<number>();
    for (const c of CORAL) coralSet.add(key(c.tx, c.ty));
    const seen = new Set<number>();
    for (const c of CORAL) {
      const start = key(c.tx, c.ty);
      if (seen.has(start)) continue;
      const stack = [start];
      seen.add(start);
      let sumX = 0, sumY = 0, n = 0;
      let minTx = Infinity, maxTx = -Infinity, minTy = Infinity, maxTy = -Infinity;
      while (stack.length) {
        const k = stack.pop()!;
        const tx = k % WORLD_WIDTH;
        const ty = (k - tx) / WORLD_WIDTH;
        sumX += tx; sumY += ty; n++;
        if (tx < minTx) minTx = tx;
        if (tx > maxTx) maxTx = tx;
        if (ty < minTy) minTy = ty;
        if (ty > maxTy) maxTy = ty;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nk = key(tx + dx, ty + dy);
          if (coralSet.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
        }
      }
      if (n < 4) continue; // skip tiny specks — not worth a school
      reefs.push({
        x: (sumX / n + 0.5) * TILE,
        y: (sumY / n + 0.5) * TILE,
        rx: Math.min(((maxTx - minTx) / 2 + 2) * TILE, TILE * 9),
        ry: Math.min(((maxTy - minTy) / 2 + 2) * TILE, TILE * 7),
      });
    }
  }
  return reefs;
}

interface School {
  kind: number;       // index into FISH_KINDS
  reef: Reef;
  theta: number;      // orbit angle around the reef
  thetaSpeed: number; // rad/sec (sign = orbit direction)
  age: number;        // seconds alive
  life: number;       // seconds before departing
  phase: number;      // per-school wiggle phase offset
  prevX: number;      // last lead-x, for facing
}

const MAX_SCHOOLS = 3;
const schools: School[] = [];
let spawnCd = 1;
const FADE = 2.5; // seconds to fade in / out

function spawnSchool(): School | null {
  const reef = pick(getReefs());
  if (reef === null) return null;
  const theta = rand(0, Math.PI * 2);
  return {
    kind: (Math.random() * FISH_KINDS.length) | 0,
    reef,
    theta,
    thetaSpeed: (Math.random() < 0.5 ? 1 : -1) * rand(0.12, 0.3),
    age: 0,
    life: rand(22, 40),
    phase: rand(0, Math.PI * 2),
    prevX: reef.x + Math.cos(theta) * reef.rx,
  };
}

export function pushFishSchools(
  renderer: Pick<RendererLike, "push">,
  nowMs: number,
  dt: number,
  view: View,
): void {
  if (schools.length < MAX_SCHOOLS) {
    spawnCd -= dt;
    if (spawnCd <= 0) {
      spawnCd = rand(3, 9);
      const s = spawnSchool();
      if (s) schools.push(s);
    }
  }

  for (let si = schools.length - 1; si >= 0; si--) {
    const s = schools[si]!;
    s.age += dt;
    if (s.age >= s.life) { schools.splice(si, 1); continue; }
    s.theta += s.thetaSpeed * dt;

    // School center orbits the reef (a slow breathing ellipse → weaves the coral).
    const breathe = 1 + 0.12 * Math.sin(nowMs * 0.0006 + s.phase);
    const cx = s.reef.x + Math.cos(s.theta) * s.reef.rx * breathe;
    const cy = s.reef.y + Math.sin(s.theta) * s.reef.ry * breathe;
    const facingLeft = cx < s.prevX;
    s.prevX = cx;

    // Fade in on spawn, out before departing.
    const fade = Math.min(1, s.age / FADE, (s.life - s.age) / FADE);
    const kind = FISH_KINDS[s.kind]!;

    for (let i = 0; i < FORMATION.length; i++) {
      const f = FORMATION[i]!;
      const fx = cx + (facingLeft ? -f.x : f.x); // trail behind travel
      const fy = cy + f.y + Math.sin(nowMs * 0.004 + s.phase + i * 0.9) * 2.5;

      const tx = Math.floor(fx / TILE);
      const ty = Math.floor(fy / TILE);
      if (tx < 0 || ty < 0 || tx >= WORLD_WIDTH || ty >= WORLD_HEIGHT || isWalkable(tx, ty)) continue; // over land
      if (fx < view.left - TILE || fx > view.right + TILE || fy < view.top - TILE || fy > view.bottom + TILE) continue;

      const depthPulse = 0.88 + 0.12 * Math.sin(nowMs * 0.0012 + i);
      // Tail-wiggle: alternate a/b, staggered per fish so the shoal doesn't beat in unison.
      const frame = (Math.floor(nowMs / 180 + i * 0.5) & 1) === 0 ? kind.a : kind.b;
      renderer.push({
        x: fx, y: fy, width: TILE, height: TILE,
        frame, atlasId: "props",
        rotation: 0, layer: LAYER.REEF_FISH, alpha: BASE_ALPHA * fade * depthPulse,
        flipX: facingLeft, // sprites face right; flip when swimming left
        tintRgba: UNDERWATER_TINT,
      });
    }
  }
}
