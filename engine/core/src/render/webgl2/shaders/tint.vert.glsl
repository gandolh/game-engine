#version 300 es
// tint.vert.glsl — full-screen triangle, no vertex buffer (WebGL2 port of
// ../../webgpu/shaders/tint.wgsl's vs_main; see tint-pass.ts for the pass this
// belongs to).
//
// vertex 0 -> clip (-1, -1)   bottom-left
// vertex 1 -> clip ( 3, -1)   far right (beyond viewport)
// vertex 2 -> clip (-1,  3)   far bottom... (beyond viewport, in clip terms "top")
// The triangle covers [-1,1]x[-1,1] with no overdraw and needs no attributes —
// gl_VertexID selects the corner.

void main() {
  float x = (gl_VertexID == 1) ? 3.0 : -1.0;
  float y = (gl_VertexID == 2) ? 3.0 : -1.0;
  gl_Position = vec4(x, y, 0.0, 1.0);
}
