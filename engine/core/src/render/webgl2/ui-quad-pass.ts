// ui-quad-pass.ts — the screen-space UI draw-list, on the GPU (sweep-04).
//
// WHAT THIS REPLACES. Until sweep-04 every UI quad — every glyph, icon
// shade-mask, panel background and hotbar slot — was rasterized on the CPU, one
// Canvas2D `drawImage` per quad, onto the second stacked `Overlay2D` canvas
// (`drawUIQuad` in ../ui-draw.ts). Measured 2026-08-18 on Farm: `ui.flush`
// 3.49 ms mean / 5.10 p95 at `ui.quads` mean 7,272, inside a `frame` whose p95
// was 17.10 ms against a 16.6 ms budget. This module pushes the same
// `_uiQueue` through the SAME instanced `SpriteBatch` the world already uses,
// with a screen-space view — one `drawArraysInstanced` per run of same-texture
// quads instead of one `drawImage` per quad.
//
// NOT a second renderer, and NOT a second shader: it packs into the caller's
// existing `SpriteBatch` (so one buffer, one upload, one program) and draws its
// own group range with its own `ViewUniform`. See `pack` and `draw` below.
//
// PIXEL FIDELITY — the thing that decides whether this is allowed to ship. The
// UI is pixel art under a fixed palette, drawn on the CPU with
// `imageSmoothingEnabled = false`. Four properties are what make the GPU path
// produce the same pixels, and each is load-bearing:
//
//   1. NEAREST sampling. The atlas textures are created by ./gl-atlas-store.ts
//      with `TEXTURE_MIN_FILTER`/`TEXTURE_MAG_FILTER = NEAREST` and
//      `CLAMP_TO_EDGE`, no mipmaps — the same sheets, the same sampler state the
//      world sprites already sample through. The white texel for solid quads
//      (`whiteTexture()`) is given the identical state.
//   2. The same destination rect. The CPU path drew into
//      `[x*dpr, y*dpr] .. [(x+w)*dpr, (y+h)*dpr]`. `sprite.vert.glsl` centres a
//      quad on `a_pos` with extent `a_size`, so `pack` emits
//      `pos = (x + w/2)*dpr` and `size = w*dpr` — the identical rect, to the
//      float.
//   3. The same source rect. UVs come from `GlAtlasStore.uvInto()`, which is
//      `uv()`'s own body — `frameRect()` over the sheet dimensions, the same
//      rect the CPU path fed to `drawImage`'s source arguments.
//   4. The same tint arithmetic. See the `WHITE` doc comment below for why the
//      per-instance tint is equivalent to (not merely similar to) the CPU tint
//      cache's multiply -> destination-in composite.
//
// COMPOSITE ORDER. This pass draws on the GL canvas, which sits one z-index
// BELOW the `Overlay2D` canvas. The caller (renderer.ts's `endFrame`) therefore
// only uses it on frames where the overlay paints nothing — otherwise it falls
// back to the CPU flush, so UI never slips underneath CPU particles/weather.
// That condition lives in `endFrame`, not here; do not "simplify" it away.

import type { UIQuad } from "../renderer";
import type { LoadedAtlasImage } from "../../assets/loader";
import type { ViewUniform } from "../view-uniform";
import { rgbOf } from "../palette";
import type { GlAtlasStore } from "./gl-atlas-store";
import type { GlSpriteInstance, SpriteBatch } from "./sprite-batch";

/** One coalesced run of consecutive same-texture UI instances. */
interface UiDrawGroup {
  texture: WebGLTexture | null;
  first: number;
  count: number;
}

/**
 * Parsed palette colours, keyed by the hex string the quad carried.
 *
 * Not a memory risk and not a cache that can go stale: every game runs a FIXED
 * palette (EDG32 / Apollo-46 / Resurrect-64), so this map converges on a few
 * dozen entries in the first second and never grows again. It exists because
 * `pack` runs over thousands of quads per frame and `rgbOf` does a
 * `normalizeHex` + `parseInt` each time.
 */
const rgbCache = new Map<string, readonly [number, number, number]>();

function floatsOf(hex: string): readonly [number, number, number] {
  const hit = rgbCache.get(hex);
  if (hit !== undefined) return hit;
  const [r, g, b] = rgbOf(hex);
  const parsed = [r / 255, g / 255, b / 255] as const;
  rgbCache.set(hex, parsed);
  return parsed;
}

