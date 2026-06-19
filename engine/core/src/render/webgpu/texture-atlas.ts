

import type { LoadedAtlasImage } from "../../assets/loader";

const SHADER_STAGE_FRAGMENT = 2 as GPUShaderStageFlags;
const TEXTURE_USAGE_BINDING = 4 as GPUTextureUsageFlags;
const TEXTURE_USAGE_COPY_DST = 2 as GPUTextureUsageFlags;
const TEXTURE_USAGE_RENDER_ATTACHMENT = 16 as GPUTextureUsageFlags;

export interface AtlasUV {
  u0: number;
  v0: number;
  u1: number;
  v1: number;

  layer: number;
}

interface GpuSheet {
  texture: GPUTexture;
  bindGroup: GPUBindGroup;

  width: number;
  height: number;
}

export class GpuAtlasStore {
  private readonly device: GPUDevice;

  private readonly images = new Map<string, LoadedAtlasImage>();

  private readonly sheets = new Map<string, GpuSheet>();

  private readonly sampler: GPUSampler;

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

  add(atlas: LoadedAtlasImage): void {
    const id = atlas.manifest.id;
    const { width, height } = atlas.manifest;

    const existing = this.sheets.get(id);
    if (existing !== undefined) {
      existing.texture.destroy();
    }

    this.images.set(id, atlas);

    const texture = this.device.createTexture({
      label: `atlas:${id}`,
      size: [width, height, 1],
      format: "rgba8unorm",
      usage:
        TEXTURE_USAGE_BINDING |
        TEXTURE_USAGE_COPY_DST |
        TEXTURE_USAGE_RENDER_ATTACHMENT,
    });

    this.device.queue.copyExternalImageToTexture(
      { source: atlas.bitmap },
      { texture },
      [width, height],
    );

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

  bindGroup(atlasId: string): GPUBindGroup {
    const sheet = this.sheets.get(atlasId);
    if (sheet === undefined) {
      throw new Error(`atlas sheet "${atlasId}" not loaded`);
    }
    return sheet.bindGroup;
  }

  bindGroupLayout(): GPUBindGroupLayout {
    return this.layout;
  }
}
