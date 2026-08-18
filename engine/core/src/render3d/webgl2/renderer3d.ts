/**
 * WebGL2 port of ../webgpu/renderer3d.ts — public GPU facade for the 3D render
 * layer. Thin orchestration over the pure packing in `../buffers.ts` (unchanged,
 * tested, shared by both backends); this file's job is strictly "own the GPU
 * objects and issue the draw calls", same as its WebGPU sibling.
 *
 * Ported findings (brief 11 — corpus/todos/2026-08-18-webgl2-11-render3d-scene-renderer.md):
 *
 *   - Flat shading: `scene3d.wgsl` derives its per-face normal from screen-space
 *     derivatives of world position (`dpdx`/`dpdy`), NOT a `flat`-qualified
 *     normal varying and NOT per-vertex normals. The GLSL port uses `dFdx`/
 *     `dFdy` the same way (core in GLSL ES 3.00, no extension needed) — see
 *     shaders/scene3d.frag.glsl.
 *   - Index width: `packMesh` (`../buffers.ts`) always returns a `Uint32Array`,
 *     so every draw uses `gl.UNSIGNED_INT`, never `UNSIGNED_SHORT`.
 *   - Winding: `geometry.ts` winds every primitive CCW-from-outside; the
 *     WebGPU pipeline used `frontFace: "ccw", cullMode: "back"`, which are
 *     WebGL2's OWN defaults (`gl.frontFace(gl.CCW)`/`gl.cullFace(gl.BACK)`) —
 *     set explicitly below anyway so the contract doesn't rely on an implicit
 *     default surviving some future change elsewhere in a shared GL context.
 *     No winding fix was needed to make the town render right-side-out.
 *   - Depth: `../mat4.ts`'s `perspective()` targets WebGPU/D3D's z in [0,1]
 *     clip-space convention (shared code, must not change). WebGL2's
 *     rasterizer expects OpenGL's z in [-1,1]. Left uncorrected, depth
 *     ordering stays monotonically correct (nothing renders "inside out"),
 *     but only the top half of the GL depth buffer's range would ever be
 *     used, wasting precision. Fixed in shaders/scene3d.vert.glsl with the
 *     standard `z' = z*2 - w` remap on `gl_Position`, NOT in mat4.ts.
 *   - The one WebGL2-incompatible feature in the whole repo: `scene3d.wgsl`'s
 *     unbounded `var<storage, read> materials` becomes the fixed-size
 *     `std140` uniform block sized by `MAX_MATERIALS` below — see its doc
 *     comment for the sizing rationale.
 */
import type { Vec3, Mesh } from "../types";
import type { Mat4 } from "../mat4";
import type { GlDevice3d } from "./device3d";
import { PipelineCache, type Pipeline3d, type ShaderSource } from "./pipeline-cache";
import { createVao, setupAttrib } from "../../render/webgl2/program";
import { createArrayBuffer, createElementArrayBuffer, createUniformBuffer } from "./gl-buffers";
import { FLOATS_PER_INSTANCE, FLOATS_PER_MATERIAL, packMaterials, packMesh, type Material } from "../buffers";
import vertSrcRaw from "./shaders/scene3d.vert.glsl?raw";
import fragSrcRaw from "./shaders/scene3d.frag.glsl?raw";

/**
 * Compile-time bound on the materials table — the WebGL2 replacement for the
 * WGSL original's unbounded `storage` buffer (WebGL2 has no storage buffers;
 * see this file's header). 256 entries * `FLOATS_PER_MATERIAL` (4) floats * 4
 * bytes/float = 4096 bytes, comfortably under WebGL2's guaranteed-minimum 16
 * KB `MAX_UNIFORM_BLOCK_SIZE` — Hollow's combined world + agent (skin/hair/
 * cloth) material table (`WORLD_MATERIAL_KEYS.length + AGENT_MATERIAL_KEYS.length`)
 * is nowhere near this size today. `setMaterials` THROWS rather than silently
 * truncates if a future table ever needs to exceed it (see its doc comment) —
 * the documented fallback at that point is an `RGBA32F` lookup texture +
 * `texelFetch`, not a bigger UBO (WebGL2's floor is only guaranteed to
 * 1,024 vec4s; a lookup texture has no such ceiling).
 */
export const MAX_MATERIALS = 256;

