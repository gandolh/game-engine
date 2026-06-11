// TODO(wave-1b): implement GpuAtlasStore body
import type { LoadedAtlasImage } from "../../assets/loader";

export interface AtlasUV { u0: number; v0: number; u1: number; v1: number; layer: number; }

export class GpuAtlasStore {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_device: GPUDevice) {
    // Filled by Wave 1b
  }

  /** Upload (or replace) one atlas sheet. Keeps the LoadedAtlasImage for getAtlas(). */
  add(_atlas: LoadedAtlasImage): void {
    throw new Error("GpuAtlasStore.add: not implemented (Wave 1b)");
  }

  get(_id: string): LoadedAtlasImage | undefined {
    throw new Error("GpuAtlasStore.get: not implemented (Wave 1b)");
  }

  /** UV rect (0..1) for a frame within its sheet, plus which texture/layer it is in. */
  uv(_atlasId: string, _frame: string): AtlasUV {
    throw new Error("GpuAtlasStore.uv: not implemented (Wave 1b)");
  }

  /** The bind group (texture + sampler) for a given atlas id. Sampler MUST be nearest. */
  bindGroup(_atlasId: string): GPUBindGroup {
    throw new Error("GpuAtlasStore.bindGroup: not implemented (Wave 1b)");
  }

  bindGroupLayout(): GPUBindGroupLayout {
    throw new Error("GpuAtlasStore.bindGroupLayout: not implemented (Wave 1b)");
  }
}
