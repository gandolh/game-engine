#version 300 es
// cloud.frag.glsl — WebGL2 port of ../../webgpu/shaders/cloud.wgsl's fs_main.
// Read that file's header comment for the full design writeup (world-anchored
// 3-octave fBm, quantized blob thresholds, the two polarities, the optional
// vignette) — this ports the same math to GLSL ES 3.00 plain uniforms in
// place of a WGSL uniform-buffer struct. Nothing about the recipe changed.
//
// QUANTIZATION IS THE WHOLE POINT of this effect: step() gives crisp 0/1
// tiers, never a smooth gradient, so the overlay keeps the pixel-art read.
// Do NOT replace a step() threshold with smoothstep/mix — that would produce
// a "correct-looking" but actually failed port (see the brief).
//
// `highp` (not `mediump`) is required here — the fBm's hash constants
// (127.1, 311.7, 43758.5453) lose enough precision under mediump to band or
// stripe visibly on mobile GPUs.
precision highp float;

uniform vec3  u_color;        // resolved EDG/Apollo RGB in [0,1] (CPU-parsed via rgbOf)
uniform float u_coverage;     // [0,1], 0 = clear, 1 = full overcast
uniform float u_drift_speed;  // cloud scroll rate, world px/s
uniform float u_time_sec;     // wall-clock seconds (animation phase, from CloudOptions)
uniform float u_mode;         // 0 = shadow (darken), 1 = haze (warm lift)
uniform float u_vignette;     // [0,1], 0 = off

in vec2 v_world_pos;
in vec2 v_ndc;

out vec4 o_color;

// ── Value-noise helpers ─────────────────────────────────────────────────────
// Standard 2D bilinear value noise (same recipe as the WGSL original / this
// project's water shader). hash21 maps a 2D coordinate to a pseudo-random
// value between zero and one; valueNoise returns a smoothly-interpolated
// version of that same range.

float hash21(vec2 coord_in) {
  return fract(sin(dot(coord_in, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 coord_in) {
  vec2 cell = floor(coord_in);
  vec2 frac_part = fract(coord_in);
  // Cubic Hermite smoothing (smoother than linear; avoids crease seams).
  vec2 sm = frac_part * frac_part * (3.0 - 2.0 * frac_part);
  float corner_a = hash21(cell + vec2(0.0, 0.0));
  float corner_b = hash21(cell + vec2(1.0, 0.0));
  float corner_c = hash21(cell + vec2(0.0, 1.0));
  float corner_d = hash21(cell + vec2(1.0, 1.0));
  return mix(mix(corner_a, corner_b, sm.x), mix(corner_c, corner_d, sm.x), sm.y);
}

// 3 octaves of value noise at increasing frequency / decreasing amplitude —
// good soft blobs without sub-pixel noise. Normalized by the geometric-series
// sum (0.5 + 0.25 + 0.125 = 0.875) so the result lands in roughly [0,1].
float fbm3(vec2 p_coord) {
  float total = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  total += amp * valueNoise(p_coord * freq);
  amp *= 0.5;
  freq *= 2.0;
  total += amp * valueNoise(p_coord * freq);
  amp *= 0.5;
  freq *= 2.0;
  total += amp * valueNoise(p_coord * freq);
  return total / 0.875;
}

void main() {
  vec2 wp = v_world_pos;
  float is_haze = step(0.5, u_mode);  // 1.0 when haze, 0.0 when shadow

  // Cloud scale: 1 fBm unit ~= 128 world px — big, soft, world-scale blobs.
  float cloud_scale = 1.0 / 128.0;

  // Slow horizontal drift; fBm is sampled at (world + drift). Vertical drift
  // is ~40% of horizontal for a gentle diagonal feel.
  float drift_x = u_drift_speed * u_time_sec;
  float drift_y = u_drift_speed * u_time_sec * 0.38;
  vec2 sample_pos = (wp + vec2(drift_x, drift_y)) * cloud_scale;

  float fbm_val = fbm3(sample_pos);

  // Threshold to a soft blob mask, scaled by coverage. Higher coverage =>
  // lower threshold => more of the fBm triggers the veil. Haze uses gentler
  // threshold spans (fills more of the frame) but a far lower max alpha.
  float cov = clamp(u_coverage, 0.0, 1.0);
  float span_hi = mix(0.55, 0.72, is_haze);
  float span_lo = mix(0.80, 0.95, is_haze);
  float thresh_hi = 1.0 - cov * span_hi;  // top quantization tier
  float thresh_lo = 1.0 - cov * span_lo;  // lower quantization tier

  // Quantize: step() gives crisp 0/1 — pixel-art friendly, no smooth gradient.
  float is_hi = step(thresh_hi, fbm_val);
  float is_lo = step(thresh_lo, fbm_val) * (1.0 - is_hi);

  // Max alpha: shadow <=0.14, haze <=0.12 (a whisper of warm mist).
  float alpha_hi = mix(0.14, 0.12, is_haze) * cov;
  float alpha_lo = mix(0.08, 0.06, is_haze) * cov;

  float overlay_alpha = is_hi * alpha_hi + is_lo * alpha_lo;

  // ── Soft radial vignette (optional; quantized) ────────────────────────────
  // Darken/lift toward u_color in the screen corners. Radius in NDC (screen)
  // space so it hugs the frame, not the world. Quantized to 2 tiers to stay
  // pixel-art crisp rather than a smooth gradient ramp.
  float vig = clamp(u_vignette, 0.0, 1.0);
  if (vig > 0.0) {
    float radius = length(v_ndc);  // 0 at center, ~1.41 at corners
    float vig_hi = step(1.05, radius);              // deep corners
    float vig_lo = step(0.78, radius) * (1.0 - vig_hi);
    float vig_alpha = (vig_hi * 0.10 + vig_lo * 0.05) * vig;
    overlay_alpha = overlay_alpha + vig_alpha;
  }

  // Premultiplied source-over output (no colour literal — u_color is a
  // uniform sourced from a named palette-role constant via rgbOf). When
  // overlay_alpha is zero this naturally evaluates to fully transparent
  // black with no special early-exit branch needed.
  vec3 rgb = u_color * overlay_alpha;
  o_color = vec4(rgb, overlay_alpha);
}
