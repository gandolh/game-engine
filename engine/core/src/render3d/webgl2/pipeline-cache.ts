/**
 * Lazily creates + memoizes the scene3d WebGL2 program, keyed by toon-step
 * count — sibling of `../webgpu/pipeline-cache.ts`, but WebGL2 has no
 * pipeline object, so this becomes a program cache. The WebGPU sibling's
 * cache key is `${format}:${toonSteps}`; WebGL2 has no `GPUTextureFormat`
 * analogue, so that half of the key is dropped here rather than faked with
 * a meaningless placeholder.
 *
 * Unlike the WebGPU sibling — which imports its one hardcoded
 * `scene3d.wgsl` source at module scope — this cache does NOT import a
 * GLSL source itself. Translating `scene3d.wgsl` to GLSL ES 3.00 is brief
 * 11's job, done after both backend halves exist, so no such file exists
 * yet. Instead, `getOrCreate` takes a {@link ShaderSource} (vertex +
 * fragment GLSL strings, plus the uniform names to resolve) supplied by the
 * caller (brief 11's `SceneRenderer3D`) — this module has zero compile-time
 * dependency on a shader file, or on any particular uniform naming.
 *
 * What IS fixed here (not caller-supplied): the vertex/instance attribute
 * *locations*, sizes, and byte offsets/strides. Those come straight from
 * `../buffers.ts`'s packing contract (`FLOATS_PER_VERTEX`/
 * `FLOATS_PER_INSTANCE`, owned by this same brief) — a mechanical
 * translation of the WebGPU sibling's `vertexBufferLayout`/
 * `instanceBufferLayout`, not a shader-design choice. Brief 11's GLSL only
 * needs to declare matching `layout(location = N)` attributes; it does not
 * choose the numbers.
 */
import { compileProgram, uniformLocations, type AttribSpec } from "../../render/webgl2/program";
import { FLOATS_PER_INSTANCE, FLOATS_PER_VERTEX } from "../buffers";

const DEFAULT_TOON_STEPS = 3;

/** Vertex + fragment GLSL ES 3.00 source for the scene3d program, plus the
 *  uniform names to resolve once at build time. Supplied by the caller
 *  (brief 11) — see module doc for why this file doesn't import a shader
 *  itself. */
export interface ShaderSource {
  readonly vert: string;
  readonly frag: string;
  readonly uniformNames: readonly string[];
}

/** Everything a frame needs to draw with the scene3d program: the linked
 *  program, its cached uniform locations, and its vertex/instance attribute
 *  layout (ready to hand to `createVao`/`setupAttrib` in
 *  `../../render/webgl2/program.ts`). Sibling of the WebGPU `Pipeline3d` —
 *  same type name, WebGL2-shaped contents, so `SceneRenderer3D` (brief 11)
 *  reads familiarly across both backends. */
export interface Pipeline3d {
  readonly program: WebGLProgram;
  readonly uniforms: Record<string, WebGLUniformLocation | null>;
  /** Buffer 0 layout — per-vertex: position.xyz (loc 0) + materialIndex
   *  (loc 1). Mirrors `packMesh`'s 4-float-per-vertex row exactly. */
  readonly vertexAttribs: readonly AttribSpec[];
  /** Buffer 1 layout — per-instance: model matrix as 4 columns (loc 2..5) +
   *  tint (loc 6), each with `divisor: 1`. Mirrors `packInstance`'s
   *  20-float row exactly. */
  readonly instanceAttribs: readonly AttribSpec[];
}

/**
 * Program cache for the scene3d WebGL2 pass. One instance per `GlDevice3d`
 * (mirrors `PipelineCache`'s one-per-`GPUDevice` lifetime in the WebGPU
 * sibling).
 */
export class PipelineCache {
  private readonly gl: WebGL2RenderingContext;
  private readonly cache = new Map<number, Pipeline3d>();

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  /**
   * Returns the cached `Pipeline3d` for `toonSteps`, building it from
   * `source` on first use. `toonSteps` currently only affects the cache
   * key, not `source`'s contents — same deferred-seam shape as the WebGPU
   * sibling (see its module doc): only one ramp is shipped today, so the
   * knob doesn't change anything observable yet, but the cache is already
   * keyed correctly for when it does. `source` is ignored on a cache hit —
   * callers should pass the same `ShaderSource` for a given `toonSteps`.
   */
  getOrCreate(source: ShaderSource, toonSteps: number = DEFAULT_TOON_STEPS): Pipeline3d {
    const hit = this.cache.get(toonSteps);
    if (hit) return hit;
    const built = this._build(source);
    this.cache.set(toonSteps, built);
    return built;
  }

  private _build(source: ShaderSource): Pipeline3d {
    const gl = this.gl;
    const program = compileProgram(gl, source.vert, source.frag, "scene3d");
    const uniforms = uniformLocations(gl, program, source.uniformNames);

    const vertexStride = FLOATS_PER_VERTEX * 4;
    const vertexAttribs: AttribSpec[] = [
      { location: 0, size: 3, type: gl.FLOAT, stride: vertexStride, offset: 0 },
      { location: 1, size: 1, type: gl.FLOAT, stride: vertexStride, offset: 12 },
    ];

    const instanceStride = FLOATS_PER_INSTANCE * 4;
    const instanceAttribs: AttribSpec[] = [
      { location: 2, size: 4, type: gl.FLOAT, stride: instanceStride, offset: 0, divisor: 1 },
      { location: 3, size: 4, type: gl.FLOAT, stride: instanceStride, offset: 16, divisor: 1 },
      { location: 4, size: 4, type: gl.FLOAT, stride: instanceStride, offset: 32, divisor: 1 },
      { location: 5, size: 4, type: gl.FLOAT, stride: instanceStride, offset: 48, divisor: 1 },
      { location: 6, size: 4, type: gl.FLOAT, stride: instanceStride, offset: 64, divisor: 1 },
    ];

    return { program, uniforms, vertexAttribs, instanceAttribs };
  }
}
