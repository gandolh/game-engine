/// <reference types="@webgpu/types" />
// Wave 1b: GpuAtlasStore — ImageBitmap -> GPUTexture + UV lookup
import type { LoadedAtlasImage } from "../../assets/loader";

// WebGPU bitmask constants.
// These are specified by the WebGPU spec and match @webgpu/types values.
// Declared here so the file typechecks without requiring @webgpu/types to be
// registered in tsconfig.json (that registration is Wave 0's responsibility;
// when merged onto webgpu-migration the namespace objects are available and
// these numeric aliases are still correct).
const SHADER_STAGE_FRAGMENT = 2 as GPUShaderStageFlags;
const TEXTURE_USAGE_BINDING = 4 as GPUTextureUsageFlags;
const TEXTURE_USAGE_COPY_DST = 2 as GPUTextureUsageFlags;
const TEXTURE_USAGE_RENDER_ATTACHMENT = 16 as GPUTextureUsageFlags;

/** UV coordinates (normalised 0..1) for one frame within its atlas texture. */
export interface AtlasUV {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** Always 0 (reserved for future texture-array optimisation). */
  layer: number;
}

interface GpuSheet {
  texture: GPUTexture;
  bindGroup: GPUBindGroup;
  /** Sheet dimensions in pixels (from manifest, same as bitmap size). */
  width: number;
  height: number;
}

/**
 * Manages GPU-side atlas textures.
 *
 * One GPUTexture per atlas sheet. Keeps the original LoadedAtlasImage in CPU
 * memory so `get()` still works for UI icon code (hotbar/cursor blit).
 *
 * Sampler is nearest (mag + min) to preserve pixel-art crispness.
 */
export class GpuAtlasStore {
  private readonly device: GPUDevice;

  /** CPU-side images for get() / UI icon blits. */
  private readonly images = new Map<string, LoadedAtlasImage>();

  /** GPU-side textures and bind groups. */
  private readonly sheets = new Map<string, GpuSheet>();

  /** Shared nearest-neighbour sampler (pixel-art safe, non-negotiable). */
  private readonly sampler: GPUSampler;

  /**
   * Stable bind-group layout shared by the sprite pipeline.
   * binding 0 = texture_2d<f32>
   * binding 1 = sampler (filtering)
   */
  private readonly layout: GPUBindGroupLayout;

  constructor(device: GPUDevice) {
    this.device = device;

    this.sampler = device.createSampler({
      magFilter: "nearest",
      minFilter: "nearest",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });

    this.layout = device.createBindGroupLayout({
      label: "GpuAtlasStore.bindGroupLayout",
      entries: [
        {
          binding: 0,
          visibility: SHADER_STAGE_FRAGMENT,
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          binding: 1,
          visibility: SHADER_STAGE_FRAGMENT,
          sampler: { type: "filtering" },
        },
      ],
    });
  }

  /**
   * Upload (or replace) one atlas sheet.
   * If an atlas with the same id already exists, its old GPUTexture is destroyed
   * and replaced; the replacement takes effect immediately (next bind-group lookup).
   */
  add(atlas: LoadedAtlasImage): void {
    const id = atlas.manifest.id;
    const { width, height } = atlas.manifest;

    // Destroy previous GPU texture if we are replacing.
    const existing = this.sheets.get(id);
    if (existing !== undefined) {
      existing.texture.destroy();
    }

    // Keep the CPU image alive for get() / frameRect consumers.
    this.images.set(id, atlas);

    // Create the GPU texture.
    const texture = this.device.createTexture({
      label: `atlas:${id}`,
      size: [width, height, 1],
      format: "rgba8unorm",
      usage:
        TEXTURE_USAGE_BINDING |
        TEXTURE_USAGE_COPY_DST |
        TEXTURE_USAGE_RENDER_ATTACHMENT,
    });

    // Upload the bitmap.
    // UVs are top-left origin; WebGPU texture coords are also top-left (v=0 at top).
    // Do NOT add imageOrientation:"flipY" — the existing loader uses createImageBitmap
    // with no flip, so the coordinate systems already agree.
    this.device.queue.copyExternalImageToTexture(
      { source: atlas.bitmap },
      { texture },
      [width, height],
    );

    // Build the bind group (binding 0 = texture view, binding 1 = sampler).
    const bindGroup = this.device.createBindGroup({
      label: `atlas-bg:${id}`,
      layout: this.layout,
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: this.sampler },
      ],
    });

    this.sheets.set(id, { texture, bindGroup, width, height });
  }

  /**
   * Return the CPU-side LoadedAtlasImage for `id`, or `undefined` if not loaded.
   * This keeps the `RendererLike.getAtlas()` contract alive for UI icon code.
   */
  get(id: string): LoadedAtlasImage | undefined {
    return this.images.get(id);
  }

  /**
   * UV rect (0..1) for `frame` within the atlas identified by `atlasId`.
   * Coordinates are top-left origin (v0 < v1), matching WebGPU texture space.
   * Throws with a descriptive message if the atlas or frame is missing.
   */
  uv(atlasId: string, frame: string): AtlasUV {
    const atlas = this.images.get(atlasId);
    if (atlas === undefined) {
      throw new Error(`atlas sheet "${atlasId}" not loaded`);
    }

    // frameRect throws its own "Atlas frame not found" error if the frame is absent.
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

  /**
   * The GPU bind group (texture + nearest sampler) for `atlasId`.
   * Throws if the atlas has not been uploaded via `add()`.
   */
  bindGroup(atlasId: string): GPUBindGroup {
    const sheet = this.sheets.get(atlasId);
    if (sheet === undefined) {
      throw new Error(`atlas sheet "${atlasId}" not loaded`);
    }
    return sheet.bindGroup;
  }

  /**
   * The stable GPUBindGroupLayout shared by the sprite pipeline.
   * Created once in the constructor; same instance for every call.
   */
  bindGroupLayout(): GPUBindGroupLayout {
    return this.layout;
  }
}
