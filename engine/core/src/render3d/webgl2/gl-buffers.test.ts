import { describe, it, expect, vi } from "vitest";
import { createArrayBuffer, createElementArrayBuffer, createUniformBuffer } from "./gl-buffers";

// node's vitest env has no real WebGL2. Per the project convention (see
// ../../render/webgl2/program.test.ts), these are exercised against a mock
// GL object rather than a real context. GL constant values below are opaque
// tokens — the helpers only compare them for equality against the same
// fake's own constants.

interface Call {
  target: number;
  buffer: unknown;
}

function makeFakeGl(): WebGL2RenderingContext & {
  bindCalls: Call[];
  bufferDataCalls: Array<{ target: number; data: unknown; usage: number }>;
  createBufferReturnsNull: boolean;
} {
  const bindCalls: Call[] = [];
  const bufferDataCalls: Array<{ target: number; data: unknown; usage: number }> = [];
  let nextBufferId = 0;

  const gl = {
    ARRAY_BUFFER: 34962,
    ELEMENT_ARRAY_BUFFER: 34963,
    UNIFORM_BUFFER: 35345,
    STATIC_DRAW: 35044,
    DYNAMIC_DRAW: 35048,

    createBufferReturnsNull: false,

    createBuffer: vi.fn(function (this: { createBufferReturnsNull: boolean }) {
      if (gl.createBufferReturnsNull) return null;
      return { __kind: "buffer", id: nextBufferId++ };
    }),
    bindBuffer: vi.fn((target: number, buffer: unknown) => {
      bindCalls.push({ target, buffer });
    }),
    bufferData: vi.fn((target: number, data: unknown, usage: number) => {
      bufferDataCalls.push({ target, data, usage });
    }),

    bindCalls,
    bufferDataCalls,
  };

  return gl as unknown as WebGL2RenderingContext & {
    bindCalls: Call[];
    bufferDataCalls: Array<{ target: number; data: unknown; usage: number }>;
    createBufferReturnsNull: boolean;
  };
}

describe("createArrayBuffer", () => {
  it("creates a buffer, binds it to ARRAY_BUFFER, uploads data with STATIC_DRAW by default, then unbinds", () => {
    const gl = makeFakeGl();
    const data = new Float32Array([1, 2, 3]);

    const buffer = createArrayBuffer(gl, data);

    expect(buffer).toBeTruthy();
    expect(gl.bindCalls).toEqual([
      { target: gl.ARRAY_BUFFER, buffer },
      { target: gl.ARRAY_BUFFER, buffer: null },
    ]);
    expect(gl.bufferDataCalls).toEqual([{ target: gl.ARRAY_BUFFER, data, usage: gl.STATIC_DRAW }]);
  });

  it("accepts a byte-size reservation instead of data", () => {
    const gl = makeFakeGl();
    createArrayBuffer(gl, 256);
    expect(gl.bufferDataCalls).toEqual([{ target: gl.ARRAY_BUFFER, data: 256, usage: gl.STATIC_DRAW }]);
  });

  it("honors an explicit usage override", () => {
    const gl = makeFakeGl();
    createArrayBuffer(gl, new Uint32Array([1]), gl.DYNAMIC_DRAW);
    expect(gl.bufferDataCalls[0]?.usage).toBe(gl.DYNAMIC_DRAW);
  });

  it("throws if gl.createBuffer() returns null", () => {
    const gl = makeFakeGl();
    gl.createBufferReturnsNull = true;
    expect(() => createArrayBuffer(gl, new Float32Array([1]))).toThrow(/createBuffer/);
  });
});

describe("createElementArrayBuffer", () => {
  it("binds to ELEMENT_ARRAY_BUFFER and defaults to STATIC_DRAW", () => {
    const gl = makeFakeGl();
    const data = new Uint32Array([0, 1, 2]);

    const buffer = createElementArrayBuffer(gl, data);

    expect(gl.bindCalls).toEqual([
      { target: gl.ELEMENT_ARRAY_BUFFER, buffer },
      { target: gl.ELEMENT_ARRAY_BUFFER, buffer: null },
    ]);
    expect(gl.bufferDataCalls).toEqual([
      { target: gl.ELEMENT_ARRAY_BUFFER, data, usage: gl.STATIC_DRAW },
    ]);
  });
});

describe("createUniformBuffer", () => {
  it("binds to UNIFORM_BUFFER and defaults to DYNAMIC_DRAW", () => {
    const gl = makeFakeGl();
    const data = new Float32Array(24);

    const buffer = createUniformBuffer(gl, data);

    expect(gl.bindCalls).toEqual([
      { target: gl.UNIFORM_BUFFER, buffer },
      { target: gl.UNIFORM_BUFFER, buffer: null },
    ]);
    expect(gl.bufferDataCalls).toEqual([{ target: gl.UNIFORM_BUFFER, data, usage: gl.DYNAMIC_DRAW }]);
  });
});
