#version 300 es
// blit.vert.glsl — trivial passthrough textured quad vertex shader.
//
// Not a rendering pass (out of scope for this brief) — this exists so the
// glsl-lint guard (./glsl-lint.test.ts) has a real, conforming shader to
// scan, and so later pass briefs (03/06) have a minimal worked example of
// the attribute layout `program.ts`'s VAO helpers expect: a per-vertex
// unit-quad position/uv pair (see `createVao`/`setupAttrib` usage examples).

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_uv;

out vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
