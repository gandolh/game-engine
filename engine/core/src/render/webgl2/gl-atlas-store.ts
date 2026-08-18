// gl-atlas-store.ts — WebGL2 port of ../webgpu/texture-atlas.ts (`GpuAtlasStore`).
//
// One `TEXTURE_2D` per atlas sheet (not `TEXTURE_2D_ARRAY`): `layer` is always 0 in
// the WebGPU original — `AtlasUV.layer` exists in the shape but nothing ever
// indexes into a texture array with it (`GpuAtlasStore` creates one 2D texture +
// one bind group per sheet, same as here). Kept the field for shape parity with
// `AtlasUV` (brief 08 / later passes may read it), but a `TEXTURE_2D_ARRAY` would be
// unused complexity — checked before deciding, per the brief.
//
// v-flip decision: WebGPU samples v=0 at the image TOP; WebGL2 samples v=0 at the
// image BOTTOM. Fixed HERE, on upload, via `UNPACK_FLIP_Y_WEBGL` — NOT in `uv()`.
// `uv()` below keeps the exact same top-left-origin arithmetic as `GpuAtlasStore`.
// Do not also flip in `uv()` or in a shader — that would cancel this out.
import type { LoadedAtlasImage } from "../../assets/loader";

export interface AtlasUV {
  u0: number;
  v0: number;
  u1: number;
  v1: number;

  layer: number;
}

interface GlSheet {
  texture: WebGLTexture;

  width: number;
  height: number;
}

export class GlAtlasStore {
  private readonly gl: WebGL2RenderingContext;

  private readonly images = new Map<string, LoadedAtlasImage>();

  private readonly sheets = new Map<string, GlSheet>();

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  add(atlas: LoadedAtlasImage): void {
    const gl = this.gl;
    const id = atlas.manifest.id;
    const { width, height } = atlas.manifest;

    const existing = this.sheets.get(id);
    if (existing !== undefined) {
      gl.deleteTexture(existing.texture);
    }

    this.images.set(id, atlas);

    const texture = gl.createTexture();
    if (!texture) {
      throw new Error(`webgl2: gl.createTexture() returned null for atlas "${id}"`);
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);

    // See the file-level comment: this is the ONE place the v-origin mismatch is
    // fixed. `UNPACK_FLIP_Y_WEBGL` is reset to false right after so it never leaks
    // into some other module's texture upload sharing this context.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.bitmap);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    // Nearest-neighbour always (pixel-art engine), clamp-to-edge, no mipmaps —
    // matches GpuAtlasStore's sampler (`magFilter`/`minFilter: "nearest"`,
    // `addressModeU`/`V: "clamp-to-edge"`).
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindTexture(gl.TEXTURE_2D, null);

    this.sheets.set(id, { texture, width, height });
  }

  get(id: string): LoadedAtlasImage | undefined {
    return this.images.get(id);
  }

  uv(atlasId: string, frame: string): AtlasUV {
    const atlas = this.images.get(atlasId);
    if (atlas === undefined) {
      throw new Error(`atlas sheet "${atlasId}" not loaded`);
    }

    const rect = atlas.frameRect(frame);

    const { width: W, height: H } = atlas.manifest;

    return {
      u0: rect.x / W,
      v0: rect.y / H,
      u1: (rect.x + rect.w) / W,
      v1: (rect.y + rect.h) / H,
      layer: 0,
    };
  }

  /** The GL texture handle for a loaded sheet — the GL analogue of `bindGroup(atlasId)`. */
  texture(atlasId: string): WebGLTexture {
    const sheet = this.sheets.get(atlasId);
    if (sheet === undefined) {
      throw new Error(`atlas sheet "${atlasId}" not loaded`);
    }
    return sheet.texture;
  }

  /** Releases every GL texture this store owns. Not in the WebGPU original (which relies on
   *  GC + `GPUTexture.destroy()` on `add()` replace) — WebGL2 textures need an explicit release
   *  path when the whole store is torn down (context loss / renderer disposal). */
  dispose(): void {
    for (const sheet of this.sheets.values()) {
      this.gl.deleteTexture(sheet.texture);
    }
    this.sheets.clear();
    this.images.clear();
  }
}

export function createGlAtlasStore(gl: WebGL2RenderingContext): GlAtlasStore {
  return new GlAtlasStore(gl);
}
