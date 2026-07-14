/**
 * Mesh projector + z-buffered rasterizer.
 *
 * `renderMeshModel(model)` dimetrically projects every vertex with Citadel's 2:1
 * convention (the SAME factors as `iso.ts`, scaled by `ISO_ART_SCALE`), then for
 * each triangle: computes the face normal, BACK-FACE CULLS (skips tris facing
 * away from the fixed camera), FLAT-SHADES by quantizing the normal onto the
 * material's Apollo ramp, and rasterizes with a PER-PIXEL Z-BUFFER (barycentric
 * fill, nearest depth wins) — correct for curved / interpenetrating geometry, no
 * fragile painter's sort. Finally a 1px darker silhouette + crease outline pass.
 *
 * The frame is sized to `isoArtDims(footprint, heightTiles)` and anchored exactly
 * like the old char-recipe sprites, so buildings map 1:1 onto the same world-px
 * quad (no float / no sink). Pure + deterministic.
 */
import { ISO_HW, ISO_HH, ISO_HEIGHT_STEP, ISO_ART_SCALE, isoArtDims } from "../../iso";
import type { RasterizedRecipe } from "../rasterize";
import { MATERIALS, type Rgba, type FaceTones } from "./materials";
import { cross, dot, normalize, sub } from "./geometry";
import type { MeshModel, Vec3 } from "./types";

interface P2 { readonly x: number; readonly y: number }

// Fixed dimetric viewer direction (toward the camera). In this oblique view the
// three principal faces (+z, +x, +y) are visible; a face is visible iff its
// outward normal has a positive component sum.
const VIEWER: Vec3 = normalize([1, 1, 1]);
// Sun direction for flat shading: above, biased toward the +y (left) side so the
// top face is brightest, the +y face mid, and the +x face darkest.
const SUN: Vec3 = normalize([0.3, 0.5, 0.9]);

/** Quantize a (viewer-facing) normal onto the material's three brightness steps. */
function toneForNormal(n: Vec3, tones: FaceTones): Rgba {
  const b = dot(n, SUN);
  if (b >= 0.72) return tones.top;
  if (b >= 0.42) return tones.left;
  return tones.right;
}

function makeProjector(model: MeshModel): { W: number; H: number; project: (p: Vec3) => P2 } {
  const S = ISO_ART_SCALE;
  const dims = isoArtDims(model.footprintW, model.footprintD, model.heightTiles);
  const W = dims.width;
  const H = dims.height;
  const offX = model.footprintD * ISO_HW * S;
  const offY = H - (model.footprintW + model.footprintD) * ISO_HH * S;
  const project = (p: Vec3): P2 => ({
    x: (p[0] - p[1]) * ISO_HW * S + offX,
    y: (p[0] + p[1]) * ISO_HH * S - p[2] * ISO_HEIGHT_STEP * S + offY,
  });
  return { W, H, project };
}

/** View depth: larger = nearer the camera (monotonic along the view axis). */
function depthOf(p: Vec3): number { return p[0] + p[1] + p[2]; }

function edge(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  return (px - ax) * (by - ay) - (py - ay) * (bx - ax);
}

