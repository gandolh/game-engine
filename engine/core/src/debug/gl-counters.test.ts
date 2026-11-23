import { describe, expect, it } from "vitest";
import { installGlCounters, texImage2DBytes, texSubImage2DBytes } from "./gl-counters";

/** The WebGL2 constants the counters read, with the values the spec gives them. */
const GL_CONSTANTS = {
  RGBA: 0x1908,
  RGB: 0x1907,
  RED: 0x1903,
  RG: 0x8227,
  ALPHA: 0x1906,
  LUMINANCE: 0x1909,
  LUMINANCE_ALPHA: 0x190a,
  DEPTH_COMPONENT: 0x1902,
  RED_INTEGER: 0x8d94,
  RG_INTEGER: 0x8228,
  RGB_INTEGER: 0x8d98,
  UNSIGNED_BYTE: 0x1401,
  FLOAT: 0x1406,
  HALF_FLOAT: 0x140b,
  INT: 0x1404,
  UNSIGNED_INT: 0x1405,
  SHORT: 0x1402,
  UNSIGNED_SHORT: 0x1403,
  UNSIGNED_SHORT_5_6_5: 0x8363,
  UNSIGNED_SHORT_4_4_4_4: 0x8033,
  UNSIGNED_SHORT_5_5_5_1: 0x8034,
  UNSIGNED_INT_2_10_10_10_REV: 0x8368,
  UNSIGNED_INT_24_8: 0x84fa,
  TEXTURE_2D: 0x0de1,
  TRIANGLES: 0x0004,
};

/** A fake context whose methods live on its prototype, as a real WebGL2 context's do. */
function fakeGl() {
  const calls: string[] = [];
  class FakeContext {
    drawArrays(): void {
      calls.push("drawArrays");
    }
    drawElements(): void {
      calls.push("drawElements");
    }
    drawArraysInstanced(): void {
      calls.push("drawArraysInstanced");
    }
    drawElementsInstanced(): void {
      calls.push("drawElementsInstanced");
    }
    texImage2D(): void {
      calls.push("texImage2D");
    }
    texSubImage2D(): void {
      calls.push("texSubImage2D");
    }
    createTexture(): object {
      calls.push("createTexture");
      return {};
    }
  }
  Object.assign(FakeContext.prototype, GL_CONSTANTS);
  return { gl: new FakeContext() as unknown as WebGL2RenderingContext, calls };
}

describe("texture byte sizes", () => {
  const { gl } = fakeGl();
  it("sizes an image-source upload from the source", () => {
    const bitmap = { width: 128, height: 64 };
    expect(texImage2DBytes(gl, [gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap])).toBe(128 * 64 * 4);
    expect(texSubImage2DBytes(gl, [gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, bitmap])).toBe(128 * 64 * 4);
  });

  it("sizes a sized upload from its width, height, format and type", () => {
    const r8 = [gl.TEXTURE_2D, 0, 0x8229, 10, 20, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(200)];
    expect(texImage2DBytes(gl, r8)).toBe(200);
    const floats = [gl.TEXTURE_2D, 0, 0, 0, 4, 4, gl.RGBA, gl.FLOAT, new Float32Array(64)];
    expect(texSubImage2DBytes(gl, floats)).toBe(4 * 4 * 16);
  });

  it("reads an image element's natural size", () => {
    const img = { naturalWidth: 32, naturalHeight: 32, width: 0, height: 0 };
    expect(texImage2DBytes(gl, [gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img])).toBe(32 * 32 * 4);
  });
});

describe("installGlCounters", () => {
  it("counts draws, instances, uploads and textures, and still calls the context", () => {
    const { gl, calls } = fakeGl();
    const counters = installGlCounters(gl);
    gl.createTexture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, { width: 2, height: 2 } as ImageBitmap);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0, 50);
    expect(counters.frame).toEqual({ drawCalls: 2, instances: 51, textureBytes: 16 });
    expect(counters.totals).toEqual({ drawCalls: 2, textureBytes: 16, textureUploads: 1, texturesCreated: 1 });
    expect(calls).toEqual(["createTexture", "texImage2D", "drawArrays", "drawElementsInstanced"]);

    counters.frameReset();
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, 7);
    expect(counters.frame).toEqual({ drawCalls: 1, instances: 7, textureBytes: 0 });
    expect(counters.totals.drawCalls).toBe(3);
  });

  it("leaves the context untouched after uninstall", () => {
    const { gl } = fakeGl();
    const counters = installGlCounters(gl);
    counters.uninstall();
    expect(Object.prototype.hasOwnProperty.call(gl, "drawArrays")).toBe(false);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    expect(counters.frame.drawCalls).toBe(0);
  });
});