// Fixed uniform-block binding points, resolved once per program at
// construction via gl.uniformBlockBinding — never touched again per frame,
// since the buffer OBJECTS bound to them never change identity afterward
// (both are fixed-size and rewritten in place via bufferSubData).
const FRAME_UBO_BINDING = 0;
const MATERIALS_UBO_BINDING = 1;

// GLES3/WebGL2's sentinel for "no such uniform block" from
// gl.getUniformBlockIndex (GL_INVALID_INDEX, i.e. all bits set on a GLuint).
const GL_INVALID_INDEX = 0xffffffff;

// FrameUniform std140 layout: viewProj (16) + sunDir (vec3, padded to 4) +
// dayNight (1) + ambient (1) + time (1) = 24 floats. GLSL's std140 and WGSL's
// uniform address space share the same alignment rules for this shape (a
// vec3 followed by scalars packs the scalars into the vec3's own padding —
// see mat4.ts, this is not layout-guesswork), so this is byte-identical to
// the WebGPU sibling's FRAME_UNIFORM_FLOATS.
const FRAME_UNIFORM_FLOATS = 24;

/**
 * Prepend a `#define MAX_MATERIALS <n>` line immediately after the mandatory
 * `#version 300 es` first line (which must stay the file's literal line 1 —
 * the GLSL lint guard enforces that on the SOURCE FILE, and this only
 * touches the in-memory copy handed to `compileProgram`, never the file on
 * disk). The single source of truth for the bound is this module's
 * `MAX_MATERIALS` constant, not a literal baked into the .glsl file.
 */
function injectMaxMaterials(src: string): string {
  const lines = src.split("\n");
  lines.splice(1, 0, `#define MAX_MATERIALS ${MAX_MATERIALS}`);
  return lines.join("\n");
}

const VERT_SRC = injectMaxMaterials(vertSrcRaw);
const FRAG_SRC = injectMaxMaterials(fragSrcRaw);

const SHADER_SOURCE: ShaderSource = {
  vert: VERT_SRC,
  frag: FRAG_SRC,
  // No plain (non-block) uniforms — both `Frame` and `Materials` are uniform
  // BLOCKS, resolved via getUniformBlockIndex/uniformBlockBinding below, not
  // gl.getUniformLocation (which cannot resolve a block's own name).
  uniformNames: [],
};

/** An opaque GPU handle for one uploaded mesh (returned by
 *  `SceneRenderer3D.uploadMesh`). Treat as opaque — the only public field is
 *  `indexCount` (useful for debugging/HUD text); the VAO/vertex/index buffers
 *  backing it are only ever touched by `SceneRenderer3D` itself. */
export class MeshHandle {
  readonly indexCount: number;
  /** @internal */
  readonly vao: WebGLVertexArrayObject;
  /** @internal */
  readonly vertexBuffer: WebGLBuffer;
  /** @internal */
  readonly indexBuffer: WebGLBuffer;

  constructor(vao: WebGLVertexArrayObject, vertexBuffer: WebGLBuffer, indexBuffer: WebGLBuffer, indexCount: number) {
    this.vao = vao;
    this.vertexBuffer = vertexBuffer;
    this.indexBuffer = indexBuffer;
    this.indexCount = indexCount;
  }
}

/** One instanced draw call: a mesh + a packed instance buffer (see
 *  `packInstance`/`packInstances` in `../buffers.ts` — the caller builds this
 *  Float32Array with those pure functions before calling `render`). */
export interface DrawCall3d {
  readonly mesh: MeshHandle;
  readonly instances: Float32Array;
  readonly instanceCount: number;
}

/** Everything needed to render one frame. */
export interface Frame3d {
  readonly viewProj: Mat4;
  readonly sunDir: Vec3;
  /** 0 = full night, 1 = full day. */
  readonly dayNight: number;
  readonly ambient: number;
  /** Render/wall clock seconds (e.g. `performance.now() / 1000`) — NEVER a
   *  sim tick. Currently unused by the shipped shader beyond being threaded
   *  through the uniform, reserved for future time-based effects (foliage
   *  sway, water ripple). */
  readonly time: number;
  readonly draws: readonly DrawCall3d[];
}

export interface SceneRendererOptions {
  /** rgba clear color, straight floats (the engine ships no palette — the
   *  caller resolves its own palette role to floats before passing this in).
   *  Defaults to transparent black. */
  readonly clearColor?: readonly [number, number, number, number];
}

/**
 * Owns the GL program, material table, per-mesh VAO/vertex/index buffers, and
 * per-frame uniform for the 3D scene. One instance per canvas/`GlDevice3d`.
 */
