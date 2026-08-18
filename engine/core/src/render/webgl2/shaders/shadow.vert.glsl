#version 300 es
// shadow.vert.glsl — instanced shadow-ellipse vertex shader. WebGL2 port of the
// inline SHADOW_WGSL vs_main in ../../webgpu/shadow-batch.ts.
//
// No per-vertex geometry buffer: the quad's 6 vertices come from gl_VertexID,
// same scheme as sprite.vert.glsl.
//
// Attributes are per-instance (vertexAttribDivisor 1), stride 32 bytes
// (FLOATS_PER_INSTANCE = 8 × 4), matching ShadowBatch's packing exactly:
//   loc0 a_pos_radii  vec4  (x, y, rx, ry) world px
//   loc1 a_color      vec4  (r, g, b, alpha) straight, 0..1
//
// Same view-transform convention as sprite.vert.glsl — u_scale.y is already
// negative, no extra negation here.

layout(location = 0) in vec4 a_pos_radii;
layout(location = 1) in vec4 a_color;

uniform vec2 u_scale;
uniform vec2 u_offset;

out vec2 v_local_uv;
out vec4 v_color;

void main() {
  int corner_ids[6] = int[6](0, 1, 2, 1, 3, 2);
  int corner_idx = corner_ids[gl_VertexID];

  float lx_sign = ((corner_idx & 1) != 0) ? 1.0 : -1.0;
  float ly_sign = ((corner_idx & 2) != 0) ? 1.0 : -1.0;

  float world_x = a_pos_radii.x + lx_sign * a_pos_radii.z;
  float world_y = a_pos_radii.y + ly_sign * a_pos_radii.w;

  float nx = world_x * u_scale.x + u_offset.x;
  float ny = world_y * u_scale.y + u_offset.y;

  gl_Position = vec4(nx, ny, 0.0, 1.0);
  v_local_uv = vec2(
    ((corner_idx & 1) != 0) ? 1.0 : 0.0,
    ((corner_idx & 2) != 0) ? 1.0 : 0.0
  );
  v_color = a_color;
}
