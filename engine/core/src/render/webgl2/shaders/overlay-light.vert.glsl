#version 300 es
// overlay-light.vert.glsl — one instanced quad per light pool (overlay-light-pass.ts).
// No vertex buffer: the 6 corners come from gl_VertexID, same scheme as shadow.vert.glsl.
//
// Per-instance attributes (vertexAttribDivisor 1), stride 32 bytes:
//   loc0 a_pool   vec4  (cx, cy, radius, peak alpha) world px
//   loc1 a_color  vec4  (r, g, b, unused) straight, 0..1, from a palette role on the CPU
//
// u_scale / u_offset map world px to clip space (scale.y already negative), the same
// convention as shadow.vert.glsl.

layout(location = 0) in vec4 a_pool;
layout(location = 1) in vec4 a_color;

uniform vec2 u_scale;
uniform vec2 u_offset;

out vec2 v_local;
out float v_peak;
out vec3 v_color;

void main() {
  int corner_ids[6] = int[6](0, 1, 2, 1, 3, 2);
  int corner_idx = corner_ids[gl_VertexID];

  float lx = ((corner_idx & 1) != 0) ? 1.0 : -1.0;
  float ly = ((corner_idx & 2) != 0) ? 1.0 : -1.0;

  float world_x = a_pool.x + lx * a_pool.z;
  float world_y = a_pool.y + ly * a_pool.z;

  gl_Position = vec4(world_x * u_scale.x + u_offset.x, world_y * u_scale.y + u_offset.y, 0.0, 1.0);
  v_local = vec2(lx, ly);
  v_peak = a_pool.w;
  v_color = a_color.rgb;
}