export class SceneRenderer3D {
  private readonly gl: WebGL2RenderingContext;
  private readonly device3d: GlDevice3d;
  private readonly pipeline: Pipeline3d;
  private readonly clearColor: readonly [number, number, number, number];
  private readonly frameScratch = new Float32Array(FRAME_UNIFORM_FLOATS);
  private readonly frameBuffer: WebGLBuffer;
  private readonly materialsBuffer: WebGLBuffer;

  private materialsSet = false;
  private readonly instanceBuffers = new Map<MeshHandle, { buffer: WebGLBuffer; capacityBytes: number }>();

  constructor(device3d: GlDevice3d, options: SceneRendererOptions = {}) {
    this.device3d = device3d;
    this.gl = device3d.gl;
    this.clearColor = options.clearColor ?? [0, 0, 0, 0];

    const neededMaterialsBytes = MAX_MATERIALS * FLOATS_PER_MATERIAL * 4;
    if (device3d.maxUniformBlockSize < neededMaterialsBytes) {
      // WebGL2 guarantees MAX_UNIFORM_BLOCK_SIZE >= 16384, so this should be
      // unreachable in practice — but asserting it at construction (rather
      // than trusting the spec floor) turns a hypothetical driver quirk into
      // a loud startup error instead of a corrupted material table.
      throw new Error(
        `render3d: MAX_MATERIALS (${MAX_MATERIALS}) needs a ${neededMaterialsBytes}-byte uniform ` +
          `block, but this device's MAX_UNIFORM_BLOCK_SIZE is only ` +
          `${device3d.maxUniformBlockSize} bytes (WebGL2 guarantees >= 16384). Lower ` +
          `MAX_MATERIALS in renderer3d.ts.`,
      );
    }

    const gl = this.gl;
    const cache = new PipelineCache(gl);
    this.pipeline = cache.getOrCreate(SHADER_SOURCE);

    // Winding: geometry.ts winds every primitive CCW-from-outside; these ARE
    // WebGL2's own defaults (frontFace=CCW, cullFace=BACK), set explicitly
    // anyway so this contract is self-documenting rather than relying on an
    // implicit default (see this file's header — no fix was actually needed
    // here, only depth was).
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);

    this._bindUniformBlock("Frame", FRAME_UBO_BINDING);
    this._bindUniformBlock("Materials", MATERIALS_UBO_BINDING);

    this.frameBuffer = createUniformBuffer(gl, FRAME_UNIFORM_FLOATS * 4, gl.DYNAMIC_DRAW);
    this.materialsBuffer = createUniformBuffer(gl, neededMaterialsBytes, gl.DYNAMIC_DRAW);