/**
 * The no-op tint: an untinted textured quad must come out byte-identical to the
 * atlas frame, which `tex.rgb * 1.0` and `tex.a * 1.0` give exactly.
 *
 * WHY THE PER-INSTANCE TINT IS EQUIVALENT TO THE CPU TINT CACHE, not just close.
 * `../ui-draw.ts` builds a tinted glyph by compositing on a transparent buffer:
 * draw the frame, `multiply` an opaque fill of the tint, then `destination-in`
 * the frame again to restore its alpha. Per the compositing spec, with an opaque
 * source that leaves unpremultiplied colour
 *
 *   co = (1 - a_frame) * C_tint + a_frame * C_frame * C_tint
 *
 * while `sprite.frag.glsl` computes `C_frame * C_tint`. Those agree wherever
 * `a_frame` is 1, and where `a_frame` is 0 the pixel is transparent under both.
 * Every tinted UI quad is a glyph or icon SHADE-MASK out of a pixel-art atlas —
 * binary alpha, no antialiased edges — so `a_frame` is only ever 0 or 1 and the
 * two expressions coincide. They also coincide for any alpha at all when the
 * frame is a white mask (`C_frame = 1` collapses both to `C_tint`), which is how
 * `@engine/ui` bakes its glyphs and icons.
 *
 * The frame's own alpha then multiplies the quad's `alpha` in both paths: the
 * CPU path never baked alpha into the cache and set it as `ctx.globalAlpha` at
 * draw time, and the shader does `tex.a * tint.a`.
 */
const WHITE = [1, 1, 1] as const;

// One-time warning per distinct message, mirroring ../ui-draw.ts's `warnMissing`:
// a missing atlas or frame is a graceful skip, never a throw. Throwing here would
// abort the rest of the frame's UI from inside `endFrame`, after the world frame
// was already submitted.
const warnedMessages = new Set<string>();
function warnMissing(message: string): void {
  if (warnedMessages.has(message)) return;
  warnedMessages.add(message);
  console.warn(message);
}

/**
 * The screen-space `ViewUniform` that maps DEVICE pixels (origin top-left, y
 * down) onto clip space, for a drawing buffer of `canvasW` x `canvasH`.
 *
 * Same convention as every other pass (see ../view-uniform.ts): `scaleY` is
 * ALREADY NEGATIVE — the y-flip is baked in here and must not be re-applied in
 * `sprite.vert.glsl`.
 *
 *   x = 0        -> clipX = -1      x = canvasW -> clipX = +1
 *   y = 0        -> clipY = +1      y = canvasH -> clipY = -1
 *
 * `timeSec`/`windStrength` are zeroed rather than inherited: UI instances always
 * carry `swayAmp = 0`, which zeroes the wind term outright, so passing the
 * world's animated values would only make an identical frame look
 * time-dependent to anyone reading a capture.
 */
export function screenSpaceView(canvasW: number, canvasH: number): ViewUniform {
  return {
    scaleX: 2 / canvasW,
    scaleY: -2 / canvasH,
    offsetX: -1,
    offsetY: 1,
    timeSec: 0,
    windStrength: 0,
  };
}

export class UiQuadPass {
  private readonly _groups: UiDrawGroup[] = [];
  private _groupLen = 0;

  /** Instances packed by the last `pack()` call (quads that were skipped do not count). */
  private _instanceCount = 0;

  // Reused scratch instance — `SpriteBatch.add` copies field-by-field into its
  // staging Float32Array, so one object serves every quad and the hot loop
  // allocates nothing.
  private readonly _inst: GlSpriteInstance = {
    x: 0, y: 0, w: 0, h: 0,
    u0: 0, v0: 0, u1: 0, v1: 0,
    rotation: 0, flipX: 0,
    r: 1, g: 1, b: 1, a: 1,
    swayPhase: 0, swayAmp: 0,
  };

  /** Number of draw groups the last `pack()` produced (the `drawArraysInstanced` count). */
  get groupCount(): number {
    return this._groupLen;
  }

  /** Number of quads the last `pack()` actually turned into instances. */
  get instanceCount(): number {
    return this._instanceCount;
  }

