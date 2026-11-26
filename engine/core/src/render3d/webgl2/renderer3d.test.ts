import { describe, it, expect, vi } from "vitest";
import { SceneRenderer3D, MAX_MATERIALS, type Frame3d } from "./renderer3d";
import type { GlDevice3d } from "./device3d";
import { FLOATS_PER_MATERIAL, packInstances, type Material } from "../buffers";
import { identity, translation } from "../mat4";
import type { Mesh } from "../types";

// node's vitest env has no real WebGL2 / DOM. Per the project convention (see
// pipeline-cache.test.ts / gl-buffers.test.ts / device3d.test.ts), everything
// here runs against a mock GL object — never a real context.

interface Calls {
  frontFace: number[];
  cullFace: number[];
  bindBufferBase: Array<{ target: number; index: number; buffer: unknown }>;
  uniformBlockBinding: Array<{ program: unknown; index: number; binding: number }>;
  viewport: Array<[number, number, number, number]>;
  drawElementsInstanced: Array<{ mode: number; count: number; type: number; instanceCount: number }>;
  useProgram: unknown[];
  clear: unknown[];
  createdBuffers: unknown[];
  deletedBuffers: unknown[];
  createdVaos: unknown[];
  deletedVaos: unknown[];
}

function makeFakeGl(): { gl: WebGL2RenderingContext; calls: Calls } {
  const calls: Calls = {
    frontFace: [],
    cullFace: [],
    bindBufferBase: [],
    uniformBlockBinding: [],
    viewport: [],
    drawElementsInstanced: [],
    useProgram: [],
    clear: [],
    createdBuffers: [],
    deletedBuffers: [],
    createdVaos: [],
    deletedVaos: [],
  };

  let nextBufferId = 0;
  let nextVaoId = 0;

  const gl = {
    // constants — opaque tokens, only compared against this same fake's own values.
    FLOAT: 5126,
    UNSIGNED_INT: 5125,
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 34962,
    ELEMENT_ARRAY_BUFFER: 34963,
    UNIFORM_BUFFER: 35345,
    STATIC_DRAW: 35044,
    DYNAMIC_DRAW: 35048,
    TRIANGLES: 4,
    COLOR_BUFFER_BIT: 0x4000,
    DEPTH_BUFFER_BIT: 0x100,
    CCW: 2305,
    BACK: 1029,
    LESS: 513,

    // shader/program compile — always succeeds (compileProgram's own error
    // paths are covered by program.test.ts, not re-tested here).
    createShader: vi.fn(() => ({ __kind: "shader" })),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({ __kind: "program" })),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ""),
    deleteProgram: vi.fn(),
    getUniformLocation: vi.fn(() => null),

    getUniformBlockIndex: vi.fn(() => 0),
    uniformBlockBinding: vi.fn((program: unknown, index: number, binding: number) => {
      calls.uniformBlockBinding.push({ program, index, binding });
    }),
    bindBufferBase: vi.fn((target: number, index: number, buffer: unknown) => {
      calls.bindBufferBase.push({ target, index, buffer });
    }),

    createBuffer: vi.fn(() => {
      const buffer = { __kind: "buffer", id: nextBufferId++ };
      calls.createdBuffers.push(buffer);
      return buffer;
    }),
    deleteBuffer: vi.fn((buffer: unknown) => calls.deletedBuffers.push(buffer)),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    bufferSubData: vi.fn(),

    createVertexArray: vi.fn(() => {
      const vao = { __kind: "vao", id: nextVaoId++ };
      calls.createdVaos.push(vao);
      return vao;
    }),
    deleteVertexArray: vi.fn((vao: unknown) => calls.deletedVaos.push(vao)),
    bindVertexArray: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    vertexAttribDivisor: vi.fn(),

    frontFace: vi.fn((mode: number) => calls.frontFace.push(mode)),
    cullFace: vi.fn((mode: number) => calls.cullFace.push(mode)),
    depthFunc: vi.fn(),
    depthMask: vi.fn(),
    useProgram: vi.fn((p: unknown) => calls.useProgram.push(p)),
    clearColor: vi.fn(),
    clearDepth: vi.fn(),
    clear: vi.fn((mask: unknown) => calls.clear.push(mask)),
    viewport: vi.fn((x: number, y: number, w: number, h: number) => calls.viewport.push([x, y, w, h])),
    drawElementsInstanced: vi.fn(
      (mode: number, count: number, type: number, _offset: number, instanceCount: number) => {
        calls.drawElementsInstanced.push({ mode, count, type, instanceCount });
      },
    ),
  };

  return { gl: gl as unknown as WebGL2RenderingContext, calls };
}

