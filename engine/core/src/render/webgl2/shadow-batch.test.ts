import { describe, it, expect, vi } from "vitest";
import { ShadowBatch } from "./shadow-batch";

// node's vitest env has no real WebGL2. Same mock-GL pattern as ./sprite-batch.test.ts.

interface FakeBuffer {
  __kind: "buffer";
  size: number;
  data: Float32Array | null;
  deleted: boolean;
}

function makeFakeGl() {
  const attribCalls: Array<{ location: number; size: number; stride: number; offset: number }> = [];
  const drawCalls: Array<[number, number, number, number]> = [];
  let currentArrayBuffer: FakeBuffer | null = null;
  const deletedBuffers: FakeBuffer[] = [];

  const gl = {
    FLOAT: 1,
    ARRAY_BUFFER: 2,
    DYNAMIC_DRAW: 3,
    TRIANGLES: 4,
    BLEND: 5,
    ONE: 6,
    ONE_MINUS_SRC_ALPHA: 7,
    FUNC_ADD: 8,
    VERTEX_SHADER: 9,
    FRAGMENT_SHADER: 10,
    COMPILE_STATUS: 11,
    LINK_STATUS: 12,

    createShader: vi.fn((type: number) => ({ __kind: "shader", type, compiled: false })),
    shaderSource: vi.fn(),
    compileShader: vi.fn((s: { compiled: boolean }) => {
      s.compiled = true;
    }),
    getShaderParameter: vi.fn((s: { compiled: boolean }) => s.compiled),
    getShaderInfoLog: vi.fn(() => ""),
    deleteShader: vi.fn(),

    createProgram: vi.fn(() => ({ __kind: "program", linked: false })),
    attachShader: vi.fn(),
    linkProgram: vi.fn((p: { linked: boolean }) => {
      p.linked = true;
    }),
    getProgramParameter: vi.fn((p: { linked: boolean }) => p.linked),
    getProgramInfoLog: vi.fn(() => ""),
    deleteProgram: vi.fn(),

    getUniformLocation: vi.fn((_p: unknown, name: string) => ({ __uniform: name })),
    useProgram: vi.fn(),
    uniform2f: vi.fn(),

    createVertexArray: vi.fn(() => ({ __kind: "vao" })),
    bindVertexArray: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn((location: number, size: number, _type: number, _normalized: boolean, stride: number, offset: number) => {
      attribCalls.push({ location, size, stride, offset });
    }),
    vertexAttribDivisor: vi.fn(),

    createBuffer: vi.fn((): FakeBuffer => ({ __kind: "buffer", size: 0, data: null, deleted: false })),
    bindBuffer: vi.fn((_target: number, buf: FakeBuffer | null) => {
      currentArrayBuffer = buf;
    }),
    bufferData: vi.fn((_target: number, size: number) => {
      if (currentArrayBuffer) currentArrayBuffer.size = size;
    }),
    bufferSubData: vi.fn((_target: number, _dstOffset: number, srcData: Float32Array, srcOffset: number, length: number) => {
      if (currentArrayBuffer) currentArrayBuffer.data = srcData.slice(srcOffset, srcOffset + length);
    }),
    deleteBuffer: vi.fn((buf: FakeBuffer) => {
      buf.deleted = true;
      deletedBuffers.push(buf);
    }),

    enable: vi.fn(),
    blendEquationSeparate: vi.fn(),
    blendFuncSeparate: vi.fn(),

    drawArraysInstanced: vi.fn((mode: number, first: number, count: number, instanceCount: number) => {
      drawCalls.push([mode, first, count, instanceCount]);
    }),
  };

  return { gl: gl as unknown as WebGL2RenderingContext, raw: gl, attribCalls, drawCalls, deletedBuffers };
}

describe("ShadowBatch#begin/add", () => {
  it("resets count on begin()", () => {
    const { gl } = makeFakeGl();
    const batch = new ShadowBatch(gl);
    batch.add(1, 2, 3, 4, 0.1, 0.2, 0.3, 0.4);
    expect(batch.count).toBe(1);
    batch.begin();
    expect(batch.count).toBe(0);
  });

  it("packs instance floats at the documented FLOATS_PER_INSTANCE=8 offsets", () => {
    const { gl } = makeFakeGl();
    const batch = new ShadowBatch(gl);
    batch.add(10, 20, 5, 6, 0.1, 0.2, 0.3, 0.4);
    batch.upload();

    const staging = (gl as unknown as { bufferSubData: ReturnType<typeof vi.fn> }).bufferSubData.mock.calls[0]![2] as Float32Array;
    const expected = [10, 20, 5, 6, 0.1, 0.2, 0.3, 0.4].map(Math.fround);
    expect(Array.from(staging.slice(0, 8))).toEqual(expected);
  });

  it("grows the staging array past the 64-instance initial capacity, preserving earlier instances", () => {
    const { gl } = makeFakeGl();
    const batch = new ShadowBatch(gl);
    for (let i = 0; i < 80; i++) batch.add(i, 0, 1, 1, 0, 0, 0, 1);
    expect(batch.count).toBe(80);

    batch.upload();
    const staging = (gl as unknown as { bufferSubData: ReturnType<typeof vi.fn> }).bufferSubData.mock.calls[0]![2] as Float32Array;
    expect(staging[0]).toBe(0);
    expect(staging[79 * 8]).toBe(79);
  });
});

