#version 300 es
// water.frag.glsl — ported from ../../webgpu/shaders/water.wgsl. Read that file's header comment
// for the task history (value-noise UV-warp, shore FX added-then-removed, depth gradient).
//
// IMPORTANT — ported "as is", including its dormant plumbing: the fragment math below reads only
// u_time, u_swellAlpha, u_deepColor, u_shallowColor, u_glintColor. Everything else declared here
// (u_scroll, u_tileSize, u_useLinear, u_foamColor, u_causticsColor, u_depthParams, u_waterTex,
// u_depthMask) mirrors fields/resources the WGSL original still threads through WaterPass and binds,
// but which its own fs_main never reads either — the shore-FX pass (foam/caustics/depth blend) was
// removed and never reconnected. This is a straight backend port, not a feature change, so those
// stay declared-but-unused here too (a GLSL linker may optimize them away entirely — expected, not
// a bug; see WaterPass for how the TS side guards a null uniform location).
precision mediump float;

uniform float u_time;
uniform float u_swellAlpha;
uniform vec4 u_deepColor;
uniform vec4 u_shallowColor;
uniform vec4 u_glintColor;

// Dormant plumbing (see header comment) — declared for parity with the WGSL original.
uniform vec4 u_scroll;       // scrollX, scrollY, swellScrollX, swellScrollY
uniform float u_tileSize;
uniform float u_useLinear;
uniform vec4 u_foamColor;
uniform vec4 u_causticsColor;
uniform vec4 u_depthParams;  // worldWidthPx, worldHeightPx, tilePx, _pad0
uniform sampler2D u_waterTex;
uniform sampler2D u_depthMask;

in vec2 v_worldPos;
out vec4 o_color;

// ── Hash helpers ─────────────────────────────────────────────────────────────────────────────────
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// ── Value-noise helpers ──────────────────────────────────────────────────────────────────────────
float noiseHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 fr = fract(p);
  // Cubic Hermite interpolation (avoids a harsh crease that would read as a seam at low zoom).
  vec2 u = fr * fr * (3.0 - 2.0 * fr);
  float a = noiseHash(i + vec2(0.0, 0.0));
  float b = noiseHash(i + vec2(1.0, 0.0));
  float c2 = noiseHash(i + vec2(0.0, 1.0));
  float d = noiseHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c2, d, u.x), u.y);
}

void main() {
  vec2 p = v_worldPos;
  float t = u_time;

  // ── Value-noise UV-warp ────────────────────────────────────────────────────────────────────────
  float noiseScale = 1.0 / 80.0;
  float noiseAnim = t * 0.12;
  float nX = valueNoise(p * noiseScale + vec2(noiseAnim, 0.0));
  float nY = valueNoise(p * noiseScale + vec2(0.0, noiseAnim * 0.7));
  vec2 warp = (vec2(nX, nY) - 0.5) * 6.0;
  vec2 pWarped = p + warp;

  // ── Ripples ────────────────────────────────────────────────────────────────────────────────────
  float r1 = sin(pWarped.x * 0.060 + pWarped.y * 0.028 + t * 0.90);
  float r2 = sin(pWarped.x * 0.017 - pWarped.y * 0.049 + t * 0.55);
  float ripple = (r1 + r2) * 0.5;

  // ── Base color ─────────────────────────────────────────────────────────────────────────────────
  float crest = clamp(0.22 + 0.22 * ripple + u_swellAlpha, 0.0, 1.0);
  vec3 col = mix(u_deepColor.rgb, u_shallowColor.rgb, crest);

  // ── Glints ─────────────────────────────────────────────────────────────────────────────────────
  float cell2 = 22.0;
  vec2 pg = pWarped + vec2(t * 3.5, t * 1.7);
  vec2 glintId = floor(pg / cell2);
  float gh = hash21(glintId);
  float lit = step(0.93, gh);
  float tw = max(0.0, sin(t * 1.7 + gh * 40.0));
  vec2 gLocal = fract(pg / cell2) - vec2(0.5, 0.5);
  float spark = smoothstep(0.34, 0.0, length(gLocal));
  float glint = lit * tw * spark * 0.85;
  col = mix(col, u_glintColor.rgb, glint);

  // Opaque base (the world rect floor).
  o_color = vec4(col, 1.0);
}