function makeDevice3d(gl: WebGL2RenderingContext, maxUniformBlockSize = 65536, lost = false): GlDevice3d {
  return { gl, canvas: {} as HTMLCanvasElement, lost, maxUniformBlockSize } as unknown as GlDevice3d;
}

const TRI_MESH: Mesh = {
  positions: [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  ],
  tris: [{ a: 0, b: 1, c: 2, material: "m" }],
};

function materialIndexOf(): number {
  return 0;
}

const FRAME: Frame3d = {
  viewProj: identity(),
  sunDir: [0, 0, 1],
  dayNight: 1,
  ambient: 0.4,
  time: 0,
  draws: [],
};

describe("SceneRenderer3D construction", () => {
  it("binds the Frame and Materials uniform blocks to fixed binding points, exactly once each", () => {
    const { gl, calls } = makeFakeGl();
    new SceneRenderer3D(makeDevice3d(gl));

    expect(calls.uniformBlockBinding.length).toBe(2);
    expect(calls.bindBufferBase.length).toBe(2);
    expect(calls.bindBufferBase.map((c) => c.index).sort()).toEqual([0, 1]);
  });

  it("sets CCW front-face + back-face culling explicitly (matches geometry.ts's CCW-outward winding)", () => {
    const { gl, calls } = makeFakeGl();
    new SceneRenderer3D(makeDevice3d(gl));

    expect(calls.frontFace).toContain(gl.CCW);
    expect(calls.cullFace).toContain(gl.BACK);
  });

  it("throws if MAX_MATERIALS doesn't fit in the device's MAX_UNIFORM_BLOCK_SIZE", () => {
    const { gl } = makeFakeGl();
    const tinyDevice = makeDevice3d(gl, MAX_MATERIALS * FLOATS_PER_MATERIAL * 4 - 1);
    expect(() => new SceneRenderer3D(tinyDevice)).toThrow(/MAX_UNIFORM_BLOCK_SIZE/);
  });
});

describe("SceneRenderer3D#setMaterials", () => {
  it("throws — rather than silently truncating — when the table exceeds MAX_MATERIALS", () => {
    const { gl } = makeFakeGl();
    const renderer = new SceneRenderer3D(makeDevice3d(gl));
    const tooMany: Material[] = Array.from({ length: MAX_MATERIALS + 1 }, () => ({ color: [1, 1, 1] as const }));

    expect(() => renderer.setMaterials(tooMany)).toThrow(/MAX_MATERIALS/);
  });

  it("accepts exactly MAX_MATERIALS materials without throwing", () => {
    const { gl } = makeFakeGl();
    const renderer = new SceneRenderer3D(makeDevice3d(gl));
    const exact: Material[] = Array.from({ length: MAX_MATERIALS }, () => ({ color: [1, 1, 1] as const }));

    expect(() => renderer.setMaterials(exact)).not.toThrow();
  });
});

