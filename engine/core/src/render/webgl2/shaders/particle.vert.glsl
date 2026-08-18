#version 300 es
// particle.vert.glsl — instanced particle pipeline (WebGL2 port of ../../webgpu/shaders/particle.wgsl).
//
// One program (this file + particle.frag.glsl), driven by particle-batch.ts with
// gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, instanceCount) — six vertices per
// instance (two triangles), no index buffer, exactly like the WGSL original's
// draw(6, N) with no vertex buffer for geometry. gl_VertexID (core GLSL ES 3.00,
// no extension) stands in for WGSL's @builtin(vertex_index).
//
// Per-instance attributes (divisor = 1), matching FLOATS_PER_INSTANCE = 8 in
// particle-batch.ts (stride = 32 bytes):
//   location 0: a_center  vec2  — world center (x, y)
//   location 1: a_size    float — radius (circle) or half-size (rect/star), world px
//   location 2: a_shapeId float — 0 = circle, 1 = rect, 2 = star
//   location 3: a_color   vec4  — (r, g, b, alpha) straight, 0..1
//
// View uniforms (canonical convention shared by every WebGL2 pass in this
// migration — see ../../view-uniform.ts's doc comment):
//   clipX = worldX * u_scale.x + u_offset.x
//   clipY = worldY * u_scale.y + u_offset.y
//   u_scale.y is ALREADY NEGATIVE (Y-flip baked in by the caller) — do NOT negate
//   again here. Only scale/offset are read; particles do not animate from
//   u_timeSec/u_windStrength (the original WGSL pipeline doesn't either — see
//   particle.wgsl's ViewUniform, which has no time/wind fields).

layout(location = 0) in vec2 a_center;
layout(location = 1) in float a_size;
layout(location = 2) in float a_shapeId;
layout(location = 3) in vec4 a_color;

uniform vec2 u_scale;
uniform vec2 u_offset;

out vec2 v_uv;
out vec4 v_color;
out float v_shapeId;

// Quad corners (triangle-list, gl_VertexID 0..5 across two triangles [0,1,2] [1,3,2]):
//   0 = top-left   1 = top-right
//   2 = bottom-left 3 = bottom-right
void main() {
  int cornerIdx[6] = int[6](0, 1, 2, 1, 3, 2);
  int corner = cornerIdx[gl_VertexID];

  float lxSign = (corner & 1) != 0 ? 1.0 : -1.0;
  float lySign = (corner & 2) != 0 ? 1.0 : -1.0;

  vec2 worldPos = a_center + vec2(lxSign, lySign) * a_size;
  vec2 clipPos = worldPos * u_scale + u_offset;

  v_uv = vec2((corner & 1) != 0 ? 1.0 : 0.0, (corner & 2) != 0 ? 1.0 : 0.0);
  v_color = a_color;
  v_shapeId = a_shapeId;

  gl_Position = vec4(clipPos, 0.0, 1.0);
}
