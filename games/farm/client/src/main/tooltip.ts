import { Camera2D } from "@engine/core";
import { TILE } from "./config";
import { mousePos } from "./camera";
import { screenToWorld } from "./screen-to-tile";
import type { SnapshotSprite } from "@farm/sim-core/snapshot";

/** The label + optional description of the sprite currently under the cursor. */
export interface HoveredSprite {
  label: string;
  description: string | null;
}

/**
 * Find the labelled sprite nearest the cursor (within half a tile), or `null` if none.
 *
 * This is the same world-space distance search the old DOM `updateTooltip` ran; it now returns the
 * hovered sprite's label/description so the in-canvas tooltip panel can render it (the DOM element
 * is gone — the tooltip is a `@engine/ui` panel driven by the render loop).
 */
export function hoveredSprite(
  canvas: HTMLCanvasElement,
  sprites: SnapshotSprite[],
  camera: Camera2D | null,
): HoveredSprite | null {
  if (camera === null || mousePos.x < 0) return null;

  const { wx, wy } = screenToWorld(camera, canvas, mousePos.x, mousePos.y);

  const HALF_TILE = TILE / 2;
  let bestLabel: string | null = null;
  let bestDescription: string | null = null;
  let bestDist = HALF_TILE * HALF_TILE;

  for (const s of sprites) {
    if (!s.label) continue;
    const dx = s.x - wx;
    const dy = s.y - wy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist) {
      bestDist = d2;
      bestLabel = s.label;
      bestDescription = s.description ?? null;
    }
  }

  if (bestLabel === null) return null;
  return { label: bestLabel, description: bestDescription };
}
