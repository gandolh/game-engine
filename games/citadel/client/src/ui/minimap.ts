/**
 * Citadel minimap — a top-right overview of the whole tile world, drawn
 * IN-CANVAS through the engine UI surface (NOT a separate Canvas2D overlay).
 *
 * The minimap paints many raw `surface.rect(...)` quads (it is a custom canvas-like surface, not a
 * widget composition). It folds into the widget tree via the {@link custom} escape-hatch node
 * ({@link CitadelMinimap.node}): the host lays that node out at its top-right origin and
 * `renderTree` invokes the same raw-quad {@link CitadelMinimap.draw} using the node's rect as the
 * origin — so the minimap flows through `computeLayout` → `renderTree` like every other panel.
 * Clicks stay separate (a custom node is non-interactive): the host routes presses to
 * {@link CitadelMinimap.trySeek} with the same origin it laid the node out at.
 *
 * Everything is projected in the SAME 2:1 dimetric **iso world-px** space the
 * game renders in (NOT axis-aligned tile space), via the world's `tileToIso`,
 * then fit into the square minimap face. The payoff: the camera viewport, whose
 * four screen corners invert to iso world-px, lands as an upright rectangle
 * (matching the player's screen). Because `screenToWorld` and the face fit are
 * both affine (independent x/y scale + translate, no rotation), that viewport is
 * axis-aligned in face px and so strokes as four thin `surface.rect` edges.
 *
 * `UISurface` only takes axis-aligned rects/quads — it cannot fill diamonds or
 * stroke a rotated polygon, and it cannot blit a baked canvas. So:
 *   - Terrain (static) is PRECOMPUTED ONCE in the constructor as a flat array of
 *     face-local `{x,y,w,h,color}` quads (approach (b)): each tile becomes a
 *     small axis-aligned rect at its iso centre, sized to roughly cover the
 *     diamond. Per-frame cost is then just emitting the cached rects offset by
 *     the host origin — no per-tile re-projection. (Tradeoff: tiles read as tiny
 *     squares, not diamonds; at ~168px face this is barely perceptible and gaps
 *     are masked by the dark backing panel.)
 *   - Entities + viewport are dynamic, computed per frame.
 *
 * Render-only: reads snapshots + the camera transform, never the sim clock/RNG.
 * Colours come from the EDG palette (the palette guard scans this .ts file).
 */
import { CITADEL_PAL as EDG } from "../render/citadel-palette";
import { custom } from "@engine/ui";
import type { CustomNode } from "@engine/ui";
import type { UISurface } from "@engine/ui/render";
import type { TerrainGrid, BuildingSnapshot, VillagerSnapshot, RaiderSnapshot } from "@citadel/sim-core";
import { TerrainType } from "@citadel/sim-core";
import { screenToWorld, type CameraTransform } from "../render/transform";
import {
  ISO_HW,
  ISO_TILE_W,
  ISO_TILE_H,
} from "../render/iso";
import type { IsoProjection } from "../render/iso";

/** Default CSS-px size of the square minimap face (matches the old `width=168`). */
export const MINIMAP_FACE = 168;

/** Terrain type → minimap fill (EDG). Matches the in-world terrain reading. */
function terrainColor(t: number): string {
  switch (t) {
    case TerrainType.Water: return EDG.blue;
    case TerrainType.Forest: return EDG.greenDark;
    case TerrainType.Stone: return EDG.steel;
    case TerrainType.Rough: return EDG.woodDark;
    default: return EDG.greenMid; // Grass
  }
}

/** A precomputed face-local terrain quad (offset by the host origin at draw). */
interface FaceQuad {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly color: string;
}

/** What the minimap needs from the live frame to stamp entities + viewport. */
export interface MinimapFrame {
  readonly buildings: readonly BuildingSnapshot[];
  readonly villagers: readonly VillagerSnapshot[];
  readonly raiders: readonly RaiderSnapshot[];
  readonly transform: CameraTransform;
}

export class CitadelMinimap {
  /** CSS px size of the square minimap face. */
  private readonly faceSize: number;
  private readonly onSeek: (tx: number, ty: number) => void;
  /** The projection of the world this minimap shows (brief 110). */
  private readonly iso: IsoProjection;

