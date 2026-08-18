/**
 * WebGL2 GPU-buffer creation helpers for the 3D render layer — the
 * `ARRAY_BUFFER`/`ELEMENT_ARRAY_BUFFER`/`UNIFORM_BUFFER` analogues of the
 * `GPUBufferUsage.VERTEX`/`INDEX`/`UNIFORM` allocations the WebGPU
 * `SceneRenderer3D` (`../webgpu/renderer3d.ts`) makes directly via
 * `device.createBuffer`. WebGL2 has no buffer-usage bitmask — "usage" is
 * which target you bind a buffer to plus a store hint (`STATIC_DRAW` /
 * `DYNAMIC_DRAW`) — so these three thin wrappers exist only to give brief
 * 11's WebGL2 `SceneRenderer3D` the same three call-shapes its WebGPU
 * sibling has (one call, buffer created + uploaded), instead of every call
 * site repeating `createBuffer`/`bindBuffer`/`bufferData` boilerplate.
 *
 * Deliberately excluded: a `STORAGE`-buffer equivalent. WebGL2 has no
 * storage buffer at all — the materials table (`GPUBufferUsage.STORAGE` in
 * the WebGPU path) becomes a `std140` uniform buffer with a compile-time
 * `MAX_MATERIALS` bound by `MAX_UNIFORM_BLOCK_SIZE` (see
 * `device3d.ts#maxUniformBlockSize`). That redesign is brief 11's, not
 * this file's — `createUniformBuffer` below is generic plumbing brief 11
 * can use for it, but this file makes no assumption about materials at all.
 */

/** Either the raw bytes to upload immediately, or a byte size to reserve
 *  with undefined contents (matches `gl.bufferData`'s own overload split). */
export type BufferData = ArrayBufferView | number;

function createBoundBuffer(
  gl: WebGL2RenderingContext,
  target: number,
  data: BufferData,
  usage: number,
): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error("webgl2: gl.createBuffer() returned null");
  }
  gl.bindBuffer(target, buffer);
  // `bufferData`'s (target, ArrayBufferView, usage) and (target, GLsizeiptr,
  // usage) overloads are both valid; TS's DOM lib types them as distinct
  // overloads, not a union, so branch rather than pass `data` through as-is.
  if (typeof data === "number") {
    gl.bufferData(target, data, usage);
  } else {
    gl.bufferData(target, data, usage);
  }
  gl.bindBuffer(target, null);
  return buffer;
}

/** Create + upload an `ARRAY_BUFFER` (the vertex-buffer target — GL's
 *  analogue of `GPUBufferUsage.VERTEX`). Defaults to `STATIC_DRAW`: mesh
 *  vertex data is uploaded once at `uploadMesh` time and not rewritten. */
export function createArrayBuffer(
  gl: WebGL2RenderingContext,
  data: BufferData,
  usage: number = gl.STATIC_DRAW,
): WebGLBuffer {
  return createBoundBuffer(gl, gl.ARRAY_BUFFER, data, usage);
}

/** Create + upload an `ELEMENT_ARRAY_BUFFER` (the index-buffer target —
 *  GL's analogue of `GPUBufferUsage.INDEX`). Defaults to `STATIC_DRAW`, same
 *  reasoning as `createArrayBuffer`. */
export function createElementArrayBuffer(
  gl: WebGL2RenderingContext,
  data: BufferData,
  usage: number = gl.STATIC_DRAW,
): WebGLBuffer {
  return createBoundBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, data, usage);
}

/** Create + upload a `UNIFORM_BUFFER` (GL's analogue of
 *  `GPUBufferUsage.UNIFORM`). Defaults to `DYNAMIC_DRAW`: unlike mesh
 *  geometry, the frame uniform (and any future per-frame UBO) is rewritten
 *  every frame via `gl.bufferSubData`/`bufferData`. */
export function createUniformBuffer(
  gl: WebGL2RenderingContext,
  data: BufferData,
  usage: number = gl.DYNAMIC_DRAW,
): WebGLBuffer {
  return createBoundBuffer(gl, gl.UNIFORM_BUFFER, data, usage);
}
