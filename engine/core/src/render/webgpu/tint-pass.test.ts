import { describe, it, expect, vi } from "vitest";
import { EDG } from "../palette";

// tint-pass.ts reads these WebGPU bitmask globals inside its constructor body;
// node's vitest env has no real WebGPU, so stub the minimal set it touches.
const g = globalThis as unknown as Record<string, unknown>;
g.GPUBufferUsage ??= { UNIFORM: 0x40, COPY_DST: 0x8 };
g.GPUShaderStage ??= { VERTEX: 0x1, FRAGMENT: 0x2 };

import { TintPass } from "./tint-pass";
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

describe("TintPass bind group hoist", () => {
  it("creates the bind group once (in the constructor), not once per draw()", () => {
    const { ctx, createBindGroup } = makeFakeCtx();
    const pass = new TintPass(ctx);
    expect(createBindGroup).toHaveBeenCalledTimes(1);

    const gpuPass = makeFakePass();
    pass.draw(gpuPass, EDG.black, 0.5);
    pass.draw(gpuPass, EDG.black, 0.3);
    pass.draw(gpuPass, EDG.black, 0.1);

    expect(createBindGroup).toHaveBeenCalledTimes(1);
    // The single hoisted bind group is still bound on every draw.
    expect((gpuPass.setBindGroup as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(3);
  });
});
