/** 8 ticks @ 20Hz = 2.5 tiles/sec. */
export const STEP_TICKS = 8;

/** String-pull then re-rasterize a 4-connected path into diagonal-cutting dense 1-tile steps.
 *  isWalkable must match the pathfinder grid to avoid clipping blocked tiles. */
export function smoothPath(
  path: ReadonlyArray<{ x: number; y: number }>,
  isWalkable: (x: number, y: number) => boolean,
): { x: number; y: number }[] {
  if (path.length <= 2) return path.map(p => ({ x: p.x, y: p.y }));

  // Supercover line-of-sight: diagonal moves also require both orthogonal cells open (no corner-clipping).
  const lineOfSight = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    let x = a.x;
    let y = a.y;
    const dxAbs = Math.abs(b.x - a.x);
    const dyAbs = Math.abs(b.y - a.y);
    const sx = a.x < b.x ? 1 : -1;
    const sy = a.y < b.y ? 1 : -1;
    let err = dxAbs - dyAbs;
    for (let guard = dxAbs + dyAbs + 1; guard > 0; guard -= 1) {
      if (x === b.x && y === b.y) return true;
      const e2 = 2 * err;
      let movedX = false;
      let movedY = false;
      if (e2 > -dyAbs) { err -= dyAbs; x += sx; movedX = true; }
      if (e2 < dxAbs) { err += dxAbs; y += sy; movedY = true; }
      if (!isWalkable(x, y)) return false;
      if (movedX && movedY && !isWalkable(x - sx, y) && !isWalkable(x, y - sy)) {
        return false;
      }
    }
    return true;
  };

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