describe("SceneRenderer3D#render", () => {
  it("throws if called before setMaterials", () => {
    const { gl } = makeFakeGl();
    const renderer = new SceneRenderer3D(makeDevice3d(gl));
    expect(() => renderer.render(FRAME)).toThrow(/setMaterials/);
  });

  it("is a no-op when the device is lost (no GL draw/clear calls issued)", () => {
    const { gl, calls } = makeFakeGl();
    const renderer = new SceneRenderer3D(makeDevice3d(gl, 65536, true));
    renderer.render(FRAME);
    expect(calls.useProgram.length).toBe(0);
    expect(calls.clear.length).toBe(0);
  });

  it("skips a draw call whose instanceCount is 0", () => {
    const { gl, calls } = makeFakeGl();
    const renderer = new SceneRenderer3D(makeDevice3d(gl));
    renderer.setMaterials([{ color: [1, 1, 1] }]);
    const mesh = renderer.uploadMesh(TRI_MESH, materialIndexOf);

    renderer.render({ ...FRAME, draws: [{ mesh, instances: new Float32Array(0), instanceCount: 0 }] });

    expect(calls.drawElementsInstanced.length).toBe(0);
  });

  it("draws with gl.UNSIGNED_INT — packMesh always produces Uint32Array indices, never Uint16", () => {
    const { gl, calls } = makeFakeGl();
    const renderer = new SceneRenderer3D(makeDevice3d(gl));
    renderer.setMaterials([{ color: [1, 1, 1] }]);
    const mesh = renderer.uploadMesh(TRI_MESH, materialIndexOf);
    const instances = packInstances([{ model: identity(), tint: [1, 1, 1, 1] }]);

    renderer.render({ ...FRAME, draws: [{ mesh, instances, instanceCount: 1 }] });

    expect(calls.drawElementsInstanced).toEqual([
      { mode: gl.TRIANGLES, count: mesh.indexCount, type: gl.UNSIGNED_INT, instanceCount: 1 },
    ]);
  });

  it("draws only the instances the frustum holds, and skips a draw whose instances are all outside", () => {
    const { gl, calls } = makeFakeGl();
    const renderer = new SceneRenderer3D(makeDevice3d(gl));
    renderer.setMaterials([{ color: [1, 1, 1] }]);
    const mesh = renderer.uploadMesh(TRI_MESH, materialIndexOf);
    const at = (x: number) => ({ model: translation([x, 0, 0.5]), tint: [1, 1, 1, 1] as const });
    // FRAME's viewProj is the identity: the visible box is x, y in [-1, 1], z in [0, 1].
    const mixed = packInstances([at(0), at(40), at(-0.5)]);
    const outside = packInstances([at(40), at(-40)]);

    renderer.render({
      ...FRAME,
      draws: [
        { mesh, instances: mixed, instanceCount: 3 },
        { mesh, instances: outside, instanceCount: 2 },
      ],
    });

    expect(calls.drawElementsInstanced.map((c) => c.instanceCount)).toEqual([2]);
    expect(renderer.lastDrawStats).toEqual({ drawCalls: 1, instances: 2 });
  });

  it("mesh.indexCount matches tris.length * 3 (one triangle, no vertex splitting)", () => {
    const { gl } = makeFakeGl();
    const renderer = new SceneRenderer3D(makeDevice3d(gl));
    const mesh = renderer.uploadMesh(TRI_MESH, materialIndexOf);
    expect(mesh.indexCount).toBe(3);
  });
});

