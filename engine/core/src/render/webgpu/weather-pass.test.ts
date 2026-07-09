import { describe, it, expect, vi } from "vitest";
import { EDG } from "../palette";

// weather-pass.ts reads these WebGPU bitmask globals inside its constructor
// body; node's vitest env has no real WebGPU, so stub the minimal set it touches.
const g = globalThis as unknown as Record<string, unknown>;
g.GPUBufferUsage ??= { UNIFORM: 0x40, COPY_DST: 0x8, VERTEX: 0x20 };
g.GPUShaderStage ??= { VERTEX: 0x1, FRAGMENT: 0x2 };

import { WeatherPass } from "./weather-pass";
import type { GpuContext } from "./gpu-context";
import type { RainField } from "../rain-field";

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
    setVertexBuffer: vi.fn(),
    draw: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

function makeRainWeather(): RainField {
  return {
    weatherKind: "rain",
    count: 1,
    streakColor: EDG.white,
    curtainAlpha: 0.5,
    forEachRainStreak(cb: (x0: number, y0: number, x1: number, y1: number) => void): void {
      cb(0, 0, 1, 1);
    },
    forEachSnowFlake(): void {},
  } as unknown as RainField;
}

describe("WeatherPass bind group hoist", () => {
  it("creates the weather bind group once (in the constructor), not once per draw()", () => {
    const { ctx, createBindGroup } = makeFakeCtx();
    const pass = new WeatherPass(ctx);
    expect(createBindGroup).toHaveBeenCalledTimes(1);

    const gpuPass = makeFakePass();
    const weather = makeRainWeather();
    pass.draw(gpuPass, weather);
    pass.draw(gpuPass, weather);
    pass.draw(gpuPass, weather);

    expect(createBindGroup).toHaveBeenCalledTimes(1);
    expect((gpuPass.setBindGroup as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(3);
  });
});
