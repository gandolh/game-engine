/**
 * Citadel minimap — a top-right overview of the whole tile world.
 *
 * Drawn with a plain 2D canvas overlay (independent of the WebGPU game canvas),
 * in the SAME 2:1 dimetric **iso world-px** space the game renders in (NOT
 * axis-aligned tile space). Every element — baked terrain, buildings, units,
 * raiders — is projected through the world's `tileToIso` and then fit into the
 * square minimap face, so the diamond world tilts to match the screen. The
 * payoff: the camera viewport, whose four screen corners invert to iso world-px,
 * lands as an upright **rectangle** (matching the player's actual screen) instead
 * of the confusing diamond it was in tile space.
 *
 * Render-only: reads snapshots + the camera transform, never the sim clock/RNG.
 * Colours come from the EDG palette (the palette guard scans this .ts file).
 */
import { EDG } from "@engine/core";
import type { TerrainGrid, BuildingSnapshot, VillagerSnapshot, RaiderSnapshot } from "@citadel/sim-core";
import { TerrainType } from "@citadel/sim-core";
import { screenToWorld, type CameraTransform } from "../render/transform";
import {
  tileToIso,
  tileDiamond,
  isoToTileContinuous,
  ISO_WORLD_W,
  ISO_WORLD_H,
  ISO_HW,
} from "../render/iso";

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

/** What the minimap needs from the live frame to stamp entities + viewport. */
export interface MinimapFrame {
  readonly buildings: readonly BuildingSnapshot[];
  readonly villagers: readonly VillagerSnapshot[];
  readonly raiders: readonly RaiderSnapshot[];
  readonly transform: CameraTransform;
}