/** Project, cull, shade + z-buffer a mesh model into a `RasterizedRecipe`. */
export function renderMeshModel(model: MeshModel): RasterizedRecipe {
  const { W, H, project } = makeProjector(model);
  const rgba = new Uint8ClampedArray(W * H * 4);
  const zbuf = new Float32Array(W * H).fill(-Infinity);
  // Per-pixel outline colour (the material's dark step) for the edge pass.
  const outlineBuf = new Int32Array(W * H).fill(-1); // packed RGB, -1 = none
  const depthBuf = zbuf; // alias for readability in the outline pass

  const { positions, tris } = model.mesh;

  for (const t of tris) {
    const v0 = positions[t.a]!, v1 = positions[t.b]!, v2 = positions[t.c]!;
    const n = cross(sub(v1, v0), sub(v2, v0));
    // Back-face cull: skip triangles whose outward normal faces away from camera.
    if (dot(n, VIEWER) <= 0) continue;
    const tones = MATERIALS[t.material];
    // Emissive materials (a lamplit window, a hot ember) emit rather than
    // reflect: skip normal quantization and use one flat tone for every face.
    const fill = tones.emissive ? tones.top : toneForNormal(normalize(n), tones);
    const packedOutline = (tones.outline[0] << 16) | (tones.outline[1] << 8) | tones.outline[2];

    const s0 = project(v0), s1 = project(v1), s2 = project(v2);
    const d0 = depthOf(v0), d1 = depthOf(v1), d2 = depthOf(v2);

    const minX = Math.max(0, Math.floor(Math.min(s0.x, s1.x, s2.x)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(s0.x, s1.x, s2.x)));
    const minY = Math.max(0, Math.floor(Math.min(s0.y, s1.y, s2.y)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(s0.y, s1.y, s2.y)));

    const area = edge(s0.x, s0.y, s1.x, s1.y, s2.x, s2.y);
    if (area === 0) continue; // degenerate on screen
    const inv = 1 / area;

    for (let py = minY; py <= maxY; py++) {
      const yc = py + 0.5;
      for (let px = minX; px <= maxX; px++) {
        const xc = px + 0.5;
        // Barycentric weights (sub-triangle areas), sign-agnostic to winding.
        const w0 = edge(s1.x, s1.y, s2.x, s2.y, xc, yc);
        const w1 = edge(s2.x, s2.y, s0.x, s0.y, xc, yc);
        const w2 = edge(s0.x, s0.y, s1.x, s1.y, xc, yc);
        const b0 = w0 * inv, b1 = w1 * inv, b2 = w2 * inv;
        if (b0 < 0 || b1 < 0 || b2 < 0) continue; // outside
        const depth = b0 * d0 + b1 * d1 + b2 * d2;
        const idx = py * W + px;
        if (depth <= zbuf[idx]!) continue; // something nearer already here
        zbuf[idx] = depth;
        const o = idx * 4;
        rgba[o] = fill[0];
        rgba[o + 1] = fill[1];
        rgba[o + 2] = fill[2];
        rgba[o + 3] = 255;
        outlineBuf[idx] = packedOutline;
      }
    }
  }

  outlinePass(rgba, zbuf, depthBuf, outlineBuf, W, H);
  return { name: model.name, width: W, height: H, rgba };
}

/**
 * 1px darker outline: mark an opaque pixel as an edge if it borders transparency
 * (silhouette) or a large depth discontinuity (a crease where one solid occludes
 * another). Reads the pre-outline mask/depth and writes into `rgba` in place —
 * neighbours are sampled from the depth buffer, which the pass never mutates.
 */
function outlinePass(
  rgba: Uint8ClampedArray,
  zbuf: Float32Array,
  depth: Float32Array,
  outlineBuf: Int32Array,
  W: number,
  H: number,
): void {
  const CREASE = 0.9; // view-depth jump (tiles) that reads as an occlusion edge
  const isEdge = (x: number, y: number): boolean => {
    const idx = y * W + x;
    if (rgba[idx * 4 + 3] === 0) return false; // transparent: not an edge itself
    const d = depth[idx]!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) return true; // frame border
      const ni = ny * W + nx;
      if (rgba[ni * 4 + 3] === 0) return true; // borders transparency → silhouette
      if (d - zbuf[ni]! > CREASE) return true; // this pixel is well in front → crease
    }
    return false;
  };
  const edges: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isEdge(x, y)) edges.push(y * W + x);
  for (const idx of edges) {
    const packed = outlineBuf[idx]!;
    if (packed < 0) continue;
    const o = idx * 4;
    rgba[o] = (packed >> 16) & 0xff;
    rgba[o + 1] = (packed >> 8) & 0xff;
    rgba[o + 2] = packed & 0xff;
    rgba[o + 3] = 255;
  }
}