describe("SceneRenderer3D#releaseMesh", () => {
  const ONE = packInstances([{ model: identity(), tint: [1, 1, 1, 1] }]);

  function readyRenderer(lost = false): { renderer: SceneRenderer3D; calls: Calls; device: GlDevice3d } {
    const { gl, calls } = makeFakeGl();
    const device = makeDevice3d(gl, 65536, lost);
    const renderer = new SceneRenderer3D(device);
    renderer.setMaterials([{ color: [1, 1, 1] }]);
    return { renderer, calls, device };
  }

  it("deletes every GL object it created over ten upload, draw and release rounds", () => {
    const { renderer, calls } = readyRenderer();
    // The frame and materials uniform buffers live as long as the renderer.
    const before = calls.createdBuffers.length;
    for (let i = 0; i < 10; i++) {
      const mesh = renderer.uploadMesh(TRI_MESH, materialIndexOf);
      renderer.render({ ...FRAME, draws: [{ mesh, instances: ONE, instanceCount: 1 }] });
      renderer.releaseMesh(mesh);
    }
    const created = calls.createdBuffers.slice(before);
    // A vertex, an index and an instance buffer per round.
    expect(created).toHaveLength(30);
    expect(new Set(calls.deletedBuffers)).toEqual(new Set(created));
    expect(calls.deletedBuffers).toHaveLength(30);
    expect(calls.createdVaos).toHaveLength(10);
    expect(new Set(calls.deletedVaos)).toEqual(new Set(calls.createdVaos));
  });

  it("drops the mesh's instance buffer", () => {
    const { renderer, calls } = readyRenderer();
    const mesh = renderer.uploadMesh(TRI_MESH, materialIndexOf);
    renderer.render({ ...FRAME, draws: [{ mesh, instances: ONE, instanceCount: 1 }] });
    const instanceBuffer = calls.createdBuffers.at(-1);
    renderer.releaseMesh(mesh);
    expect(calls.deletedBuffers).toContain(instanceBuffer);
    expect(calls.deletedBuffers).toEqual([mesh.vertexBuffer, mesh.indexBuffer, instanceBuffer]);
  });

  it("throws when a released handle is drawn, even with no instances", () => {
    const { renderer } = readyRenderer();
    const mesh = renderer.uploadMesh(TRI_MESH, materialIndexOf);
    renderer.releaseMesh(mesh);
    expect(mesh.released).toBe(true);
    expect(() => renderer.render({ ...FRAME, draws: [{ mesh, instances: ONE, instanceCount: 1 }] })).toThrow(
      /released/,
    );
    expect(() =>
      renderer.render({ ...FRAME, draws: [{ mesh, instances: new Float32Array(0), instanceCount: 0 }] }),
    ).toThrow(/released/);
  });

  it("does nothing the second time a handle is released", () => {
    const { renderer, calls } = readyRenderer();
    const mesh = renderer.uploadMesh(TRI_MESH, materialIndexOf);
    renderer.releaseMesh(mesh);
    renderer.releaseMesh(mesh);
    expect(calls.deletedBuffers).toHaveLength(2);
    expect(calls.deletedVaos).toHaveLength(1);
  });

  it("only forgets the handle when the device is lost", () => {
    const { renderer, calls } = readyRenderer(true);
    const mesh = renderer.uploadMesh(TRI_MESH, materialIndexOf);
    renderer.releaseMesh(mesh);
    expect(mesh.released).toBe(true);
    expect(calls.deletedBuffers).toHaveLength(0);
    expect(calls.deletedVaos).toHaveLength(0);
  });

  it("deletes a mesh's smaller instance buffer when a larger draw replaces it", () => {
    const { renderer, calls } = readyRenderer();
    const mesh = renderer.uploadMesh(TRI_MESH, materialIndexOf);
    renderer.render({ ...FRAME, draws: [{ mesh, instances: ONE, instanceCount: 1 }] });
    const small = calls.createdBuffers.at(-1);
    const three = packInstances([0, 1, 2].map(() => ({ model: identity(), tint: [1, 1, 1, 1] as const })));
    renderer.render({ ...FRAME, draws: [{ mesh, instances: three, instanceCount: 3 }] });
    expect(calls.deletedBuffers).toEqual([small]);
  });
});

describe("SceneRenderer3D#resizeDevicePixels", () => {
  it("updates the GL viewport to the given size", () => {
    const { gl, calls } = makeFakeGl();
    const renderer = new SceneRenderer3D(makeDevice3d(gl));
    renderer.resizeDevicePixels(800, 600);
    expect(calls.viewport).toContainEqual([0, 0, 800, 600]);
  });

  it("is a no-op when the device is lost", () => {
    const { gl, calls } = makeFakeGl();
    const renderer = new SceneRenderer3D(makeDevice3d(gl, 65536, true));
    renderer.resizeDevicePixels(800, 600);
    expect(calls.viewport.length).toBe(0);
  });
});