    // Buffer OBJECT identity never changes after this point — both are
    // fixed-size and rewritten in place via bufferSubData — so bind each to
    // its binding point ONCE here rather than redundantly every frame.
    gl.bindBufferBase(gl.UNIFORM_BUFFER, FRAME_UBO_BINDING, this.frameBuffer);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, MATERIALS_UBO_BINDING, this.materialsBuffer);
  }

  private _bindUniformBlock(blockName: string, bindingPoint: number): void {
    const gl = this.gl;
    const index = gl.getUniformBlockIndex(this.pipeline.program, blockName);
    if (index === GL_INVALID_INDEX) {
      throw new Error(`render3d: uniform block "${blockName}" not found in the scene3d program`);
    }
    gl.uniformBlockBinding(this.pipeline.program, index, bindingPoint);
  }

  /** Upload the material table. The caller is responsible for keeping the
   *  ORDER of `materials` in sync with whatever `materialIndexOf` resolver
   *  (see `../buffers.ts#materialIndexMap`) it used to build meshes with
   *  `uploadMesh` — index `i` here == material index `i` in the shader.
   *
   *  Throws if `materials.length` exceeds `MAX_MATERIALS`: the WebGL2
   *  materials table is a FIXED-size uniform block, not an unbounded storage
   *  buffer, so an overflow can't be serviced at all — silently truncating
   *  would render whatever overflowed at entry 0's material (reads as a
   *  genetics bug in Hollow, not a renderer bug), which is a much harder bug
   *  to spot than a thrown error here. */
  setMaterials(materials: readonly Material[]): void {
    if (materials.length > MAX_MATERIALS) {
      throw new Error(
        `render3d: setMaterials received ${materials.length} materials, exceeding ` +
          `MAX_MATERIALS (${MAX_MATERIALS}). The WebGL2 materials table is a fixed-size ` +
          `uniform block, not an unbounded storage buffer — either shrink the material ` +
          `table or raise MAX_MATERIALS in renderer3d.ts (checked against ` +
          `maxUniformBlockSize at construction).`,
      );
    }
    const gl = this.gl;
    const packed = packMaterials(materials);
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.materialsBuffer);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, packed);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    this.materialsSet = true;
  }

  /** Pack (via `packMesh`) and upload a mesh's vertex/index buffers, plus a
   *  VAO binding them. Vertex attributes (loc 0/1) are configured once here;
   *  instance attributes (loc 2-6) are (re)configured per-draw in `render`,
   *  since the instance buffer backing a given mesh can be recreated later as
   *  `_instanceBufferFor` grows its capacity — reconfiguring per-draw means a
   *  capacity-driven buffer swap can never leave a stale attribute binding. */
  uploadMesh(mesh: Mesh, materialIndexOf: (key: string) => number): MeshHandle {
    const gl = this.gl;
    const packed = packMesh(mesh, materialIndexOf);

    const vertexBuffer = createArrayBuffer(gl, packed.vertices);
    // packMesh (../buffers.ts) always returns indices as a Uint32Array —
    // every draw call below uses gl.UNSIGNED_INT, never UNSIGNED_SHORT.
    const indexBuffer = createElementArrayBuffer(gl, packed.indices);

    const vao = createVao(gl, () => {
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      for (const spec of this.pipeline.vertexAttribs) setupAttrib(gl, spec);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    });

    return new MeshHandle(vao, vertexBuffer, indexBuffer, packed.indexCount);
  }

  /** Update the GL viewport to match the current canvas size. Call whenever
   *  the canvas resizes. Unlike the WebGPU sibling, no depth-texture
   *  recreation is needed here: WebGL2's default framebuffer's depth buffer
   *  is resized by the browser automatically whenever `canvas.width`/
   *  `height` change (it was allocated with `{ depth: true }` — see
   *  `device3d.ts`). */
  resize(width: number, height: number): void {
    if (this.device3d.lost) return;
    this.gl.viewport(0, 0, Math.max(1, width), Math.max(1, height));
  }

  render(frame: Frame3d): void {
    if (this.device3d.lost) return;
    if (!this.materialsSet) {
      throw new Error("render3d: SceneRenderer3D.render called before setMaterials");
    }

    const gl = this.gl;
    this._writeFrameUniform(frame);

    gl.clearColor(this.clearColor[0], this.clearColor[1], this.clearColor[2], this.clearColor[3]);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.pipeline.program);

    for (const draw of frame.draws) {
      if (draw.instanceCount === 0) continue;
      const instanceBuffer = this._instanceBufferFor(draw.mesh, draw.instances);

      gl.bindVertexArray(draw.mesh.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
      for (const spec of this.pipeline.instanceAttribs) setupAttrib(gl, spec);

      gl.drawElementsInstanced(gl.TRIANGLES, draw.mesh.indexCount, gl.UNSIGNED_INT, 0, draw.instanceCount);
    }

    gl.bindVertexArray(null);
  }

  private _writeFrameUniform(frame: Frame3d): void {
    const gl = this.gl;
    const s = this.frameScratch;
    s.set(frame.viewProj, 0);
    s[16] = frame.sunDir[0];
    s[17] = frame.sunDir[1];
    s[18] = frame.sunDir[2];
    // s[19] left as pad (vec3 -> vec4 alignment, matches std140).
    s[20] = frame.dayNight;
    s[21] = frame.ambient;
    s[22] = frame.time;
    // s[23] left as pad (struct rounds to a 16-byte/4-float multiple).
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.frameBuffer);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, s);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
  }

  private _instanceBufferFor(mesh: MeshHandle, data: Float32Array): WebGLBuffer {
    const gl = this.gl;
    const neededBytes = Math.max(data.byteLength, FLOATS_PER_INSTANCE * 4);
    let entry = this.instanceBuffers.get(mesh);
    if (!entry || entry.capacityBytes < neededBytes) {
      entry = { buffer: createArrayBuffer(gl, neededBytes, gl.DYNAMIC_DRAW), capacityBytes: neededBytes };
      this.instanceBuffers.set(mesh, entry);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, entry.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return entry.buffer;
  }
}
