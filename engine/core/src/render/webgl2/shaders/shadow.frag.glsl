#version 300 es
// shadow.frag.glsl — WebGL2 port of the inline SHADOW_WGSL fs_main in
// ../../webgpu/shadow-batch.ts.
//
// Ellipse coverage via the unit circle in local UV space (the quad already
// spans rx × ry, so a UV circle IS the world-space ellipse). fwidth() is core
// in GLSL ES 3.00 (no OES_standard_derivatives extension needed, unlike ES 1.00)
// and is called from uniform control flow here — no data-dependent branching
// before it.
precision mediump float;

in vec2 v_local_uv;
in vec4 v_color;

out vec4 o_color;

void main() {
  vec2 centered = v_local_uv - vec2(0.5, 0.5);
  float d = length(centered) - 0.5;
  float fw = fwidth(d);
  float coverage = clamp(1.0 - d / max(fw, 0.0001), 0.0, 1.0);

  if (coverage <= 0.0) {
    discard;
  }

  float total_alpha = v_color.a * coverage;
  // Premultiplied output: with a black shadow colour this is (0, 0, 0, a),
  // which the blend state turns into dst * (1 - a) — the Canvas2D multiply look.
  o_color = vec4(v_color.rgb * total_alpha, total_alpha);
}
