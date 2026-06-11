// TODO(wave-1e): implement StaticLayerPass and WaterPass bodies
import type { GpuContext } from "./gpu-context";
import type { DecorateFn, Sprite } from "../renderer";

export class StaticLayerPass {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_ctx: GpuContext) {
    // Filled by Wave 1e
  }

  /** Bake static sprites into a GPUTexture (OffscreenCanvas 2D → copyExternalImageToTexture). */
  bake(
    _sprites: readonly Sprite[],
    _atlases: Map<string, import("../../assets/loader").LoadedAtlasImage>,
    _worldWidth: number,
    _worldHeight: number,
    _decorate?: DecorateFn,
  ): void {
    throw new Error("StaticLayerPass.bake: not implemented (Wave 1e)");
  }

  clear(): void {
    throw new Error("StaticLayerPass.clear: not implemented (Wave 1e)");
  }

  /** Draw the visible sub-rect of the baked static layer. */
  draw(_pass: GPURenderPassEncoder): void {
    throw new Error("StaticLayerPass.draw: not implemented (Wave 1e)");
  }
}

export class WaterPass {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_ctx: GpuContext) {
    // Filled by Wave 1e
  }

  /** Upload the (scaled) water tile to a small GPUTexture with repeat sampler. */
  bakePattern(
    _frame: string,
    _atlases: Map<string, import("../../assets/loader").LoadedAtlasImage>,
    _tileSize: number,
    _pixelScale?: number,
  ): void {
    throw new Error("WaterPass.bakePattern: not implemented (Wave 1e)");
  }

  setScroll(_offsetX: number, _offsetY: number): void {
    throw new Error("WaterPass.setScroll: not implemented (Wave 1e)");
  }

  setSwell(_alpha: number, _offsetX: number, _offsetY: number): void {
    throw new Error("WaterPass.setSwell: not implemented (Wave 1e)");
  }

  /** Fill the visible world rect with the tiling water pattern. */
  draw(_pass: GPURenderPassEncoder): void {
    throw new Error("WaterPass.draw: not implemented (Wave 1e)");
  }
}
