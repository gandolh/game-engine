import { describe, it, expect, vi } from "vitest";

// node's vitest env has no real WebGPU/DOM. WebGpuRenderer.create() walks through
// GpuContext + every pass constructor, all of which read these WebGPU bitmask
// globals and a handful of device/canvas/document APIs. Stub the minimal surface
// those constructors + a single push()/endFrame() cycle touch.
const g = globalThis as unknown as Record<string, unknown>;
g.GPUBufferUsage ??= {
  MAP_READ: 0x1, MAP_WRITE: 0x2, COPY_SRC: 0x4, COPY_DST: 0x8,
  INDEX: 0x10, VERTEX: 0x20, UNIFORM: 0x40, STORAGE: 0x80,
  INDIRECT: 0x100, QUERY_RESOLVE: 0x200,
};
g.GPUShaderStage ??= { VERTEX: 0x1, FRAGMENT: 0x2, COMPUTE: 0x4 };
g.GPUTextureUsage ??= {
  COPY_SRC: 0x1, COPY_DST: 0x2, TEXTURE_BINDING: 0x4,
  STORAGE_BINDING: 0x8, RENDER_ATTACHMENT: 0x10,
};

class FakeCanvasElement {
  clientWidth = 640;
  clientHeight = 480;
  width = 640;
  height = 480;
  style: Record<string, string> = {};
  parentElement: unknown = null;
  private _webgpuCtx: unknown = null;

  getContext(type: string): unknown {
    if (type === "webgpu") {
      this._webgpuCtx ??= {
        canvas: this,
        configure: () => {},
        getCurrentTexture: () => ({ createView: () => ({}) }),
      };
      return this._webgpuCtx;
    }
    if (type === "2d") {
      return {
        imageSmoothingEnabled: false,
        setTransform: () => {},
        clearRect: () => {},
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
      };
    }
    return null;
  }
}
g.HTMLCanvasElement ??= FakeCanvasElement;
g.document ??= {
  createElement: (tag: string) => (tag === "canvas" ? new FakeCanvasElement() : {}),
};

function makeFakePass(): { calls: Array<[number, number, number, number]>; pass: GPURenderPassEncoder } {
  const calls: Array<[number, number, number, number]> = [];
  const pass = {
    setPipeline: () => {},
    setBindGroup: () => {},
    setVertexBuffer: () => {},
    draw: (vertexCount: number, instanceCount: number, firstVertex: number, firstInstance: number) => {
      calls.push([vertexCount, instanceCount, firstVertex, firstInstance]);
    },
    end: () => {},
  } as unknown as GPURenderPassEncoder;
  return { calls, pass };
}

function makeFakeDevice(pass: GPURenderPassEncoder): GPUDevice {
  const device = {
    lost: new Promise<never>(() => {}),
    pushErrorScope: () => {},
    popErrorScope: async () => null,
    queue: {
      writeBuffer: () => {},
      copyExternalImageToTexture: () => {},
      submit: () => {},
    },
    createBuffer: () => ({ destroy: () => {} }),
    createBindGroupLayout: (desc: unknown) => ({ __desc: desc }),
    createBindGroup: (desc: unknown) => ({ __desc: desc }),
    createShaderModule: () => ({}),
    createPipelineLayout: () => ({}),
    createRenderPipeline: () => ({}),
    createSampler: () => ({}),
    createTexture: () => ({ createView: () => ({}), destroy: () => {} }),
    createCommandEncoder: () => ({
      beginRenderPass: () => pass,
      finish: () => ({}),
    }),
  } as unknown as GPUDevice;
  return device;
}

