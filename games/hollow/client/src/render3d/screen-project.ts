/**
 * `projectToScreen` — pure world -> screen-pixel projection (chunk
 * hollow-09c), the seam the glyph/tag overlay (`overlay.ts`) uses every
 * frame to place a 2D annotation above an agent's `headWorld` (see
 * `app.ts`'s `AgentRenderState`/`getViewProj()` seam). Deliberately
 * self-contained (does the clip-space multiply itself rather than calling
 * the engine's `transformPoint`) because it needs the pre-divide `w` to
 * detect "behind the camera" — `transformPoint` (mat4.ts) always performs
 * the perspective divide internally and has no way to signal that back.
 *
 * WebGPU/D3D NDC convention (matches `@engine/core/render3d/mat4.ts`):
 * x,y ∈ [-1,1] with +y up, so the y-axis flips going to screen space
 * (origin top-left, +y down, matching DOM pointer events).
 */
import type { Mat4, Vec3 } from "@engine/core/render3d";

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
  /** `false` if `world` is behind the camera (clip-space `w <= 0`) or its
   *  NDC position falls outside `[-1, 1]` on either axis — the overlay
   *  should skip drawing anything for a non-visible point rather than
   *  plotting a garbage/mirrored screen position. */
  readonly visible: boolean;
}

/** Smallest positive clip-space `w` treated as "in front of the camera" —
 *  guards the divide below against both `w <= 0` (behind camera) and a
 *  near-zero `w` that would blow the projected point up toward infinity. */
const MIN_W = 1e-6;

/**
 * Project a world-space point through `viewProj` to a screen-pixel position
 * within a `width x height` viewport (origin top-left). Pure; no DOM, no
 * canvas — `width`/`height` are just numbers the caller already resolved
 * from its own viewport (CSS pixels for the overlay canvas, in practice).
 */
export function projectToScreen(world: Vec3, viewProj: Mat4, width: number, height: number): ScreenPoint {
  const x = world[0];
  const y = world[1];
  const z = world[2];
  const cx = (viewProj[0] as number) * x + (viewProj[4] as number) * y + (viewProj[8] as number) * z + (viewProj[12] as number);
  const cy = (viewProj[1] as number) * x + (viewProj[5] as number) * y + (viewProj[9] as number) * z + (viewProj[13] as number);
  const cw = (viewProj[3] as number) * x + (viewProj[7] as number) * y + (viewProj[11] as number) * z + (viewProj[15] as number);

  if (cw < MIN_W) return { x: 0, y: 0, visible: false };

  const ndcX = cx / cw;
  const ndcY = cy / cw;
  const sx = (ndcX * 0.5 + 0.5) * width;
  const sy = (1 - (ndcY * 0.5 + 0.5)) * height;
  const visible = ndcX >= -1 && ndcX <= 1 && ndcY >= -1 && ndcY <= 1;
  return { x: sx, y: sy, visible };
}
