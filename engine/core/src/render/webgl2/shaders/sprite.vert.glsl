#version 300 es
// sprite.vert.glsl — instanced sprite vertex shader. WebGL2 port of
// ../../webgpu/shaders/sprite.wgsl's vs_main; read that file's header comment for
// the full per-instance byte layout this attribute set mirrors field-for-field.
//
// No per-vertex geometry buffer: the quad's 6 vertices (2 triangles) are derived
// entirely from gl_VertexID, the same trick sprite.wgsl uses with
// @builtin(vertex_index) — GLSL ES 3.00 core, no extension.
//
// Attributes are ALL per-instance (vertexAttribDivisor 1 — see sprite-batch.ts),
// stride 64 bytes (FLOATS_PER_INSTANCE = 16 × 4), in the exact field order
// SpriteBatch packs:
//   loc0 a_pos       vec2  (x, y)            loc1 a_size      vec2  (w, h)
//   loc2 a_uv_min    vec2  (u0, v0)          loc3 a_uv_max    vec2  (u1, v1)
//   loc4 a_rotation  float                   loc5 a_flip_x    float
//   loc6 a_tint      vec4  (r, g, b, a)
//   loc7 a_sway_phase float                  loc8 a_sway_amp float
//
// View-transform convention, identical in every WebGL2 pass (see
// ../../view-uniform.ts's doc comment): u_scale.y is ALREADY NEGATIVE (the
// clip-space Y-flip is baked in by whoever computes the ViewUniform) — do NOT
// negate again here.
//   clipX = worldX * u_scale.x + u_offset.x
//   clipY = worldY * u_scale.y + u_offset.y

layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_size;
layout(location = 2) in vec2 a_uv_min;
layout(location = 3) in vec2 a_uv_max;
layout(location = 4) in float a_rotation;
layout(location = 5) in float a_flip_x;
layout(location = 6) in vec4 a_tint;
layout(location = 7) in float a_sway_phase;
layout(location = 8) in float a_sway_amp;

uniform vec2 u_scale;
uniform vec2 u_offset;
uniform float u_time_sec;
uniform float u_wind_strength;

out vec2 v_uv;
out vec4 v_tint;

void main() {
  int corner_ids[6] = int[6](0, 1, 2, 1, 3, 2);
  int corner_idx = corner_ids[gl_VertexID];

  float lx_sign = ((corner_idx & 1) != 0) ? 1.0 : -1.0;
  float ly_sign = ((corner_idx & 2) != 0) ? 1.0 : -1.0;

  float local_x = lx_sign * a_size.x * 0.5;
  float local_y = ly_sign * a_size.y * 0.5;

  // flipX: mirror the local X axis.
  local_x *= (a_flip_x > 0.5) ? -1.0 : 1.0;

  // Wind sway: only TOP vertices are displaced (ly_sign < 0); bottom stays planted.
  // sway_amp == 0 keeps displacement exactly 0.
  float sway_factor = max(0.0, -ly_sign);
  float sway_disp = a_sway_amp * u_wind_strength * sin(u_time_sec + a_sway_phase) * sway_factor;
  local_x += sway_disp;

  float cos_r = cos(a_rotation);
  float sin_r = sin(a_rotation);
  float rotated_x = cos_r * local_x - sin_r * local_y;
  float rotated_y = sin_r * local_x + cos_r * local_y;

  float world_x = rotated_x + a_pos.x;
  float world_y = rotated_y + a_pos.y;

  float nx = world_x * u_scale.x + u_offset.x;
  float ny = world_y * u_scale.y + u_offset.y;

  float u = ((corner_idx & 1) != 0) ? a_uv_max.x : a_uv_min.x;
  float v = ((corner_idx & 2) != 0) ? a_uv_max.y : a_uv_min.y;

  gl_Position = vec4(nx, ny, 0.0, 1.0);
  v_uv = vec2(u, v);
  v_tint = a_tint;
}