export class CitadelMinimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** Offscreen terrain bake in fitted iso-face px; blitted 1:1 each frame. */
  private readonly terrainBake: HTMLCanvasElement;
  private readonly gw: number;
  private readonly gh: number;
  /** CSS px size of the square minimap face (backing store is dpr-scaled). */
  private readonly faceSize: number;

  // --- Iso-world-px → minimap-face-px fit (uniform scale + centring). --------
  // The iso world is wider than tall (2:1), so we scale to fit the wider span
  // and letterbox the shorter axis, keeping the face square.
  private readonly fitScale: number;
  private readonly fitOffX: number;
  private readonly fitOffY: number;

  /**
   * @param onSeek invoked with continuous tile coords when the user clicks the
   *               minimap, so the host can recentre the camera there.
   */
  constructor(canvas: HTMLCanvasElement, terrain: TerrainGrid, onSeek: (tx: number, ty: number) => void) {
    this.canvas = canvas;
    this.gw = terrain.width;
    this.gh = terrain.height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("[citadel] minimap: 2D context unavailable");
    this.ctx = ctx;

    // Backing store: dpr-scaled (clamped to 2, matching the game canvas) so the
    // minimap stays crisp on HiDPI without ballooning fill cost.
    const dpr = Math.min((typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1), 2);
    this.faceSize = canvas.clientWidth || 168;
    canvas.width = Math.round(this.faceSize * dpr);
    canvas.height = Math.round(this.faceSize * dpr);
    this.ctx.scale(dpr, dpr);
    this.ctx.imageSmoothingEnabled = false;

    // Fit the whole iso diamond into the square face.
    this.fitScale = this.faceSize / Math.max(ISO_WORLD_W, ISO_WORLD_H);
    this.fitOffX = (this.faceSize - ISO_WORLD_W * this.fitScale) / 2;
    this.fitOffY = (this.faceSize - ISO_WORLD_H * this.fitScale) / 2;

    // Bake terrain once as iso diamonds at face resolution (dpr-scaled). Each
    // tile's diamond is projected through `tileToIso` and the fit transform, so
    // the bake registers exactly with the per-frame entity/viewport projection.
    this.terrainBake = document.createElement("canvas");
    this.terrainBake.width = Math.round(this.faceSize * dpr);
    this.terrainBake.height = Math.round(this.faceSize * dpr);
    const tctx = this.terrainBake.getContext("2d");
    if (tctx === null) throw new Error("[citadel] minimap: terrain bake context unavailable");
    tctx.scale(dpr, dpr);
    for (let y = 0; y < this.gh; y++) {
      for (let x = 0; x < this.gw; x++) {
        tctx.fillStyle = terrainColor(terrain.cells[y * this.gw + x] ?? 0);
        const d = tileDiamond(x, y);
        tctx.beginPath();
        for (let i = 0; i < d.length; i++) {
          const fx = this.fitOffX + d[i]!.x * this.fitScale;
          const fy = this.fitOffY + d[i]!.y * this.fitScale;
          if (i === 0) tctx.moveTo(fx, fy);
          else tctx.lineTo(fx, fy);
        }
        tctx.closePath();
        tctx.fill();
      }
    }

    // Click → iso world-px → tile → seek (inverts the same fit transform).
    canvas.addEventListener("mousedown", (e) => {
      const rect = canvas.getBoundingClientRect();
      const faceX = ((e.clientX - rect.left) / rect.width) * this.faceSize;
      const faceY = ((e.clientY - rect.top) / rect.height) * this.faceSize;
      const isoX = (faceX - this.fitOffX) / this.fitScale;
      const isoY = (faceY - this.fitOffY) / this.fitScale;
      const { tileX, tileY } = isoToTileContinuous(isoX, isoY);
      onSeek(tileX, tileY);
    });
  }

  /** Iso world-px → minimap-face CSS px (uniform fit + centring). */
  private fx(isoX: number): number {
    return this.fitOffX + isoX * this.fitScale;
  }
  private fy(isoY: number): number {
    return this.fitOffY + isoY * this.fitScale;
  }

  /** Redraw the whole minimap for the current frame. */
  draw(frame: MinimapFrame): void {
    const { ctx } = this;
    const s = this.faceSize;
    ctx.clearRect(0, 0, s, s);
    ctx.drawImage(this.terrainBake, 0, 0, s, s);

    // Buildings — small blocks centred on the footprint's iso position, sized by
    // footprint; fire-tinted when burning, keep highlighted.
    for (const b of frame.buildings) {
      ctx.fillStyle = (b.onFire || b.burning) ? EDG.red : b.type === "keep" ? EDG.yellow : EDG.cream;
      const c = tileToIso(b.x + b.w / 2, b.y + b.h / 2);
      const side = Math.max(2, (b.w + b.h) * ISO_HW * this.fitScale * 0.5);
      ctx.fillRect(this.fx(c.x) - side / 2, this.fy(c.y) - side / 2, side, side);
    }

    // Villagers — faint cyan specks.
    ctx.fillStyle = EDG.cyan;
    for (const v of frame.villagers) {
      const c = tileToIso(v.x + 0.5, v.y + 0.5);
      ctx.fillRect(this.fx(c.x) - 0.75, this.fy(c.y) - 0.75, 1.5, 1.5);
    }

    // Raiders — hot-pink threat specks (slightly larger to stand out).
    ctx.fillStyle = EDG.hotPink;
    for (const r of frame.raiders) {
      const c = tileToIso(r.x + 0.5, r.y + 0.5);
      ctx.fillRect(this.fx(c.x) - 1.5, this.fy(c.y) - 1.5, 3, 3);
    }

    // Camera viewport — invert the four screen corners to iso world-px and stroke
    // the resulting quad. Because the minimap is now in iso space and the camera
    // is a linear pan/zoom of it, the screen rectangle maps to an upright
    // rectangle (matching the player's screen), not a diamond.
    const t = frame.transform;
    const corners: [number, number][] = [
      [0, 0],
      [t.canvasW, 0],
      [t.canvasW, t.canvasH],
      [0, t.canvasH],
    ];
    ctx.beginPath();
    corners.forEach(([sx, sy], i) => {
      const { worldX, worldY } = screenToWorld(t, sx, sy);
      const mx = this.fx(worldX);
      const my = this.fy(worldY);
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    });
    ctx.closePath();
    ctx.strokeStyle = EDG.yellow;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
