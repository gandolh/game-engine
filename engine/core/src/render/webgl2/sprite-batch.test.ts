import { describe, it, expect, vi } from "vitest";
import { SpriteBatch, type GlSpriteInstance } from "./sprite-batch";
import type { ViewUniform } from "../view-uniform";

// node's vitest env has no real WebGL2. Per the project convention (../webgpu/
// renderer.test.ts's fake device, ./program.test.ts's fake GL), SpriteBatch is
// exercised against a mock GL object rather than a real context.

interface FakeBuffer {
  __kind: "buffer";
  size: number;
  data: Float32Array | null;
  deleted: boolean;
}

interface VertexAttribCall {
  location: number;
  size: number;
  type: number;
  normalized: boolean;
  stride: number;
  offset: number;
}

function makeFakeGl() {
  const attribCalls: VertexAttribCall[] = [];
  const divisorCalls: Array<[number, number]> = [];
  const drawCalls: Array<[number, number, number, number]> = [];
  const boundArrayBuffers: Array<FakeBuffer | null> = [];
  let currentArrayBuffer: FakeBuffer | null = null;
  const deletedBuffers: FakeBuffer[] = [];

  const gl = {
    FLOAT: 1,
    ARRAY_BUFFER: 2,
    DYNAMIC_DRAW: 3,
    TRIANGLES: 4,
    TEXTURE_2D: 5,
    TEXTURE0: 6,
    BLEND: 7,
    ONE: 8,
    ONE_MINUS_SRC_ALPHA: 9,
    FUNC_ADD: 10,
    VERTEX_SHADER: 11,
    FRAGMENT_SHADER: 12,
    COMPILE_STATUS: 13,
    LINK_STATUS: 14,

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
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform1i: vi.fn(),

    createVertexArray: vi.fn(() => ({ __kind: "vao" })),
    bindVertexArray: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn((location: number, size: number, type: number, normalized: boolean, stride: number, offset: number) => {
      attribCalls.push({ location, size, type, normalized, stride, offset });
    }),
    vertexAttribDivisor: vi.fn((location: number, divisor: number) => {
      divisorCalls.push([location, divisor]);
    }),

    createBuffer: vi.fn((): FakeBuffer => ({ __kind: "buffer", size: 0, data: null, deleted: false })),
    bindBuffer: vi.fn((_target: number, buf: FakeBuffer | null) => {
      currentArrayBuffer = buf;
      boundArrayBuffers.push(buf);
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

    activeTexture: vi.fn(),
    bindTexture: vi.fn(),

    enable: vi.fn(),
    blendEquationSeparate: vi.fn(),
    blendFuncSeparate: vi.fn(),

    drawArraysInstanced: vi.fn((mode: number, first: number, count: number, instanceCount: number) => {
      drawCalls.push([mode, first, count, instanceCount]);
    }),
  };

  return { gl: gl as unknown as WebGL2RenderingContext, raw: gl, attribCalls, divisorCalls, drawCalls, deletedBuffers };
}

function instance(partial: Partial<GlSpriteInstance> = {}): GlSpriteInstance {
  return {
    x: 1, y: 2, w: 3, h: 4,
    u0: 0.1, v0: 0.2, u1: 0.3, v1: 0.4,
    rotation: 0.5, flipX: 0,
    r: 0.6, g: 0.7, b: 0.8, a: 0.9,
    swayPhase: 1.1, swayAmp: 1.2,
    ...partial,
  };
}

const VIEW: ViewUniform = { scaleX: 1, scaleY: -1, offsetX: 0, offsetY: 0, timeSec: 0, windStrength: 1 };

describe("SpriteBatch#begin/add", () => {
  it("resets count on begin()", () => {
    const { gl } = makeFakeGl();
    const batch = new SpriteBatch(gl);
    batch.add(instance());
    expect(batch.count).toBe(1);
    batch.begin();
    expect(batch.count).toBe(0);
  });

  it("returns the instance index from add() and increments count", () => {
    const { gl } = makeFakeGl();
    const batch = new SpriteBatch(gl);
    expect(batch.add(instance())).toBe(0);
    expect(batch.add(instance())).toBe(1);
    expect(batch.count).toBe(2);
  });

  it("packs instance floats at the documented FLOATS_PER_INSTANCE=16 offsets", () => {
    const { gl } = makeFakeGl();
    const batch = new SpriteBatch(gl);
    batch.add(instance());
    batch.upload();

    // Reach into the uploaded buffer via bufferSubData's captured data.
    const staging = (gl as unknown as { bufferSubData: ReturnType<typeof vi.fn> }).bufferSubData.mock.calls[0]![2] as Float32Array;
    // Values round-trip through Float32Array, so expected values must go through
    // the same f32 rounding (Math.fround) before comparison.
    const expected = [
      1, 2, 3, 4, // x,y,w,h
      0.1, 0.2, 0.3, 0.4, // u0,v0,u1,v1
      0.5, 0, // rotation, flipX
      0.6, 0.7, 0.8, 0.9, // r,g,b,a
      1.1, 1.2, // swayPhase, swayAmp
    ].map(Math.fround);
    expect(Array.from(staging.slice(0, 16))).toEqual(expected);
  });

  it("grows the staging array across the 512-instance initial capacity while preserving earlier instances", () => {
    const { gl } = makeFakeGl();
    const batch = new SpriteBatch(gl);
    for (let i = 0; i < 600; i++) {
      batch.add(instance({ x: i }));
    }
    expect(batch.count).toBe(600);

    batch.upload();
    const staging = (gl as unknown as { bufferSubData: ReturnType<typeof vi.fn> }).bufferSubData.mock.calls[0]![2] as Float32Array;
    // instance 0's x is preserved at float offset 0; instance 599's x at offset 599*16.
    expect(staging[0]).toBe(0);
    expect(staging[599 * 16]).toBe(599);
  });
});

describe("SpriteBatch#upload — growable GPU buffer", () => {
  it("uses bufferData(DYNAMIC_DRAW) sized for 512 instances up front", () => {
    const { gl, raw } = makeFakeGl();
    new SpriteBatch(gl);
    expect(raw.bufferData).toHaveBeenCalledWith(raw.ARRAY_BUFFER, 512 * 16 * 4, raw.DYNAMIC_DRAW);
  });

  it("doubles capacity via a fresh bufferData(DYNAMIC_DRAW) call when count exceeds capacity, and deletes the old buffer", () => {
    const { gl, raw, deletedBuffers } = makeFakeGl();
    const batch = new SpriteBatch(gl);
    for (let i = 0; i < 513; i++) batch.add(instance());

    batch.upload();

    // capacity doubles 512 -> 1024
    expect(raw.bufferData).toHaveBeenCalledWith(raw.ARRAY_BUFFER, 1024 * 16 * 4, raw.DYNAMIC_DRAW);
    expect(deletedBuffers.length).toBe(1);
  });

  it("uses bufferSubData (not bufferData) for a normal per-frame upload within capacity", () => {
    const { gl, raw } = makeFakeGl();
    const batch = new SpriteBatch(gl);
    batch.add(instance());
    (raw.bufferData as ReturnType<typeof vi.fn>).mockClear();

    batch.upload();

    expect(raw.bufferData).not.toHaveBeenCalled();
    expect(raw.bufferSubData).toHaveBeenCalled();
  });
});

describe("SpriteBatch#beginPass/drawRange/endPass (sweep-05 hoist)", () => {
  it("issues drawArraysInstanced(TRIANGLES, 0, 6, count)", () => {
    const { gl, raw, drawCalls } = makeFakeGl();
    const batch = new SpriteBatch(gl);
    batch.setView(VIEW);
    batch.add(instance());
    batch.add(instance());
    batch.upload();

    batch.beginPass(gl);
    batch.drawRange(gl, {} as WebGLTexture, 0, 2);
    batch.endPass(gl);

    expect(drawCalls).toEqual([[raw.TRIANGLES, 0, 6, 2]]);
  });

  it("does nothing when count is 0", () => {
    const { gl, drawCalls } = makeFakeGl();
    const batch = new SpriteBatch(gl);
    batch.setView(VIEW);
    batch.beginPass(gl);
    batch.drawRange(gl, {} as WebGLTexture, 0, 0);
    batch.endPass(gl);
    expect(drawCalls).toEqual([]);
  });

  it("offsets every per-instance attribute by first * STRIDE_BYTES for a non-zero first-instance range", () => {
    const { gl, attribCalls } = makeFakeGl();
    const batch = new SpriteBatch(gl);
    batch.setView(VIEW);
    for (let i = 0; i < 5; i++) batch.add(instance());
    batch.upload();
    attribCalls.length = 0; // clear the constructor-time VAO setup calls

    const STRIDE = 16 * 4;
    const first = 3;
    batch.beginPass(gl);
    batch.drawRange(gl, {} as WebGLTexture, first, 2);
    batch.endPass(gl);

    // location 0 (a_pos) should have been re-pointed at first*STRIDE + 0.
    const posCall = attribCalls.find((c) => c.location === 0);
    expect(posCall?.offset).toBe(first * STRIDE + 0);
    // location 6 (a_tint, vec4) at first*STRIDE + 40.
    const tintCall = attribCalls.find((c) => c.location === 6);
    expect(tintCall?.offset).toBe(first * STRIDE + 40);
  });

  it("sets premultiplied-alpha blend state literally translated from the WebGPU pipeline, in beginPass", () => {
    const { gl, raw } = makeFakeGl();
    const batch = new SpriteBatch(gl);
    batch.setView(VIEW);
    batch.add(instance());
    batch.upload();

    batch.beginPass(gl);
    batch.drawRange(gl, {} as WebGLTexture, 0, 1);
    batch.endPass(gl);

    expect(raw.blendFuncSeparate).toHaveBeenCalledWith(raw.ONE, raw.ONE_MINUS_SRC_ALPHA, raw.ONE, raw.ONE_MINUS_SRC_ALPHA);
    expect(raw.blendEquationSeparate).toHaveBeenCalledWith(raw.FUNC_ADD, raw.FUNC_ADD);
    expect(raw.enable).toHaveBeenCalledWith(raw.BLEND);
  });

  it("uses NEAREST-only sampling contract by binding the passed texture to unit 0", () => {
    const { gl, raw } = makeFakeGl();
    const batch = new SpriteBatch(gl);
    batch.setView(VIEW);
    batch.add(instance());
    batch.upload();
    const tex = { __kind: "texture" } as unknown as WebGLTexture;

    batch.beginPass(gl);
    batch.drawRange(gl, tex, 0, 1);
    batch.endPass(gl);

    expect(raw.activeTexture).toHaveBeenCalledWith(raw.TEXTURE0);
    expect(raw.bindTexture).toHaveBeenCalledWith(raw.TEXTURE_2D, tex);
  });

  it("issues the invariant GL state ONCE per frame regardless of how many groups drawRange draws (sweep-05)", () => {
    const { gl, raw } = makeFakeGl();
    const batch = new SpriteBatch(gl);
    batch.setView(VIEW);
    batch.add(instance());
    batch.add(instance());
    batch.add(instance());
    batch.upload();

    (raw.useProgram as ReturnType<typeof vi.fn>).mockClear();
    (raw.enable as ReturnType<typeof vi.fn>).mockClear();
    (raw.blendEquationSeparate as ReturnType<typeof vi.fn>).mockClear();
    (raw.blendFuncSeparate as ReturnType<typeof vi.fn>).mockClear();
    (raw.activeTexture as ReturnType<typeof vi.fn>).mockClear();
    (raw.uniform1i as ReturnType<typeof vi.fn>).mockClear();
    (raw.bindVertexArray as ReturnType<typeof vi.fn>).mockClear();
    const bindBufferCallsBefore = (raw.bindBuffer as ReturnType<typeof vi.fn>).mock.calls.length;

    const tex1 = { __kind: "texture", id: 1 } as unknown as WebGLTexture;
    const tex2 = { __kind: "texture", id: 2 } as unknown as WebGLTexture;

    batch.beginPass(gl);
    batch.drawRange(gl, tex1, 0, 1);
    batch.drawRange(gl, tex2, 1, 1);
    batch.drawRange(gl, tex1, 2, 1);
    batch.endPass(gl);

    // The invariant state is set exactly once, not once per group (3 groups here).
    expect(raw.useProgram).toHaveBeenCalledTimes(1);
    expect(raw.enable).toHaveBeenCalledTimes(1);
    expect(raw.blendEquationSeparate).toHaveBeenCalledTimes(1);
    expect(raw.blendFuncSeparate).toHaveBeenCalledTimes(1);
    expect(raw.activeTexture).toHaveBeenCalledTimes(1);
    expect(raw.uniform1i).toHaveBeenCalledTimes(1);
    // bindVertexArray: once to bind (in beginPass), once to unbind (null, in endPass).
    expect(raw.bindVertexArray).toHaveBeenCalledTimes(2);
    const vaoCalls = (raw.bindVertexArray as ReturnType<typeof vi.fn>).mock.calls;
    expect(vaoCalls[0]?.[0]).not.toBeNull();
    expect(vaoCalls[1]?.[0]).toBeNull();

    // Only bindTexture (per-group, one per drawRange call) varies.
    expect(raw.bindTexture).toHaveBeenCalledTimes(3);

    // bindBuffer(ARRAY_BUFFER, instanceBuffer) is issued once in beginPass and
    // once more (null) in endPass — not once per group.
    const bindBufferCallsAfter = (raw.bindBuffer as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(bindBufferCallsAfter - bindBufferCallsBefore).toBe(2);
  });
});
