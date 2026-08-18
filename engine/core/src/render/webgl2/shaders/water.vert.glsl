#version 300 es
// water.vert.glsl — ported from ../../webgpu/shaders/water.wgsl (see that file for the full task
// history of what got added/removed from the water shader — this is a backend port, not a redesign).
//
// Attributeless, same trick as static-layer.vert.glsl: gl_VertexID drives the unit quad, no vertex
// buffer/VAO needed. Draw with gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4).
//
// u_view = (scaleX, scaleY, offsetX, offsetY), scaleY already negative — see static-layer.vert.glsl.

uniform vec4 u_view; // scaleX, scaleY, offsetX, offsetY
uniform vec4 u_rect; // left, top, right, bottom (world px)

out vec2 v_worldPos;

void main() {
  float u = float(gl_VertexID & 1);
  float v = float((gl_VertexID >> 1) & 1);

  float wx = u_rect.x + u * (u_rect.z - u_rect.x);
  float wy = u_rect.y + v * (u_rect.w - u_rect.y);

  gl_Position = vec4(wx * u_view.x + u_view.z, wy * u_view.y + u_view.w, 0.0, 1.0);
  v_worldPos = vec2(wx, wy);
}
