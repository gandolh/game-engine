#version 300 es
// weather.frag.glsl — companion fragment shader to weather.vert.glsl.
// WebGL2 port of ../../webgpu/shaders/weather.wgsl's fs_main (shared by both the
// rain-streak and snow-flake draws — see weather.vert.glsl's header).
//
// Rain streak (v_isSnow ≈ 0): alpha tapers head→tail via smoothstep(v_along) so
// the streak reads as motion blur (bright leading edge, fading tail). No discard.
//
// Snow flake (v_isSnow ≈ 1): SDF-circle with fwidth() anti-aliasing (same recipe
// as particle.frag.glsl's circle). Per-flake v_variation modulates alpha for a
// twinkle effect, range [0.7..1.0] so even dim flakes stay visible. Pixels outside
// the circle discard.
//
// u_color/u_curtainAlpha are the pre-parsed EDG palette-role RGB (0..1) and the
// RainField's curtainAlpha (= its Canvas-2D globalAlpha) — no RGB is synthesised
// and no hex literal appears in this shader; colour arrives as a uniform exactly
// as the project's palette rule requires.
//
// fwidth() must run in uniform control flow (same rule as WGSL / particle.frag.glsl)
// — the snow SDF is computed unconditionally; only the FINAL select (and the
// discard) is branched on v_isSnow.
//
// Output is premultiplied (rgb = color * total_alpha, a = total_alpha) to match
// the blend function weather-pass.ts sets (ONE, ONE_MINUS_SRC_ALPHA) — identical
// to particle-batch.ts's blend state (see weather-pass.ts's header comment for the
// literal WGSL blend-descriptor comparison).

precision mediump float;

in vec2 v_uv;
in float v_along;
in float v_isSnow;
in float v_variation;

uniform vec3 u_color;
uniform float u_curtainAlpha;

out vec4 o_color;

void main() {
  float streakTaper = 1.0 - smoothstep(0.0, 1.0, v_along);

  float dSnow = length(v_uv - vec2(0.5, 0.5)) - 0.5;
  float fwSnow = fwidth(dSnow);
  float covSnow = clamp(1.0 - dSnow / max(fwSnow, 0.0001), 0.0, 1.0);

  bool isSnow = v_isSnow > 0.5;
  float coverage = isSnow ? covSnow : 1.0;

  if (isSnow && coverage <= 0.0) {
    discard;
  }

  float baseAlpha = u_curtainAlpha;
  float snowVarAlpha = 0.7 + 0.3 * v_variation;

  float totalAlpha = isSnow
      ? (baseAlpha * coverage * snowVarAlpha)
      : (baseAlpha * streakTaper);

  o_color = vec4(u_color * totalAlpha, totalAlpha);
}
