#version 300 es
// static-layer.vert.glsl — ported from ../../webgpu/static-layer-pass.ts's inline STATIC_WGSL.
//
// Attributeless: the unit quad is generated from gl_VertexID (GLSL ES 3.00 core, no extension),
// mirroring the WGSL original's @builtin(vertex_index) trick — no vertex buffer, no VAO attribute
// setup needed. Draw with gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4).
//
// u_view = (scaleX, scaleY, offsetX, offsetY). scaleY is ALREADY NEGATIVE (Y-flip baked in by the
// renderer) — do not negate again. Convention shared by every pass in this migration:
//   clipX = worldX * scaleX + offsetX
//   clipY = worldY * scaleY + offsetY

uniform vec4 u_view;     // scaleX, scaleY, offsetX, offsetY
uniform vec4 u_srcRect;  // srcL, srcT, srcR, srcB (texture UV, 0..1)
uniform vec4 u_dstRect;  // dstL, dstT, dstR, dstB (world px)

out vec2 v_uv;

void main() {
  float u = float(gl_VertexID & 1);
  float v = float((gl_VertexID >> 1) & 1);

  float wx = u_dstRect.x + u * (u_dstRect.z - u_dstRect.x);
  float wy = u_dstRect.y + v * (u_dstRect.w - u_dstRect.y);

  float su = u_srcRect.x + u * (u_srcRect.z - u_srcRect.x);
  float sv = u_srcRect.y + v * (u_srcRect.w - u_srcRect.y);

  gl_Position = vec4(wx * u_view.x + u_view.z, wy * u_view.y + u_view.w, 0.0, 1.0);
  v_uv = vec2(su, sv);
}