describe("ShadowBatch#upload — growable GPU buffer", () => {
  it("uses bufferData(DYNAMIC_DRAW) sized for 64 instances up front", () => {
    const { gl, raw } = makeFakeGl();
    new ShadowBatch(gl);
    expect(raw.bufferData).toHaveBeenCalledWith(raw.ARRAY_BUFFER, 64 * 8 * 4, raw.DYNAMIC_DRAW);
  });

  it("doubles capacity via bufferData(DYNAMIC_DRAW) when count exceeds capacity, deleting the old buffer", () => {
    const { gl, raw, deletedBuffers } = makeFakeGl();
    const batch = new ShadowBatch(gl);
    for (let i = 0; i < 65; i++) batch.add(0, 0, 1, 1, 0, 0, 0, 1);

    batch.upload();

    expect(raw.bufferData).toHaveBeenCalledWith(raw.ARRAY_BUFFER, 128 * 8 * 4, raw.DYNAMIC_DRAW);
    expect(deletedBuffers.length).toBe(1);
  });
});

describe("ShadowBatch#draw", () => {
  it("issues drawArraysInstanced(TRIANGLES, 0, 6, count) for the whole range", () => {
    const { gl, raw, drawCalls } = makeFakeGl();
    const batch = new ShadowBatch(gl);
    batch.setView({ scaleX: 1, scaleY: -1, offsetX: 0, offsetY: 0 });
    batch.add(0, 0, 1, 1, 0, 0, 0, 1);
    batch.add(1, 1, 1, 1, 0, 0, 0, 1);
    batch.upload();

    batch.draw(gl);

    expect(drawCalls).toEqual([[raw.TRIANGLES, 0, 6, 2]]);
  });

  it("does nothing when count is 0", () => {
    const { gl, drawCalls } = makeFakeGl();
    const batch = new ShadowBatch(gl);
    batch.setView({ scaleX: 1, scaleY: -1, offsetX: 0, offsetY: 0 });
    batch.draw(gl);
    expect(drawCalls).toEqual([]);
  });

  it("re-binds attributes against the CURRENT instance buffer even after a grow (no stale VAO buffer reference)", () => {
    const { gl, attribCalls } = makeFakeGl();
    const batch = new ShadowBatch(gl);
    batch.setView({ scaleX: 1, scaleY: -1, offsetX: 0, offsetY: 0 });
    for (let i = 0; i < 65; i++) batch.add(0, 0, 1, 1, 0, 0, 0, 1); // forces a grow in upload()
    batch.upload();
    attribCalls.length = 0;

    batch.draw(gl);

    // loc0 pos_radii (vec4) at offset 0, loc1 color (vec4) at offset 16, stride 32.
    const loc0 = attribCalls.find((c) => c.location === 0);
    const loc1 = attribCalls.find((c) => c.location === 1);
    expect(loc0).toMatchObject({ size: 4, stride: 32, offset: 0 });
    expect(loc1).toMatchObject({ size: 4, stride: 32, offset: 16 });
  });

  it("sets premultiplied-alpha blend state literally translated from the WebGPU pipeline", () => {
    const { gl, raw } = makeFakeGl();
    const batch = new ShadowBatch(gl);
    batch.setView({ scaleX: 1, scaleY: -1, offsetX: 0, offsetY: 0 });
    batch.add(0, 0, 1, 1, 0, 0, 0, 1);
    batch.upload();

    batch.draw(gl);

    expect(raw.blendFuncSeparate).toHaveBeenCalledWith(raw.ONE, raw.ONE_MINUS_SRC_ALPHA, raw.ONE, raw.ONE_MINUS_SRC_ALPHA);
    expect(raw.blendEquationSeparate).toHaveBeenCalledWith(raw.FUNC_ADD, raw.FUNC_ADD);
    expect(raw.enable).toHaveBeenCalledWith(raw.BLEND);
  });
});
