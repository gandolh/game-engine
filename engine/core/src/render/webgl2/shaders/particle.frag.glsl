#version 300 es
// particle.frag.glsl — companion fragment shader to particle.vert.glsl.
// WebGL2 port of ../../webgpu/shaders/particle.wgsl's fs_main.
//
// Shape rendering (matches the WGSL original exactly):
//   shapeId 0 (circle): SDF — fwidth()-anti-aliased edge, no discard needed
//                        (coverage fades smoothly to 0 at the boundary — but a
//                        hard discard below still saves the blend for fully-covered
//                        pixels beyond the AA ring).
//   shapeId 1 (rect):   full unit quad — coverage = 1.0.
//   shapeId 2 (star):   8-point star via polar radius modulation (cos(4*theta) —
//                        4 cycles over 2*pi = 8 tips), matching the Canvas-2D
//                        drawStar() inner/outer ratio of 0.45.
//
// fwidth() requires uniform control flow in GLSL ES 3.00 (same rule as WGSL) — both
// SDFs are evaluated unconditionally before the shape-dependent `if` selects one.
//
// Alpha easing: pow(alpha, 0.45) — a concave curve so particles are bright for
// most of their life and fade quickly near death (matches the WGSL original,
// task 5). Alpha-only; RGB is untouched.
//
// Output is premultiplied (rgb = straight_rgb * total_alpha, a = total_alpha) to
// match the blend function set by particle-batch.ts (ONE, ONE_MINUS_SRC_ALPHA).

precision mediump float;

in vec2 v_uv;
in vec4 v_color;
in float v_shapeId;

out vec4 o_color;

void main() {
  float dCircle = length(v_uv - vec2(0.5, 0.5)) - 0.5;
  float fwCircle = fwidth(dCircle);
  float covCircle = clamp(1.0 - dCircle / max(fwCircle, 0.0001), 0.0, 1.0);

  float su = v_uv.x * 2.0 - 1.0;
  float sv = v_uv.y * 2.0 - 1.0;
  float theta = atan(sv, su);
  float rad = length(vec2(su, sv));
  float starR = 0.725 + 0.275 * cos(4.0 * theta);
  float dStar = rad - starR;
  float fwStar = fwidth(dStar);
  float covStar = clamp(1.0 - dStar / max(fwStar, 0.0001), 0.0, 1.0);

  int shape = int(round(v_shapeId));
  float coverage = 1.0;
  if (shape == 0) {
    coverage = covCircle;
  } else if (shape == 2) {
    coverage = covStar;
  }

  if (coverage <= 0.0) {
    discard;
  }

  float easedAlpha = pow(max(v_color.a, 0.0), 0.45);
  float totalAlpha = easedAlpha * coverage;

  o_color = vec4(v_color.rgb * totalAlpha, totalAlpha);
}
