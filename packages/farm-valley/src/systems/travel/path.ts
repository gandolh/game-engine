/**
 * Path helpers and constants for TravelSystem.
 * Split from travel.ts.
 */

/** Ticks spent on each waypoint before stepping. 8 ticks @ 20Hz = 2.5 tiles/sec.
 *  Slower than before — walking is visually clear and takes meaningful time. */
export const STEP_TICKS = 8;

/**
 * String-pull a 4-connected grid path into a smoother route that cuts corners
 * diagonally, then re-rasterize it back into a DENSE one-tile-per-step sequence.
 *
 * Why both passes:
 *  - String-pulling alone leaves long straight segments (e.g. start → corner),
 *    but the stepper advances ONE waypoint per STEP_TICKS — so a long segment
 *    would teleport in a single step.
 *  - Re-rasterizing each kept segment with a grid walk (Bresenham, 8-connected)
 *    restores one-tile-apart spacing while now including diagonal steps. Pacing
 *    (STEP_TICKS per tile) and determinism are unchanged — this is a pure,
 *    allocation-bounded transform of integer tile coords with no randomness.
 *
 * `isWalkable(x, y)` must match the pathfinder's grid so we never smooth a
 * diagonal that clips a blocked tile.
 */
export function smoothPath(
  path: ReadonlyArray<{ x: number; y: number }>,
  isWalkable: (x: number, y: number) => boolean,
): { x: number; y: number }[] {
  if (path.length <= 2) return path.map(p => ({ x: p.x, y: p.y }));

  // Diagonal line-of-sight: can we walk a straight grid line a→b without
  // crossing a blocked tile? Supercover-style: at each step also require the
  // two orthogonal cells of a diagonal move to be open, so we never squeeze
  // through a corner gap that a tile-mover couldn't actually pass.
  const lineOfSight = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    let x = a.x;
    let y = a.y;
    const dxAbs = Math.abs(b.x - a.x);
    const dyAbs = Math.abs(b.y - a.y);
    const sx = a.x < b.x ? 1 : -1;
    const sy = a.y < b.y ? 1 : -1;
    let err = dxAbs - dyAbs;
    // step guard: at most width+height steps for any in-grid line.
    for (let guard = dxAbs + dyAbs + 1; guard > 0; guard -= 1) {
      if (x === b.x && y === b.y) return true;
      const e2 = 2 * err;
      let movedX = false;
      let movedY = false;
      if (e2 > -dyAbs) { err -= dyAbs; x += sx; movedX = true; }
      if (e2 < dxAbs) { err += dxAbs; y += sy; movedY = true; }
      if (!isWalkable(x, y)) return false;
      // Diagonal step: forbid corner-clipping past two blocked orthogonals.
      if (movedX && movedY && !isWalkable(x - sx, y) && !isWalkable(x, y - sy)) {
        return false;
      }
    }
    return true;
  };

  // Pass 1: greedy string-pull — keep an anchor, extend to the farthest later
  // node still in line of sight, repeat. Yields corner anchors only.
  const anchors: { x: number; y: number }[] = [{ x: path[0]!.x, y: path[0]!.y }];
  let anchor = 0;
  while (anchor < path.length - 1) {
    let farthest = anchor + 1;
    for (let j = anchor + 2; j < path.length; j += 1) {
      if (lineOfSight(path[anchor]!, path[j]!)) farthest = j;
      else break;
    }
    anchors.push({ x: path[farthest]!.x, y: path[farthest]!.y });
    anchor = farthest;
  }

  // Pass 2: re-rasterize each anchor→anchor segment into one-tile steps
  // (8-connected). Skip each segment's start tile to avoid duplicates.
  const dense: { x: number; y: number }[] = [{ x: anchors[0]!.x, y: anchors[0]!.y }];
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const a = anchors[i]!;
    const b = anchors[i + 1]!;
    let x = a.x;
    let y = a.y;
    const dxAbs = Math.abs(b.x - a.x);
    const dyAbs = Math.abs(b.y - a.y);
    const sx = a.x < b.x ? 1 : -1;
    const sy = a.y < b.y ? 1 : -1;
    let err = dxAbs - dyAbs;
    for (let guard = dxAbs + dyAbs + 1; guard > 0; guard -= 1) {
      if (x === b.x && y === b.y) break;
      const e2 = 2 * err;
      if (e2 > -dyAbs) { err -= dyAbs; x += sx; }
      if (e2 < dxAbs) { err += dxAbs; y += sy; }
      dense.push({ x, y });
    }
  }
  return dense;
}
