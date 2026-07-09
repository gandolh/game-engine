import { describe, it, expect, vi } from "vitest";
import { EDG } from "../palette";

// cloud-shadow-pass.ts reads these WebGPU bitmask globals inside its constructor
// body; node's vitest env has no real WebGPU, so stub the minimal set it touches.
const g = globalThis as unknown as Record<string, unknown>;
g.GPUBufferUsage ??= { UNIFORM: 0x40, COPY_DST: 0x8 };
g.GPUShaderStage ??= { VERTEX: 0x1, FRAGMENT: 0x2 };

import { CloudShadowPass } from "./cloud-shadow-pass";
import type { GpuContext } from "./gpu-context";

function makeFakeCtx(): { ctx: GpuContext; createBindGroup: ReturnType<typeof vi.fn> } {
  const createBindGroup = vi.fn((desc: unknown) => ({ __desc: desc }));
  const device = {
    createBuffer: () => ({ destroy: () => {} }),
    createBindGroupLayout: (desc: unknown) => ({ __desc: desc }),
    createBindGroup,
    createShaderModule: () => ({}),
    createPipelineLayout: () => ({}),
    createRenderPipeline: () => ({}),
    queue: { writeBuffer: () => {} },
  } as unknown as GPUDevice;

  const ctx = {
    device,
    format: "bgra8unorm" as GPUTextureFormat,
    viewBindGroupLayout: () => ({} as GPUBindGroupLayout),
  } as unknown as GpuContext;

  return { ctx, createBindGroup };
}

function makeFakePass(): GPURenderPassEncoder {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

describe("CloudShadowPass bind group hoist", () => {
  it("creates the bind group once (in the constructor), not once per draw()", () => {
    const { ctx, createBindGroup } = makeFakeCtx();
    const pass = new CloudShadowPass(ctx);
    expect(createBindGroup).toHaveBeenCalledTimes(1);

    const gpuPass = makeFakePass();
    const opts = { color: EDG.black, coverage: 0.5, driftSpeed: 1, timeSec: 0 };
    pass.draw(gpuPass, opts);
    pass.draw(gpuPass, opts);
    pass.draw(gpuPass, opts);

    expect(createBindGroup).toHaveBeenCalledTimes(1);
    expect((gpuPass.setBindGroup as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(3);
  });
});