  /**
   * Append `quads[0, quadLen)` to `batch`, coalescing consecutive same-texture
   * quads into draw groups.
   *
   * MUST be called before the caller's `batch.upload()`, and the group ranges it
   * records are only valid until the next `batch.begin()`.
   *
   * Quads are packed in SUBMISSION ORDER with no sorting — UI is painter-ordered
   * (a panel background must land under its own glyphs), exactly as the CPU
   * flush was. That is also why groups are runs rather than a per-atlas bucket:
   * sorting by texture would reorder overlapping panels.
   */
  pack(
    batch: SpriteBatch,
    store: GlAtlasStore,
    atlases: ReadonlyMap<string, LoadedAtlasImage>,
    quads: readonly UIQuad[],
    quadLen: number,
    dpr: number,
  ): void {
    this._groupLen = 0;
    this._instanceCount = 0;

    let runTexture: WebGLTexture | null = null;
    let runFirst = 0;
    let runCount = 0;

    const flushRun = (): void => {
      if (runCount === 0 || runTexture === null) return;
      let rec = this._groups[this._groupLen];
      if (rec === undefined) {
        rec = { texture: null, first: 0, count: 0 };
        this._groups[this._groupLen] = rec;
      }
      rec.texture = runTexture;
      rec.first = runFirst;
      rec.count = runCount;
      this._groupLen += 1;
      runCount = 0;
      runTexture = null;
    };

    for (let qi = 0; qi < quadLen; qi += 1) {
      const quad = quads[qi];
      if (quad === undefined) continue;

      // Same three skips the CPU path takes, in the same order.
      const alpha = quad.alpha ?? 1;
      if (alpha <= 0 || quad.width <= 0 || quad.height <= 0) continue;

      const inst = this._inst;
      let texture: WebGLTexture;

      if (quad.atlasId !== undefined && quad.frame !== undefined) {
        const atlas = atlases.get(quad.atlasId);
        if (atlas === undefined) {
          warnMissing(`uiQuadPass: atlas sheet "${quad.atlasId}" not loaded (frame "${quad.frame}")`);
          continue;
        }
        // `uv()` -> `frameRect()` throws on an unknown frame; probe the manifest
        // first so a missing frame is the same graceful skip as a missing atlas.
        if (atlas.manifest.frames[quad.frame] === undefined) {
          warnMissing(`uiQuadPass: frame "${quad.frame}" not in atlas "${quad.atlasId}"`);
          continue;
        }
        // `uvInto`, not `uv`: this runs thousands of times per frame and `uv`
        // would allocate a throwaway object for each one.
        store.uvInto(quad.atlasId, quad.frame, inst);
        texture = store.texture(quad.atlasId);
      } else if (quad.color !== undefined) {
        // Solid-colour quad: a 1x1 white texel, tinted. See GlAtlasStore#whiteTexture.
        inst.u0 = 0; inst.v0 = 0; inst.u1 = 1; inst.v1 = 1;
        texture = store.whiteTexture();
      } else {
        // Neither textured nor coloured — the CPU path drew nothing either.
        continue;
      }

      const [r, g, b] = quad.color !== undefined ? floatsOf(quad.color) : WHITE;
      inst.r = r; inst.g = g; inst.b = b; inst.a = alpha;

      // Centre + extent, in device pixels. The corners land on exactly the
      // `[x*dpr, (x+w)*dpr]` rect the CPU path's drawImage used.
      inst.x = (quad.x + quad.width / 2) * dpr;
      inst.y = (quad.y + quad.height / 2) * dpr;
      inst.w = quad.width * dpr;
      inst.h = quad.height * dpr;

      if (texture !== runTexture) {
        flushRun();
        runTexture = texture;
        runFirst = batch.count;
      }
      batch.add(inst);
      runCount += 1;
      this._instanceCount += 1;
    }

    flushRun();
  }

  /**
   * Draw the groups recorded by the last `pack()`.
   *
   * Brackets the whole group loop in one `beginPass`/`endPass` (the sweep-05
   * structure): everything invariant — program, view uniforms, texture unit,
   * blend mode, VAO — is set once, and each group issues only its texture bind
   * and attribute re-point.
   *
   * `setView` is re-issued here because the caller set the WORLD view on this
   * same batch earlier in the frame. That is safe: the world groups have already
   * been drawn by the time this runs, and `endFrame` re-sets the world view at
   * the top of every frame.
   */
  draw(gl: WebGL2RenderingContext, batch: SpriteBatch, view: ViewUniform): void {
    if (this._groupLen === 0) return;

    batch.setView(view);
    batch.beginPass(gl);
    for (let gi = 0; gi < this._groupLen; gi += 1) {
      const grp = this._groups[gi];
      if (grp === undefined || grp.texture === null) continue;
      batch.drawRange(gl, grp.texture, grp.first, grp.count);
    }
    batch.endPass(gl);
  }

  /** Drop cached texture handles — call when the GL context was lost and every
   *  handle this pass recorded is dead. Groups are rebuilt from scratch each
   *  frame anyway; this just makes a stale handle unreachable in between. */
  reset(): void {
    this._groupLen = 0;
    this._instanceCount = 0;
    for (const grp of this._groups) grp.texture = null;
  }
}
