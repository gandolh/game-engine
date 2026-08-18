// program.ts — GLSL ES 3.00 shader/program compilation + the small VAO /
// instanced-attribute helpers every WebGL2 quad pass (briefs 03/04/06/07)
// reuses instead of reinventing.
//
// Sibling of ../webgpu/gpu-context.ts's pipeline-creation responsibilities,
// but WebGL2 has no upfront pipeline object — compile+link is the moment
// errors surface, so that is where the readable-error investment goes.

/**
 * Compile a vertex + fragment shader pair, link them into a program, and
 * throw a single readable error on ANY failure (shader compile OR program
 * link) containing:
 *   - which stage/program failed and its `label`,
 *   - the driver's `getShaderInfoLog`/`getProgramInfoLog` verbatim,
 *   - the offending source, prefixed with 1-based line numbers, so the
 *     line the driver complains about ("ERROR: 0:14: ...") is trivial to
 *     find without opening the .glsl file.
 *
 * On success, both shader objects are deleted after linking (per WebGL
 * convention — the linked program keeps what it needs) and only the
 * program is returned.
 */
export function compileProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
  label: string,
): WebGLProgram {
  const vertShader = compileShader(gl, gl.VERTEX_SHADER, vertSrc, label, "vertex");
  const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc, label, "fragment");

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertShader);
    gl.deleteShader(fragShader);
    throw new Error(`webgl2: gl.createProgram() returned null for program "${label}"`);
  }

  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);

  const linked = gl.getProgramParameter(program, gl.LINK_STATUS) as boolean;
  if (!linked) {
    const log = gl.getProgramInfoLog(program) ?? "(no program info log)";
    gl.deleteProgram(program);
    gl.deleteShader(vertShader);
    gl.deleteShader(fragShader);
    throw new Error(
      `webgl2: program "${label}" failed to link:\n${log}\n\n` +
        `--- vertex source (${label}) ---\n${numberedSource(vertSrc)}\n\n` +
        `--- fragment source (${label}) ---\n${numberedSource(fragSrc)}`,
    );
  }

  // Linked successfully — the shader objects are no longer needed standalone.
  gl.deleteShader(vertShader);
  gl.deleteShader(fragShader);

  return program;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string,
  stage: "vertex" | "fragment",
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error(`webgl2: gl.createShader() returned null for ${stage} shader "${label}"`);
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean;
  if (!compiled) {
    const log = gl.getShaderInfoLog(shader) ?? "(no shader info log)";
    gl.deleteShader(shader);
    throw new Error(
      `webgl2: ${stage} shader "${label}" failed to compile:\n${log}\n\n` +
        `--- source (${label}, ${stage}) ---\n${numberedSource(source)}`,
    );
  }

  return shader;
}

/** Prefix each line with its 1-based line number, right-aligned to 4 columns. */
function numberedSource(src: string): string {
  return src
    .split("\n")
    .map((line, i) => `${String(i + 1).padStart(4, " ")} | ${line}`)
    .join("\n");
}

/**
 * Look up and cache a fixed set of uniform locations once (e.g. right after
 * `compileProgram`), so hot paths never call `gl.getUniformLocation` per
 * frame. `gl.getUniformLocation` legitimately returns `null` for a uniform
 * the linker optimized away (e.g. unused in this permutation) — callers
 * must handle a `null` entry rather than treating it as a bug.
 *
 * Usage:
 *   const uniforms = uniformLocations(gl, program, ["u_tex", "u_view"] as const);
 *   gl.uniform1i(uniforms.u_tex, 0);
 */
export function uniformLocations<const N extends readonly string[]>(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: N,
): Record<N[number], WebGLUniformLocation | null> {
  const out = {} as Record<N[number], WebGLUniformLocation | null>;
  for (const name of names) {
    out[name as N[number]] = gl.getUniformLocation(program, name);
  }
  return out;
}

/**
 * Describes one `vertexAttribPointer` (+ optional `vertexAttribDivisor`)
 * call. `location` is the attribute location (match your shader's
 * `layout(location = N)` or a looked-up `gl.getAttribLocation`).
 * `divisor` omitted or `0` means "advance per vertex" (the geometry
 * buffer); `divisor: 1` means "advance once per instance" (the per-instance
 * data buffer) — the standard split for an instanced quad batch.
 */
export interface AttribSpec {
  location: number;
  /** Components per vertex (1-4). */
  size: number;
  /** e.g. `gl.FLOAT`, `gl.UNSIGNED_BYTE`. */
  type: number;
  normalized?: boolean;
  /** Byte stride between consecutive attributes in the bound buffer. */
  stride: number;
  /** Byte offset of this attribute's first component within the buffer. */
  offset: number;
  /** `0`/omitted = per-vertex; `>=1` = per-instance (`vertexAttribDivisor`). */
  divisor?: number;
}

/**
 * Enable + configure one vertex attribute against whichever buffer is
 * currently `ARRAY_BUFFER`-bound. Callers bind the buffer first, then call
 * this once per attribute it supplies — this is just the boilerplate every
 * pass repeats, not a buffer-management abstraction.
 *
 * Usage (inside a `createVao` setup callback):
 *   gl.bindBuffer(gl.ARRAY_BUFFER, quadGeometryBuffer);   // 4 verts, per-vertex
 *   setupAttrib(gl, { location: 0, size: 2, type: gl.FLOAT, stride: 16, offset: 0 });
 *   setupAttrib(gl, { location: 1, size: 2, type: gl.FLOAT, stride: 16, offset: 8 });
 *
 *   gl.bindBuffer(gl.ARRAY_BUFFER, instanceDataBuffer);   // per-instance
 *   setupAttrib(gl, { location: 2, size: 4, type: gl.FLOAT, stride: 32, offset: 0, divisor: 1 });
 */
export function setupAttrib(gl: WebGL2RenderingContext, spec: AttribSpec): void {
  gl.enableVertexAttribArray(spec.location);
  gl.vertexAttribPointer(
    spec.location,
    spec.size,
    spec.type,
    spec.normalized ?? false,
    spec.stride,
    spec.offset,
  );
  if (spec.divisor) {
    gl.vertexAttribDivisor(spec.location, spec.divisor);
  }
}

/**
 * Create a VAO, bind it, run `setup` (where callers bind buffers and call
 * `setupAttrib` for each attribute), then unbind. Throws if the driver
 * can't allocate a VAO (context loss mid-call, exhausted resources).
 *
 * Usage:
 *   const vao = createVao(gl, (gl) => {
 *     gl.bindBuffer(gl.ARRAY_BUFFER, quadGeometryBuffer);
 *     setupAttrib(gl, { location: 0, size: 2, type: gl.FLOAT, stride: 16, offset: 0 });
 *     setupAttrib(gl, { location: 1, size: 2, type: gl.FLOAT, stride: 16, offset: 8 });
 *
 *     gl.bindBuffer(gl.ARRAY_BUFFER, instanceDataBuffer);
 *     setupAttrib(gl, { location: 2, size: 4, type: gl.FLOAT, stride: 32, offset: 0, divisor: 1 });
 *
 *     gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIndexBuffer);
 *   });
 *   // later, per draw:
 *   gl.bindVertexArray(vao);
 *   gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, instanceCount);
 */
export function createVao(
  gl: WebGL2RenderingContext,
  setup: (gl: WebGL2RenderingContext) => void,
): WebGLVertexArrayObject {
  const vao = gl.createVertexArray();
  if (!vao) {
    throw new Error("webgl2: gl.createVertexArray() returned null");
  }
  gl.bindVertexArray(vao);
  setup(gl);
  gl.bindVertexArray(null);
  return vao;
}
