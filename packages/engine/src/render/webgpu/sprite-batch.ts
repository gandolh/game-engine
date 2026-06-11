// TODO(wave-1c): implement SpriteBatch body
import type { GpuContext } from "./gpu-context";

export interface GpuSpriteInstance {
  x: number; y: number; w: number; h: number;     // world px, centered at (x, y - z)
  u0: number; v0: number; u1: number; v1: number; // atlas UVs
  rotation: number; flipX: 0 | 1;
  r: number; g: number; b: number; a: number;     // tint multiply (0..1), a = sprite alpha
}

export class SpriteBatch {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_ctx: GpuContext, _atlasBindGroupLayout: GPUBindGroupLayout) {
    // Filled by Wave 1c
  }

  /** Reset instance buffer for the new frame. */
  begin(): void {
    throw new Error("SpriteBatch.begin: not implemented (Wave 1c)");
  }

  /** Append one sprite instance (grow buffer as needed). */
  add(_inst: GpuSpriteInstance): void {
    throw new Error("SpriteBatch.add: not implemented (Wave 1c)");
  }

  /** Flush all instances for one atlas in one draw call. Call once per atlas group. */
  flush(
    _pass: GPURenderPassEncoder,
    _atlasBindGroup: GPUBindGroup,
    _atlasInstances: GpuSpriteInstance[],
  ): void {
    throw new Error("SpriteBatch.flush: not implemented (Wave 1c)");
  }
}