async function setup() {
  const { calls, pass } = makeFakePass();
  const device = makeFakeDevice(pass);

  (g.navigator as Record<string, unknown> | undefined) ??= {};
  (g.navigator as Record<string, unknown>).gpu = {
    requestAdapter: async () => ({ requestDevice: async () => device }),
    getPreferredCanvasFormat: () => "bgra8unorm",
  };

  const { WebGpuRenderer } = await import("./renderer");
  const { Camera2D } = await import("../camera");

  const canvas = new FakeCanvasElement() as unknown as HTMLCanvasElement;
  const camera = new Camera2D({ worldUnitsX: 640, worldUnitsY: 480, centerX: 320, centerY: 240 });
  const renderer = await WebGpuRenderer.create(canvas, camera);

  renderer.addAtlas({
    manifest: { id: "atlasA", imageUrl: "", width: 64, height: 64, frames: {} },
    bitmap: {} as unknown as ImageBitmap,
    frameRect: () => ({ x: 0, y: 0, w: 16, h: 16 }),
  } as unknown as import("../../assets/loader").LoadedAtlasImage);
  renderer.addAtlas({
    manifest: { id: "atlasB", imageUrl: "", width: 64, height: 64, frames: {} },
    bitmap: {} as unknown as ImageBitmap,
    frameRect: () => ({ x: 0, y: 0, w: 16, h: 16 }),
  } as unknown as import("../../assets/loader").LoadedAtlasImage);

  return { renderer, calls };
}

function sprite(partial: Partial<import("../renderer").Sprite>): import("../renderer").Sprite {
  return {
    x: 0, y: 0, width: 16, height: 16, frame: "f", atlasId: "atlasA",
    rotation: 0, layer: 50, alpha: 1, ...partial,
  };
}

describe("WebGpuRenderer viewport cull (item 16)", () => {
  // Camera: worldUnitsX=640, worldUnitsY=480, centerX=320, centerY=240 → with the
  // 32px margin, cullRight = 320 + 320 + 32 = 672.

  it("does not cull a large sprite whose anchor is just off-screen but whose bbox still overlaps the view", async () => {
    const { renderer, calls } = await setup();
    renderer.beginFrame();
    // width/height 96 → half-extent 48; anchor at 712 is 40px past cullRight (672),
    // but 712 - 48 = 664 < 672, so the sprite's bounding box still overlaps the view.
    renderer.push(sprite({ x: 712, y: 240, width: 96, height: 96 }));
    renderer.endFrame();

    const totalInstances = calls.reduce((sum, c) => sum + c[1], 0);
    expect(totalInstances).toBe(1);
  });

  it("still culls a sprite that is fully off-screen even accounting for its half-extent", async () => {
    const { renderer, calls } = await setup();
    renderer.beginFrame();
    // Same 96x96 sprite, but far enough off-screen that x - halfW (770-48=722) > cullRight (672).
    renderer.push(sprite({ x: 770, y: 240, width: 96, height: 96 }));
    renderer.endFrame();

    const totalInstances = calls.reduce((sum, c) => sum + c[1], 0);
    expect(totalInstances).toBe(0);
  });
});

describe("WebGpuRenderer ghost-occlusion batching (item 22)", () => {
  it("coalesces contiguous same-atlas ghost redraws into one draw group, and splits on an atlas change", async () => {
    const { renderer, calls } = await setup();
    renderer.beginFrame();

    // Three occludable, same-atlas sprites, then a fourth occludable sprite on a
    // different atlas, all covered by one large non-occludable "coverer" sprite
    // drawn after them (higher y → later in the sorted queue → visually in front).
    renderer.push(sprite({ x: 100, y: 100, atlasId: "atlasA", occludable: true }));
    renderer.push(sprite({ x: 104, y: 101, atlasId: "atlasA", occludable: true }));
    renderer.push(sprite({ x: 108, y: 102, atlasId: "atlasA", occludable: true }));
    renderer.push(sprite({ x: 112, y: 103, atlasId: "atlasB", occludable: true }));
    renderer.push(sprite({ x: 100, y: 200, atlasId: "atlasA", width: 1000, height: 1000 }));

    renderer.endFrame();

    // Main pass packs all 5 sprites first (cursor 0..5), so ghost redraws start
    // at batch index 5 — identify them by firstInstance >= 5.
    const ghostCalls = calls.filter((c) => c[3] >= 5);
    const ghostCounts = ghostCalls.map((c) => c[1]).sort((a, b) => a - b);

    // Old (unbatched) behavior would have produced 4 separate 1-instance draws;
    // batched behavior coalesces the 3 contiguous atlasA ghosts into one group
    // and keeps the atlasB ghost as its own group (atlas change splits the group).
    expect(ghostCalls.length).toBe(2);
    expect(ghostCounts).toEqual([1, 3]);
  });
});