  // --- Iso-world-px → minimap-face-px fit (uniform scale + centring). --------
  // The iso world is wider than tall (2:1), so we scale to fit the wider span
  // and letterbox the shorter axis, keeping the face square.
  private readonly fitScale: number;
  private readonly fitOffX: number;
  private readonly fitOffY: number;

  /** Precomputed terrain quads in FACE-LOCAL px (offset by origin each frame). */
  private readonly terrainQuads: readonly FaceQuad[];

  /** The minimap folded into the `@engine/ui` widget tree as a {@link custom} escape-hatch node
   *  (engine-ui backlog item 1): a `faceSize`-square leaf whose draw emits the same raw quads as
   *  {@link draw}, using its laid-out `rect` as the origin — so the minimap flows through the host's
   *  `computeLayout` → `renderTree` path like every other panel instead of a bespoke `draw(...)`
   *  post-pass. Interactivity stays separate: the host still routes clicks to {@link trySeek} (a
   *  custom node is non-interactive), passing the SAME top-right origin it lays this node out at. */
  private readonly customNode: CustomNode;
  /** The live frame bound by {@link setFrame}, painted by the custom node on the next `renderTree`. */
  private frame: MinimapFrame | null = null;

  /**
   * @param terrain   the static terrain grid — baked once into face-local quads.
   * @param onSeek    invoked with continuous tile coords when the user clicks the
   *                  minimap face, so the host can recentre the camera there.
   * @param faceSize  CSS-px side of the square face (default {@link MINIMAP_FACE}).
   */
  constructor(
    iso: IsoProjection,
    terrain: TerrainGrid,
    onSeek: (tx: number, ty: number) => void,
    faceSize: number = MINIMAP_FACE,
  ) {
    this.faceSize = faceSize;
    this.onSeek = onSeek;
    this.iso = iso;

    // Fit the whole iso diamond into the square face (uniform scale + centring).
    this.fitScale = faceSize / Math.max(iso.worldPxW, iso.worldPxH);
    this.fitOffX = (faceSize - iso.worldPxW * this.fitScale) / 2;
    this.fitOffY = (faceSize - iso.worldPxH * this.fitScale) / 2;

    // Precompute terrain once (approach (b)): each tile → one small axis-aligned
    // rect centred on its iso position. Size = the diamond's fitted footprint so
    // adjacent tiles tile together with no visible gaps. UISurface can't fill
    // diamonds, so we approximate; at ~168px the squares read as solid terrain.
    const gw = terrain.width;
    const gh = terrain.height;
    const tileW = ISO_TILE_W * this.fitScale; // fitted full diamond width
    const tileH = ISO_TILE_H * this.fitScale; // fitted full diamond height
    const quads: FaceQuad[] = [];
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const c = iso.tileToIso(x + 0.5, y + 0.5); // diamond centre in iso world-px
        quads.push({
          x: this.fx(c.x) - tileW / 2,
          y: this.fy(c.y) - tileH / 2,
          w: tileW,
          h: tileH,
          color: terrainColor(terrain.cells[y * gw + x] ?? 0),
        });
      }
    }
    this.terrainQuads = quads;

    // Fold into the widget tree: a face-sized custom node that draws the live frame at its
    // laid-out rect origin. Created last so `faceSize`/terrain are ready when it first draws.
    this.customNode = custom(
      (surface, rect) => {
        if (this.frame !== null) this.draw(surface, rect.x, rect.y, this.frame);
      },
      { width: faceSize, height: faceSize },
    );
  }

  /** The widget-tree node for this minimap. `setFrame(...)` each frame, then
   *  `computeLayout(node, originX, originY)` + `renderTree(surface, node)`. */
  node(): CustomNode {
    return this.customNode;
  }

  /** Bind this frame's snapshot + camera transform for the next `renderTree` draw. */
  setFrame(frame: MinimapFrame): void {
    this.frame = frame;
  }

  /** Iso world-px → minimap-face-local px (uniform fit + centring). */
  private fx(isoX: number): number {
    return this.fitOffX + isoX * this.fitScale;
  }
  private fy(isoY: number): number {
    return this.fitOffY + isoY * this.fitScale;
  }

  /**
   * Emit the whole minimap for the current frame as raw quads on `surface`,
   * anchored at screen-px `(originX, originY)` (the host's chosen top-right spot).
   * Call inside the host's `surface.begin()/end()` block. All coords below are
   * face-local then offset by the origin, so the face occupies
   * `[originX, originX+faceSize] × [originY, originY+faceSize]` on screen.
   */
  draw(surface: UISurface, originX: number, originY: number, frame: MinimapFrame): void {
    const ox = originX;
    const oy = originY;
    const s = this.faceSize;

    // Faint dark backing panel so specks + terrain gaps read clearly.
    surface.rect(ox, oy, s, s, EDG.black, 0.7);

    // Terrain — cached face-local quads, just offset by the origin.
    for (const q of this.terrainQuads) {
      surface.rect(ox + q.x, oy + q.y, q.w, q.h, q.color);
    }

    // Buildings — small blocks centred on the footprint's iso position, sized by
    // footprint; fire-tinted when burning, keep highlighted.
    for (const b of frame.buildings) {
      const color = (b.onFire || b.burning) ? EDG.red : b.type === "keep" ? EDG.yellow : EDG.cream;
      const c = this.iso.tileToIso(b.x + b.w / 2, b.y + b.h / 2);
      const side = Math.max(2, (b.w + b.h) * ISO_HW * this.fitScale * 0.5);
      surface.rect(ox + this.fx(c.x) - side / 2, oy + this.fy(c.y) - side / 2, side, side, color);
    }

    // Villagers — faint cyan specks.
    for (const v of frame.villagers) {
      const c = this.iso.tileToIso(v.x + 0.5, v.y + 0.5);
      surface.rect(ox + this.fx(c.x) - 0.75, oy + this.fy(c.y) - 0.75, 1.5, 1.5, EDG.cyan);
    }

    // Raiders — hot-pink threat specks (slightly larger to stand out).
    for (const r of frame.raiders) {
      const c = this.iso.tileToIso(r.x + 0.5, r.y + 0.5);
      surface.rect(ox + this.fx(c.x) - 1.5, oy + this.fy(c.y) - 1.5, 3, 3, EDG.hotPink);
    }

    // Camera viewport — invert the four screen corners to iso world-px. Because
    // both `screenToWorld` and the face fit are affine (no rotation), the screen
    // rect maps to an AXIS-ALIGNED rectangle in face px; stroke it as four thin
    // edges (UISurface has no polygon stroke).
    const t = frame.transform;
    const c0 = screenToWorld(t, 0, 0);
    const c1 = screenToWorld(t, t.canvasW, t.canvasH);
    // Map both corners to face px and normalise to top-left + size.
    const x0 = this.fx(c0.worldX);
    const y0 = this.fy(c0.worldY);
    const x1 = this.fx(c1.worldX);
    const y1 = this.fy(c1.worldY);
    const left = Math.min(x0, x1);
    const top = Math.min(y0, y1);
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    const lw = 1.5; // stroke width in px
    const col = EDG.yellow;
    surface.rect(ox + left, oy + top, w, lw, col);              // top edge
    surface.rect(ox + left, oy + top + h - lw, w, lw, col);     // bottom edge
    surface.rect(ox + left, oy + top, lw, h, col);              // left edge
    surface.rect(ox + left + w - lw, oy + top, lw, h, col);     // right edge
  }

  /**
   * Handle a pointer press at screen-px `(screenX, screenY)` while the face is
   * anchored at `(originX, originY)`. If the press lands inside the face, convert
   * face px → iso world-px → continuous tile, invoke `onSeek`, and return `true`
   * (consumed). Otherwise returns `false` so the host can route the press onward.
   *
   * The host owns the DOM listener and the device-px conversion; it passes the
   * same coordinate space it used for `draw` (CSS px relative to the minimap face
   * anchor — i.e. the same origin it drew at).
   */
  trySeek(screenX: number, screenY: number, originX: number, originY: number): boolean {
    const faceX = screenX - originX;
    const faceY = screenY - originY;
    if (faceX < 0 || faceY < 0 || faceX > this.faceSize || faceY > this.faceSize) {
      return false;
    }
    const isoX = (faceX - this.fitOffX) / this.fitScale;
    const isoY = (faceY - this.fitOffY) / this.fitScale;
    const { tileX, tileY } = this.iso.isoToTileContinuous(isoX, isoY);
    this.onSeek(tileX, tileY);
    return true;
  }
}
