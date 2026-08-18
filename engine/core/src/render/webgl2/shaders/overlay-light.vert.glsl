#version 300 es
// overlay-light.vert.glsl — full-screen triangle, no vertex buffer (same trick as
// ./tint.vert.glsl). Emits both the clip position AND a matching UV so the fragment
// shader can sample the CPU-baked overlay-light texture 1:1 with the drawing buffer.

out vec2 v_uv;

void main() {
  float x = (gl_VertexID == 1) ? 3.0 : -1.0;
  float y = (gl_VertexID == 2) ? 3.0 : -1.0;
  gl_Position = vec4(x, y, 0.0, 1.0);

  // Map clip-space [-1,1] to UV [0,1]. The Y axis is flipped deliberately: this
  // engine's clip-space convention has clip Y=+1 at the WINDOW TOP (see
  // ../../view-uniform.ts's header comment on the baked-in Y-flip), while the baked
  // overlay canvas has row 0 (v=0 in the sense texImage2D uploads it) at ITS OWN
  // top too. So v must DECREASE as clip Y increases to keep the two aligned —
  // without this flip the glows would render upside down relative to the world.
  v_uv = vec2((x + 1.0) * 0.5, 1.0 - (y + 1.0) * 0.5);
}
